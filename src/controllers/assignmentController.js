// Vehicle & Staff Shift Assignment Controller (WMS-F-006)
const db = require('../config/db');
const { parsePositiveInt, isValidISODate } = require('../utils/inputValidators');
const { ASSIGNMENT_STATUSES, SHIFTS } = require('../middleware/validateAssignment');
const { recordAuditEvent } = require('../services/auditService');

const UNASSIGNABLE_VEHICLE_STATUSES = ['Maintenance', 'Inactive'];

const TRANSITIONS = {
    Scheduled: ['In-Progress', 'Cancelled'],
    'In-Progress': ['Completed', 'Cancelled'],
    Completed: [],
    Cancelled: []
};

const WORKER_ALLOWED_STATUSES = ['In-Progress', 'Completed'];

const ASSIGNMENT_SELECT = `
    SELECT a.id, a.complaint_id,
           a.vehicle_id, v.registration_number,
           a.worker_id, u.username AS worker_name,
           a.ward_id, w.ward_name,
           DATE_FORMAT(a.shift_date, '%Y-%m-%d') AS shift_date,
           a.shift, a.status, a.created_by, a.created_at
    FROM assignments a
    JOIN vehicles v ON v.id = a.vehicle_id
    JOIN users u ON u.user_id = a.worker_id
    JOIN wards w ON w.id = a.ward_id`;

const isStaff = (user) =>
    user.role === 'Admin' || user.role === 'Supervisor';

const fail = (res, status, message) =>
    res.status(status).json({ success: false, message });

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
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

// Synchronize vehicle status with its remaining assignments.
async function syncVehicleStatus(conn, vehicleId) {
    const [rows] = await conn.query(
        `SELECT
            SUM(CASE WHEN status = 'In-Progress' THEN 1 ELSE 0 END)
                AS in_progress_count,
            SUM(CASE WHEN status = 'Scheduled' THEN 1 ELSE 0 END)
                AS scheduled_count
         FROM assignments
         WHERE vehicle_id = ?
           AND status IN ('Scheduled', 'In-Progress')`,
        [vehicleId]
    );

    const inProgressCount = Number(rows[0].in_progress_count || 0);
    const scheduledCount = Number(rows[0].scheduled_count || 0);

    let vehicleStatus = 'Available';

    if (inProgressCount > 0) {
        vehicleStatus = 'Active';
    } else if (scheduledCount > 0) {
        vehicleStatus = 'Assigned';
    }

    // Do not automatically reactivate vehicles under Maintenance or Inactive.
    await conn.query(
        `UPDATE vehicles
         SET status = ?
         WHERE id = ?
           AND status NOT IN ('Maintenance', 'Inactive')`,
        [vehicleStatus, vehicleId]
    );

    return vehicleStatus;
}

