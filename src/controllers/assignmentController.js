// Vehicle & Staff Shift Assignment Controller (WMS-F-006)
const db = require('../config/db');
const { parsePositiveInt, isValidISODate } = require('../utils/inputValidators');
const { ASSIGNMENT_STATUSES, SHIFTS } = require('../middleware/validateAssignment');

// Vehicles in these states cannot be put on a shift.
const UNASSIGNABLE_VEHICLE_STATUSES = ['Maintenance', 'Inactive'];

// Allowed status changes. Completed and Cancelled are final.
const TRANSITIONS = {
    Scheduled: ['In-Progress', 'Cancelled'],
    'In-Progress': ['Completed', 'Cancelled'],
    Completed: [],
    Cancelled: []
};

// Workers may only move their own shift forward; cancelling is a supervisor decision.
const WORKER_ALLOWED_STATUSES = ['In-Progress', 'Completed'];

const ASSIGNMENT_SELECT = `
    SELECT a.id, a.vehicle_id, v.registration_number,
           a.worker_id, u.username AS worker_name,
           a.ward_id, w.ward_name,
           DATE_FORMAT(a.shift_date, '%Y-%m-%d') AS shift_date,
           a.shift, a.status, a.created_by, a.created_at
    FROM assignments a
    JOIN vehicles v ON v.id = a.vehicle_id
    JOIN users u ON u.user_id = a.worker_id
    JOIN wards w ON w.id = a.ward_id`;

const isStaff = (user) => user.role === 'Admin' || user.role === 'Supervisor';

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// Thrown inside a transaction to roll back and answer with a specific status code.
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

// Puts a vehicle back to Available once it has no live assignments left.
async function releaseVehicleIfIdle(conn, vehicleId) {
    await conn.query(
        `UPDATE vehicles SET status = 'Available'
         WHERE id = ? AND status = 'Assigned'
           AND NOT EXISTS (
               SELECT 1 FROM assignments
               WHERE vehicle_id = ? AND status IN ('Scheduled', 'In-Progress')
           )`,
        [vehicleId, vehicleId]
    );
}

// GET /api/assignments
exports.getAssignments = async (req, res, next) => {
    try {
        const { shift_date, shift, status, ward_id, vehicle_id, worker_id } = req.query;
        const conditions = [];
        const params = [];

        if (shift_date !== undefined) {
            if (!isValidISODate(shift_date)) return fail(res, 400, 'shift_date must be YYYY-MM-DD.');
            conditions.push('a.shift_date = ?');
            params.push(shift_date);
        }
        if (shift !== undefined) {
            if (!SHIFTS.includes(shift)) return fail(res, 400, 'Invalid shift value.');
            conditions.push('a.shift = ?');
            params.push(shift);
        }
        if (status !== undefined) {
            if (!ASSIGNMENT_STATUSES.includes(status)) return fail(res, 400, 'Invalid status value.');
            conditions.push('a.status = ?');
            params.push(status);
        }
        for (const [key, raw] of [['ward_id', ward_id], ['vehicle_id', vehicle_id]]) {
            if (raw === undefined) continue;
            const id = parsePositiveInt(raw);
            if (!id) return fail(res, 400, `${key} must be a positive integer.`);
            conditions.push(`a.${key} = ?`);
            params.push(id);
        }

        if (isStaff(req.user)) {
            if (worker_id !== undefined) {
                const id = parsePositiveInt(worker_id);
                if (!id) return fail(res, 400, 'worker_id must be a positive integer.');
                conditions.push('a.worker_id = ?');
                params.push(id);
            }
        } else {
            // Workers only ever see their own shifts.
            conditions.push('a.worker_id = ?');
            params.push(req.user.userId);
        }

        const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
        const [rows] = await db.query(
            `${ASSIGNMENT_SELECT}${where} ORDER BY a.shift_date DESC, a.id DESC`,
            params
        );

        return res.status(200).json({ success: true, count: rows.length, data: rows });
    } catch (error) {
        return next(error);
    }
};

// GET /api/assignments/:id
exports.getAssignmentById = async (req, res, next) => {
    try {
        const id = parsePositiveInt(req.params.id);
        if (!id) return fail(res, 400, 'Invalid assignment id.');

        const [rows] = await db.query(`${ASSIGNMENT_SELECT} WHERE a.id = ?`, [id]);
        if (rows.length === 0) return fail(res, 404, 'Assignment not found.');

        if (!isStaff(req.user) && rows[0].worker_id !== req.user.userId) {
            return fail(res, 403, 'You can only view your own assignments.');
        }

        return res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
        return next(error);
    }
};

