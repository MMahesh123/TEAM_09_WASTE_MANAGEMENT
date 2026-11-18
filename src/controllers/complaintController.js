
const db = require('../config/db');
const { recordAuditEvent } = require('../services/auditService');
const { autoGroupComplaint } = require('../services/issueGroupingService');

const VALID_STATUSES = ['Pending', 'In-Progress', 'Resolved'];

const isCitizen = (req) => req.user?.role === 'Citizen';

const isValidId = (id) =>
    typeof id === 'string' &&
    /^[1-9]\d*$/.test(id) &&
    Number.isSafeInteger(Number(id));

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

// GET all complaints
// Citizens see only their own complaints.
exports.getComplaints = async (req, res, next) => {
    try {
        const { ward, status } = req.query;

        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value.'
            });
        }

        let query = `
            SELECT
                c.*,
                u.username AS citizen_name,
                u.email AS citizen_email
            FROM complaints c
            LEFT JOIN users u ON c.user_id = u.user_id
            WHERE 1=1
        `;

        const params = [];

        if (isCitizen(req)) {
            query += ' AND c.user_id = ?';
            params.push(req.user.userId);
        }

        if (ward) {
            query += ' AND c.ward = ?';
            params.push(ward);
        }

        if (status) {
            query += ' AND c.status = ?';
            params.push(status);
        }

        query += ' ORDER BY c.created_at DESC';

        const [rows] = await db.query(query, params);

        return res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (error) {
        return next(error);
    }
};

// GET a single complaint
exports.getComplaintById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid complaint ID.'
            });
        }

        let query = `
            SELECT
                c.*,
                u.username AS citizen_name,
                u.email AS citizen_email
            FROM complaints c
            LEFT JOIN users u ON c.user_id = u.user_id
            WHERE c.id = ?
        `;

        const params = [id];

        if (isCitizen(req)) {
            query += ' AND c.user_id = ?';
            params.push(req.user.userId);
        }

        const [rows] = await db.query(query, params);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Complaint not found.'
            });
        }

        return res.status(200).json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        return next(error);
    }
};

// CREATE a complaint
// Automatically groups the complaint after successful registration.
exports.createComplaint = async (req, res, next) => {
    try {
        const { ward, type, description } = req.body;

        // Always derive the user ID from the authenticated JWT.
        const userId = req.user.userId;

        const [result] = await db.query(
            `INSERT INTO complaints
                (user_id, ward, type, description, status)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, ward, type, description || '', 'Pending']
        );

        // Automatically group the newly registered complaint.
        // A grouping failure must not undo successful complaint registration.
        let groupingWarning = null;
        let groupingResult = null;

        try {
            groupingResult = await autoGroupComplaint(result.insertId);
        } catch (groupingError) {
            console.error(
                'Automatic complaint grouping failed:',
                groupingError
            );

            groupingWarning =
                'Complaint registered, but automatic grouping could not be completed.';
        }

        const [rows] = await db.query(
            `SELECT
                c.*,
                u.username AS citizen_name,
                u.email AS citizen_email
             FROM complaints c
             LEFT JOIN users u ON c.user_id = u.user_id
             WHERE c.id = ?`,
            [result.insertId]
        );

        return res.status(201).json({
            success: true,
            message: 'Complaint registered successfully',
            data: rows[0],
            grouping: groupingResult,
            groupingWarning
        });
    } catch (error) {
        return next(error);
    }
};

// UPDATE complaint status
// Only Supervisors and Admins may make final status decisions.
// Admin overrides require a reason and are audited.
exports.updateComplaintStatus = async (req, res, next) => {
    const { id } = req.params;
    const { status, reason } = req.body || {};

    if (!isValidId(id)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid complaint ID.'
        });
    }

    if (!status || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({
            success: false,
            message: 'A valid status is required.',
            validStatuses: VALID_STATUSES
        });
    }

    const isAdmin = req.user.role === 'Admin';

    if (
        isAdmin &&
        (
            typeof reason !== 'string' ||
            !reason.trim() ||
            reason.trim().length > 1000
        )
    ) {
        return res.status(400).json({
            success: false,
            message: 'Admin overrides require a reason of at most 1000 characters.'
        });
    }

    if (
        reason !== undefined &&
        reason !== null &&
        (typeof reason !== 'string' || reason.length > 1000)
    ) {
        return res.status(400).json({
            success: false,
            message: 'Reason must be text of at most 1000 characters.'
        });
    }

    try {
        const result = await withTransaction(async (conn) => {
            // Lock the complaint during the status decision.
            const [rows] = await conn.query(
                'SELECT * FROM complaints WHERE id = ? FOR UPDATE',
                [id]
            );

            if (rows.length === 0) {
                throw new HttpError(404, 'Complaint not found.');
            }

            const current = rows[0];

            // No-op updates do not need an audit event.
            if (current.status === status) {
                return {
                    complaint: current,
                    unchanged: true
                };
            }

            await conn.query(
                'UPDATE complaints SET status = ? WHERE id = ?',
                [status, id]
            );

            // Audit entry uses the same transaction connection.
            await recordAuditEvent({
                actor: req.user,
                action: isAdmin
                    ? 'COMPLAINT_STATUS_OVERRIDE'
                    : 'COMPLAINT_STATUS_UPDATED',
                entityType: 'complaint',
                entityId: id,
                oldValues: {
                    status: current.status
                },
                newValues: {
                    status
                },
                reason: isAdmin
                    ? reason.trim()
                    : (reason?.trim() || null),
                metadata: {
                    isOverride: isAdmin
                },
                executor: conn
            });

            const [updatedRows] = await conn.query(
                'SELECT * FROM complaints WHERE id = ?',
                [id]
            );

            return {
                complaint: updatedRows[0],
                unchanged: false
            };
        });

        return res.status(200).json({
            success: true,
            message: result.unchanged
                ? `Complaint ${id} already has status ${status}.`
                : `Complaint ${id} status updated to ${status}`,
            data: result.complaint
        });
    } catch (error) {
        if (error instanceof HttpError) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }

        return next(error);
    }
};