// GET /api/assignments
exports.getAssignments = async (req, res, next) => {
    try {
        const {
            shift_date,
            shift,
            status,
            ward_id,
            vehicle_id,
            worker_id,
            complaint_id
        } = req.query;

        const conditions = [];
        const params = [];

        if (shift_date !== undefined) {
            if (!isValidISODate(shift_date)) {
                return fail(res, 400, 'shift_date must be YYYY-MM-DD.');
            }
            conditions.push('a.shift_date = ?');
            params.push(shift_date);
        }

        if (shift !== undefined) {
            if (!SHIFTS.includes(shift)) {
                return fail(res, 400, 'Invalid shift value.');
            }
            conditions.push('a.shift = ?');
            params.push(shift);
        }

        if (status !== undefined) {
            if (!ASSIGNMENT_STATUSES.includes(status)) {
                return fail(res, 400, 'Invalid status value.');
            }
            conditions.push('a.status = ?');
            params.push(status);
        }

        for (const [key, raw] of [
            ['ward_id', ward_id],
            ['vehicle_id', vehicle_id],
            ['complaint_id', complaint_id]
        ]) {
            if (raw === undefined) continue;

            const id = parsePositiveInt(raw);
            if (!id) {
                return fail(res, 400, `${key} must be a positive integer.`);
            }

            conditions.push(`a.${key} = ?`);
            params.push(id);
        }

        if (isStaff(req.user)) {
            if (worker_id !== undefined) {
                const id = parsePositiveInt(worker_id);
                if (!id) {
                    return fail(res, 400, 'worker_id must be a positive integer.');
                }
                conditions.push('a.worker_id = ?');
                params.push(id);
            }
        } else {
            conditions.push('a.worker_id = ?');
            params.push(req.user.userId);
        }

        const where = conditions.length
            ? ` WHERE ${conditions.join(' AND ')}`
            : '';

        const [rows] = await db.query(
            `${ASSIGNMENT_SELECT}${where}
             ORDER BY a.shift_date DESC, a.id DESC`,
            params
        );

        return res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (error) {
        return next(error);
    }
};

// GET /api/assignments/:id
exports.getAssignmentById = async (req, res, next) => {
    try {
        const id = parsePositiveInt(req.params.id);
        if (!id) return fail(res, 400, 'Invalid assignment id.');

        const [rows] = await db.query(
            `${ASSIGNMENT_SELECT} WHERE a.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return fail(res, 404, 'Assignment not found.');
        }

        if (!isStaff(req.user) && rows[0].worker_id !== req.user.userId) {
            return fail(res, 403, 'You can only view your own assignments.');
        }

        return res.status(200).json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        return next(error);
    }
};

// POST /api/assignments
exports.createAssignment = async (req, res, next) => {
    const {
        vehicleId,
        workerId,
        wardId,
        complaintId,
        shiftDate,
        shift
    } = req.assignmentInput;

    try {
        const assignment = await withTransaction(async (conn) => {
            // Lock vehicle to prevent simultaneous bookings.
            const [vehicles] = await conn.query(
                'SELECT id, status FROM vehicles WHERE id = ? FOR UPDATE',
                [vehicleId]
            );

            if (vehicles.length === 0) {
                throw new HttpError(404, 'Vehicle not found.');
            }

            if (UNASSIGNABLE_VEHICLE_STATUSES.includes(vehicles[0].status)) {
                throw new HttpError(
                    400,
                    `Vehicle is under ${vehicles[0].status} and cannot be assigned.`
                );
            }

            // Validate worker.
            const [workers] = await conn.query(
                'SELECT user_id, role FROM users WHERE user_id = ?',
                [workerId]
            );

            if (workers.length === 0) {
                throw new HttpError(404, 'Worker not found.');
            }

            if (workers[0].role !== 'Worker') {
                throw new HttpError(
                    400,
                    'worker_id must belong to a user with the Worker role.'
                );
            }

            // Validate ward.
            const [wards] = await conn.query(
                'SELECT id FROM wards WHERE id = ?',
                [wardId]
            );

            if (wards.length === 0) {
                throw new HttpError(404, 'Ward not found.');
            }

            // If linked to a complaint, ensure it exists and is not resolved.
            if (complaintId !== null && complaintId !== undefined) {
                const [complaints] = await conn.query(
                    `SELECT id, status
                     FROM complaints
                     WHERE id = ?
                     FOR UPDATE`,
                    [complaintId]
                );

                if (complaints.length === 0) {
                    throw new HttpError(404, 'Linked complaint not found.');
                }

                if (complaints[0].status === 'Resolved') {
                    throw new HttpError(
                        400,
                        'A resolved complaint cannot receive a new assignment.'
                    );
                }
            }

            // Check vehicle and worker shift conflicts.
            const [conflicts] = await conn.query(
                `SELECT vehicle_id, worker_id
                 FROM assignments
                 WHERE shift_date = ?
                   AND shift = ?
                   AND status <> 'Cancelled'
                   AND (vehicle_id = ? OR worker_id = ?)`,
                [shiftDate, shift, vehicleId, workerId]
            );

            if (conflicts.some((c) => c.vehicle_id === vehicleId)) {
                throw new HttpError(
                    409,
                    'This vehicle is already assigned for that date and shift.'
                );
            }

            if (conflicts.length > 0) {
                throw new HttpError(
                    409,
                    'This worker is already assigned for that date and shift.'
                );
            }

            // Create assignment with optional complaint relationship.
            const [result] = await conn.query(
                `INSERT INTO assignments
                 (vehicle_id, worker_id, ward_id, shift_date, shift,
                  status, created_by, complaint_id)
                 VALUES (?, ?, ?, ?, ?, 'Scheduled', ?, ?)`,
                [
                    vehicleId,
                    workerId,
                    wardId,
                    shiftDate,
                    shift,
                    req.user.userId || null,
                    complaintId || null
                ]
            );

            // A scheduled assignment reserves the vehicle.
            await conn.query(
                "UPDATE vehicles SET status = 'Assigned' WHERE id = ?",
                [vehicleId]
            );

            // Fetch the created assignment.
            const [rows] = await conn.query(
                `${ASSIGNMENT_SELECT} WHERE a.id = ?`,
                [result.insertId]
            );

            const createdAssignment = rows[0];

            // Audit assignment creation in the same transaction.
            await recordAuditEvent({
                actor: {
                    userId: req.user.userId,
                    role: req.user.role
                },
                action: 'ASSIGNMENT_CREATED',
                entityType: 'assignment',
                entityId: result.insertId,
                oldValues: null,
                newValues: {
                    status: 'Scheduled',
                    vehicleId,
                    workerId,
                    wardId,
                    complaintId: complaintId || null,
                    shiftDate,
                    shift
                },
                metadata: {
                    createdBy: req.user.userId
                },
                executor: conn
            });

            return createdAssignment;
        });

        return res.status(201).json({
            success: true,
            message: 'Assignment created successfully',
            data: assignment
        });
    } catch (error) {
        if (error instanceof HttpError) {
            return fail(res, error.status, error.message);
        }

        if (error.code === 'ER_DUP_ENTRY') {
            return fail(
                res,
                409,
                'This vehicle or worker is already assigned for that date and shift.'
            );
        }

        return next(error);
    }
};

// PATCH /api/assignments/:id/status
exports.updateAssignmentStatus = async (req, res, next) => {
    const id = parsePositiveInt(req.params.id);
    if (!id) return fail(res, 400, 'Invalid assignment id.');

    const { status } = req.body;

    try {
        const updated = await withTransaction(async (conn) => {
            const [rows] = await conn.query(
                `SELECT id, vehicle_id, worker_id, complaint_id, status
                 FROM assignments
                 WHERE id = ?
                 FOR UPDATE`,
                [id]
            );

            if (rows.length === 0) {
                throw new HttpError(404, 'Assignment not found.');
            }

            const current = rows[0];

            if (!isStaff(req.user)) {
                if (current.worker_id !== req.user.userId) {
                    throw new HttpError(
                        403,
                        'You can only update your own assignments.'
                    );
                }

                if (!WORKER_ALLOWED_STATUSES.includes(status)) {
                    throw new HttpError(
                        403,
                        'Workers can only mark assignments In-Progress or Completed.'
                    );
                }
            }

            if (!TRANSITIONS[current.status].includes(status)) {
                throw new HttpError(
                    400,
                    `Cannot change status from ${current.status} to ${status}.`
                );
            }

            await conn.query(
                'UPDATE assignments SET status = ? WHERE id = ?',
                [status, id]
            );

            // When work starts, move the linked complaint from Pending to
            // In-Progress. Completing the assignment does NOT resolve the
            // complaint; a Supervisor/Admin must make that final decision.
            if (status === 'In-Progress' && current.complaint_id) {
                const [complaintRows] = await conn.query(
                    `SELECT id, status
                     FROM complaints
                     WHERE id = ?
                     FOR UPDATE`,
                    [current.complaint_id]
                );

                if (complaintRows.length === 0) {
                    throw new HttpError(404, 'Linked complaint not found.');
                }

                const complaint = complaintRows[0];

                if (complaint.status === 'Resolved') {
                    throw new HttpError(
                        409,
                        'This complaint is already resolved and its assignment cannot be started.'
                    );
                }

                if (complaint.status === 'Pending') {
                    await conn.query(
                        `UPDATE complaints
                         SET status = 'In-Progress'
                         WHERE id = ?`,
                        [current.complaint_id]
                    );

                    // Audit complaint status change in the same transaction.
                    await recordAuditEvent({
                        actor: {
                            userId: req.user.userId,
                            role: req.user.role
                        },
                        action: 'COMPLAINT_STATUS_UPDATED',
                        entityType: 'complaint',
                        entityId: current.complaint_id,
                        oldValues: {
                            status: complaint.status
                        },
                        newValues: {
                            status: 'In-Progress'
                        },
                        reason: null,
                        metadata: {
                            assignmentId: id,
                            updatedFrom: 'ASSIGNMENT_STATUS_UPDATED'
                        },
                        executor: conn
                    });
                }
            }

            // Completing an assignment deliberately leaves its complaint
            // In-Progress until a Supervisor/Admin verifies and resolves it.

            // Synchronize vehicle status after every assignment transition.
            const vehicleStatus = await syncVehicleStatus(
                conn,
                current.vehicle_id
            );

            // Record the status change in the same transaction.
            await recordAuditEvent({
                actor: {
                    userId: req.user.userId,
                    role: req.user.role
                },
                action: 'ASSIGNMENT_STATUS_UPDATED',
                entityType: 'assignment',
                entityId: id,
                oldValues: {
                    status: current.status
                },
                newValues: {
                    status,
                    vehicleStatus
                },
                metadata: {
                    workerId: current.worker_id,
                    vehicleId: current.vehicle_id
                },
                executor: conn
            });

            const [result] = await conn.query(
                `${ASSIGNMENT_SELECT} WHERE a.id = ?`,
                [id]
            );

            return result[0];
        });

        return res.status(200).json({
            success: true,
            message: `Assignment ${id} status updated to ${status}`,
            data: updated
        });
    } catch (error) {
        if (error instanceof HttpError) {
            return fail(res, error.status, error.message);
        }

        return next(error);
    }
};

exports.TRANSITIONS = TRANSITIONS;