// POST /api/assignments
exports.createAssignment = async (req, res, next) => {
    const { vehicleId, workerId, wardId, shiftDate, shift } = req.assignmentInput;

    try {
        const assignment = await withTransaction(async (conn) => {
            // Lock the vehicle row so two supervisors cannot book it at the same time.
            const [vehicles] = await conn.query(
                'SELECT id, status FROM vehicles WHERE id = ? FOR UPDATE',
                [vehicleId]
            );
            if (vehicles.length === 0) throw new HttpError(404, 'Vehicle not found.');
            if (UNASSIGNABLE_VEHICLE_STATUSES.includes(vehicles[0].status)) {
                throw new HttpError(400, `Vehicle is under ${vehicles[0].status} and cannot be assigned.`);
            }

            const [workers] = await conn.query(
                'SELECT user_id, role FROM users WHERE user_id = ?',
                [workerId]
            );
            if (workers.length === 0) throw new HttpError(404, 'Worker not found.');
            if (workers[0].role !== 'Worker') {
                throw new HttpError(400, 'worker_id must belong to a user with the Worker role.');
            }

            const [wards] = await conn.query('SELECT id FROM wards WHERE id = ?', [wardId]);
            if (wards.length === 0) throw new HttpError(404, 'Ward not found.');

            const [conflicts] = await conn.query(
                `SELECT vehicle_id, worker_id FROM assignments
                 WHERE shift_date = ? AND shift = ? AND status <> 'Cancelled'
                   AND (vehicle_id = ? OR worker_id = ?)`,
                [shiftDate, shift, vehicleId, workerId]
            );
            if (conflicts.some((c) => c.vehicle_id === vehicleId)) {
                throw new HttpError(409, 'This vehicle is already assigned for that date and shift.');
            }
            if (conflicts.length > 0) {
                throw new HttpError(409, 'This worker is already assigned for that date and shift.');
            }

            const [result] = await conn.query(
                `INSERT INTO assignments (vehicle_id, worker_id, ward_id, shift_date, shift, status, created_by)
                 VALUES (?, ?, ?, ?, ?, 'Scheduled', ?)`,
                [vehicleId, workerId, wardId, shiftDate, shift, req.user.userId || null]
            );

            await conn.query("UPDATE vehicles SET status = 'Assigned' WHERE id = ?", [vehicleId]);

            const [rows] = await conn.query(`${ASSIGNMENT_SELECT} WHERE a.id = ?`, [result.insertId]);
            return rows[0];
        });

        return res.status(201).json({
            success: true,
            message: 'Assignment created successfully',
            data: assignment
        });
    } catch (error) {
        if (error instanceof HttpError) return fail(res, error.status, error.message);
        // Backstop for a race that slipped past the conflict check: the UNIQUE slot indexes.
        if (error.code === 'ER_DUP_ENTRY') {
            return fail(res, 409, 'This vehicle or worker is already assigned for that date and shift.');
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
                'SELECT id, vehicle_id, worker_id, status FROM assignments WHERE id = ? FOR UPDATE',
                [id]
            );
            if (rows.length === 0) throw new HttpError(404, 'Assignment not found.');
            const current = rows[0];

            if (!isStaff(req.user)) {
                if (current.worker_id !== req.user.userId) {
                    throw new HttpError(403, 'You can only update your own assignments.');
                }
                if (!WORKER_ALLOWED_STATUSES.includes(status)) {
                    throw new HttpError(403, 'Workers can only mark assignments In-Progress or Completed.');
                }
            }

            if (!TRANSITIONS[current.status].includes(status)) {
                throw new HttpError(400, `Cannot change status from ${current.status} to ${status}.`);
            }

            await conn.query('UPDATE assignments SET status = ? WHERE id = ?', [status, id]);

            if (status === 'Completed' || status === 'Cancelled') {
                await releaseVehicleIfIdle(conn, current.vehicle_id);
            }

            const [result] = await conn.query(`${ASSIGNMENT_SELECT} WHERE a.id = ?`, [id]);
            return result[0];
        });

        return res.status(200).json({
            success: true,
            message: `Assignment ${id} status updated to ${status}`,
            data: updated
        });
    } catch (error) {
        if (error instanceof HttpError) return fail(res, error.status, error.message);
        return next(error);
    }
};

exports.TRANSITIONS = TRANSITIONS;
