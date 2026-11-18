
// WMS-F-007: Collection Logging and Supervisor Verification
const db = require('../config/db');
const { parsePositiveInt, isValidISODate } = require('../utils/inputValidators');
const { WASTE_TYPES } = require('../middleware/validateCollection');
const { recordAuditEvent } = require('../services/auditService');

const LOGGABLE_ASSIGNMENT_STATUSES = ['Scheduled', 'In-Progress'];

const COLLECTION_SELECT = `
    SELECT c.log_id, c.assignment_id, c.worker_id, u.username AS worker_name,
           a.vehicle_id, a.ward_id, w.ward_name,
           c.waste_type, c.waste_tons,
           DATE_FORMAT(c.collected_at, '%Y-%m-%d') AS collected_at,
           c.notes, c.created_at,
           c.verification_status, c.accepted_tons,
           c.verified_by, c.verified_at, c.verification_reason
    FROM collection_logs c
    JOIN assignments a ON a.id = c.assignment_id
    JOIN users u ON u.user_id = c.worker_id
    JOIN wards w ON w.id = a.ward_id`;

const isStaff = (user) =>
    user.role === 'Admin' || user.role === 'Supervisor';

const fail = (res, status, message) =>
    res.status(status).json({ success: false, message });

const normalise = (row) => ({
    ...row,
    waste_tons: Number(row.waste_tons),
    accepted_tons: row.accepted_tons == null
        ? null
        : Number(row.accepted_tons)
});

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function withTransaction(work) {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();
        const result = await work(conn);
        await conn.commit();
        return result;
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

// POST /api/collections
exports.createCollection = async (req, res, next) => {
    try {
        const {
            assignmentId,
            wasteType,
            wasteTons,
            notes
        } = req.collectionInput;

        const collection = await withTransaction(async (conn) => {

            // Lock assignment while validating and recording collection.
            const [assignments] = await conn.query(
                `SELECT a.id, a.worker_id, a.status,
                        DATE_FORMAT(a.shift_date, '%Y-%m-%d') AS shift_date,
                        v.capacity_tons
                 FROM assignments a
                 JOIN vehicles v ON v.id = a.vehicle_id
                 WHERE a.id = ?
                 FOR UPDATE`,
                [assignmentId]
            );

            if (assignments.length === 0) {
                throw new HttpError(404, 'Assignment not found.');
            }

            const assignment = assignments[0];

            // Workers can only record their own assignments.
            if (
                !isStaff(req.user) &&
                Number(assignment.worker_id) !== Number(req.user.userId)
            ) {
                throw new HttpError(
                    403,
                    'You can only log collection for your own assignments.'
                );
            }

            // Only active assignments can receive collection logs.
            if (!LOGGABLE_ASSIGNMENT_STATUSES.includes(assignment.status)) {
                throw new HttpError(
                    400,
                    `Cannot log collection for a ${assignment.status} assignment.`
                );
            }

            // Validate recorded quantity against vehicle capacity.
            if (
                assignment.capacity_tons !== null &&
                wasteTons > Number(assignment.capacity_tons)
            ) {
                throw new HttpError(
                    400,
                    `waste_tons (${wasteTons}) exceeds the vehicle capacity of ${Number(assignment.capacity_tons)} tons.`
                );
            }

            // Insert collection record.
            const [result] = await conn.query(
                `INSERT INTO collection_logs
                 (assignment_id, worker_id, waste_type, waste_tons, collected_at, notes)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    assignmentId,
                    assignment.worker_id,
                    wasteType,
                    wasteTons,
                    assignment.shift_date,
                    notes
                ]
            );

            // Audit collection creation in the same transaction.
            await recordAuditEvent({
                actor: {
                    userId: req.user.userId,
                    role: req.user.role
                },
                action: 'COLLECTION_CREATED',
                entityType: 'collection_log',
                entityId: result.insertId,
                oldValues: null,
                newValues: {
                    assignmentId,
                    workerId: assignment.worker_id,
                    wasteType,
                    wasteTons,
                    collectedAt: assignment.shift_date,
                    verificationStatus: 'Pending'
                },
                metadata: {
                    assignmentStatus: assignment.status,
                    vehicleCapacity: assignment.capacity_tons
                },
                executor: conn
            });

            // Fetch the newly created collection.
            const [rows] = await conn.query(
                `${COLLECTION_SELECT} WHERE c.log_id = ?`,
                [result.insertId]
            );

            return normalise(rows[0]);
        });

        return res.status(201).json({
            success: true,
            message: 'Collection recorded successfully',
            data: collection
        });

    } catch (error) {
        if (error instanceof HttpError) {
            return fail(res, error.status, error.message);
        }

        return next(error);
    }
};

// GET /api/collections
exports.getCollections = async (req, res, next) => {
    try {
        const {
            assignment_id,
            worker_id,
            waste_type,
            from,
            to
        } = req.query;

        const conditions = [];
        const params = [];

        if (assignment_id !== undefined) {
            const id = parsePositiveInt(assignment_id);

            if (!id) {
                return fail(res, 400, 'assignment_id must be a positive integer.');
            }

            conditions.push('c.assignment_id = ?');
            params.push(id);
        }

        if (waste_type !== undefined) {
            if (!WASTE_TYPES.includes(waste_type)) {
                return fail(res, 400, 'Invalid waste_type value.');
            }

            conditions.push('c.waste_type = ?');
            params.push(waste_type);
        }

        if (from !== undefined) {
            if (!isValidISODate(from)) {
                return fail(res, 400, 'from must be YYYY-MM-DD.');
            }

            conditions.push('c.collected_at >= ?');
            params.push(from);
        }

        if (to !== undefined) {
            if (!isValidISODate(to)) {
                return fail(res, 400, 'to must be YYYY-MM-DD.');
            }

            conditions.push('c.collected_at <= ?');
            params.push(to);
        }

        if (from !== undefined && to !== undefined && from > to) {
            return fail(res, 400, 'from must not be after to.');
        }

        if (isStaff(req.user)) {
            if (worker_id !== undefined) {
                const id = parsePositiveInt(worker_id);

                if (!id) {
                    return fail(res, 400, 'worker_id must be a positive integer.');
                }

                conditions.push('c.worker_id = ?');
                params.push(id);
            }
        } else {
            conditions.push('c.worker_id = ?');
            params.push(req.user.userId);
        }

        const where = conditions.length
            ? ` WHERE ${conditions.join(' AND ')}`
            : '';

        const [rows] = await db.query(
            `${COLLECTION_SELECT}${where} ORDER BY c.collected_at DESC, c.log_id DESC`,
            params
        );

        const data = rows.map(normalise);

        const totalTons = Math.round(
            data.reduce((sum, row) => sum + row.waste_tons, 0) * 100
        ) / 100;

        const totalAcceptedTons = Math.round(
            data.reduce((sum, row) => sum + (row.accepted_tons || 0), 0) * 100
        ) / 100;

        return res.status(200).json({
            success: true,
            count: data.length,
            totalTons,
            totalAcceptedTons,
            data
        });

    } catch (error) {
        return next(error);
    }
};

// GET /api/collections/:id
exports.getCollectionById = async (req, res, next) => {
    try {
        const id = parsePositiveInt(req.params.id);

        if (!id) {
            return fail(res, 400, 'Invalid collection id.');
        }

        const [rows] = await db.query(
            `${COLLECTION_SELECT} WHERE c.log_id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return fail(res, 404, 'Collection record not found.');
        }

        if (
            !isStaff(req.user) &&
            Number(rows[0].worker_id) !== Number(req.user.userId)
        ) {
            return fail(
                res,
                403,
                'You can only view your own collection records.'
            );
        }

        return res.status(200).json({
            success: true,
            data: normalise(rows[0])
        });

    } catch (error) {
        return next(error);
    }
};

// PATCH /api/collections/:id/verify
exports.verifyCollection = async (req, res, next) => {
    const id = parsePositiveInt(req.params.id);

    if (!id) {
        return fail(res, 400, 'Invalid collection id.');
    }

    const { acceptedTons, reason } = req.verificationInput;

    try {
        const collection = await withTransaction(async (conn) => {

            // Lock record to prevent simultaneous verification.
            const [rows] = await conn.query(
                `SELECT log_id, waste_tons, verification_status
                 FROM collection_logs
                 WHERE log_id = ?
                 FOR UPDATE`,
                [id]
            );

            if (rows.length === 0) {
                throw new HttpError(404, 'Collection record not found.');
            }

            const current = rows[0];

            if (current.verification_status !== 'Pending') {
                throw new HttpError(
                    409,
                    'This collection has already been verified.'
                );
            }

            // Compare using integer hundredths to avoid floating-point errors.
            const recordedHundredths = Math.round(
                Number(current.waste_tons) * 100
            );

            const acceptedHundredths = Math.round(acceptedTons * 100);

            if (acceptedHundredths > recordedHundredths) {
                throw new HttpError(
                    400,
                    'acceptedTons cannot exceed the recorded waste_tons.'
                );
            }

            const rejectedTons = Math.round(
                recordedHundredths - acceptedHundredths
            ) / 100;

            if (acceptedHundredths < recordedHundredths && !reason) {
                throw new HttpError(
                    400,
                    'A reason is required for partial acceptance or rejection.'
                );
            }

            const verificationStatus = acceptedHundredths === 0
                ? 'Rejected'
                : 'Approved';

            await conn.query(
                `UPDATE collection_logs
                 SET verification_status = ?,
                     accepted_tons = ?,
                     verified_by = ?,
                     verified_at = CURRENT_TIMESTAMP,
                     verification_reason = ?
                 WHERE log_id = ?`,
                [
                    verificationStatus,
                    acceptedTons,
                    req.user.userId,
                    reason,
                    id
                ]
            );

            // Audit verification in the same transaction.
            await recordAuditEvent({
                actor: {
                    userId: req.user.userId,
                    role: req.user.role
                },
                action: verificationStatus === 'Rejected'
                    ? 'COLLECTION_REJECTED'
                    : 'COLLECTION_VERIFIED',
                entityType: 'collection_log',
                entityId: id,
                oldValues: {
                    verificationStatus: current.verification_status,
                    acceptedTons: null
                },
                newValues: {
                    verificationStatus,
                    acceptedTons,
                    rejectedTons,
                    verifiedBy: req.user.userId
                },
                reason,
                metadata: {
                    recordedTons: Number(current.waste_tons),
                    partialAcceptance: acceptedHundredths > 0 &&
                        acceptedHundredths < recordedHundredths
                },
                executor: conn
            });

            const [updatedRows] = await conn.query(
                `${COLLECTION_SELECT} WHERE c.log_id = ?`,
                [id]
            );

            return normalise(updatedRows[0]);
        });

        return res.status(200).json({
            success: true,
            message: 'Collection verification completed successfully.',
            data: {
                ...collection,
                rejected_tons: Math.round(
                    (collection.waste_tons - collection.accepted_tons) * 100
                ) / 100
            }
        });

    } catch (error) {
        if (error instanceof HttpError) {
            return fail(res, error.status, error.message);
        }

        return next(error);
    }
};
