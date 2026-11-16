// Waste Collection Logging Controller (WMS-F-007 / WMS-F-008)
const db = require('../config/db');
const { parsePositiveInt, isValidISODate } = require('../utils/inputValidators');
const { WASTE_TYPES } = require('../middleware/validateCollection');

// Collection can only be logged against a shift that is still running or about to.
const LOGGABLE_ASSIGNMENT_STATUSES = ['Scheduled', 'In-Progress'];

const COLLECTION_SELECT = `
    SELECT c.log_id, c.assignment_id, c.worker_id, u.username AS worker_name,
           a.vehicle_id, a.ward_id, w.ward_name,
           c.waste_type, c.waste_tons,
           DATE_FORMAT(c.collected_at, '%Y-%m-%d') AS collected_at,
           c.notes, c.created_at
    FROM collection_logs c
    JOIN assignments a ON a.id = c.assignment_id
    JOIN users u ON u.user_id = c.worker_id
    JOIN wards w ON w.id = a.ward_id`;

const isStaff = (user) => user.role === 'Admin' || user.role === 'Supervisor';

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// mysql2 returns DECIMAL columns as strings.
const normalise = (row) => ({ ...row, waste_tons: Number(row.waste_tons) });

// POST /api/collections
exports.createCollection = async (req, res, next) => {
    try {
        const { assignmentId, wasteType, wasteTons, notes } = req.collectionInput;

        const [assignments] = await db.query(
            `SELECT a.id, a.worker_id, a.status,
                    DATE_FORMAT(a.shift_date, '%Y-%m-%d') AS shift_date,
                    v.capacity_tons
             FROM assignments a
             JOIN vehicles v ON v.id = a.vehicle_id
             WHERE a.id = ?`,
            [assignmentId]
        );

        // WMS-F-007 / TC-COL-01: no valid assignment, no collection record.
        if (assignments.length === 0) return fail(res, 404, 'Assignment not found.');
        const assignment = assignments[0];

        if (!isStaff(req.user) && assignment.worker_id !== req.user.userId) {
            return fail(res, 403, 'You can only log collection for your own assignments.');
        }
        if (!LOGGABLE_ASSIGNMENT_STATUSES.includes(assignment.status)) {
            return fail(res, 400, `Cannot log collection for a ${assignment.status} assignment.`);
        }
        if (assignment.capacity_tons !== null && wasteTons > Number(assignment.capacity_tons)) {
            return fail(
                res,
                400,
                `waste_tons (${wasteTons}) exceeds the vehicle capacity of ${Number(assignment.capacity_tons)} tons.`
            );
        }

        // The worker and date always come from the assignment, never from the request body.
        const [result] = await db.query(
            `INSERT INTO collection_logs (assignment_id, worker_id, waste_type, waste_tons, collected_at, notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [assignmentId, assignment.worker_id, wasteType, wasteTons, assignment.shift_date, notes]
        );

        const [rows] = await db.query(`${COLLECTION_SELECT} WHERE c.log_id = ?`, [result.insertId]);

        return res.status(201).json({
            success: true,
            message: 'Collection recorded successfully',
            data: normalise(rows[0])
        });
    } catch (error) {
        return next(error);
    }
};

// GET /api/collections
exports.getCollections = async (req, res, next) => {
    try {
        const { assignment_id, worker_id, waste_type, from, to } = req.query;
        const conditions = [];
        const params = [];

        if (assignment_id !== undefined) {
            const id = parsePositiveInt(assignment_id);
            if (!id) return fail(res, 400, 'assignment_id must be a positive integer.');
            conditions.push('c.assignment_id = ?');
            params.push(id);
        }
        if (waste_type !== undefined) {
            if (!WASTE_TYPES.includes(waste_type)) return fail(res, 400, 'Invalid waste_type value.');
            conditions.push('c.waste_type = ?');
            params.push(waste_type);
        }
        if (from !== undefined) {
            if (!isValidISODate(from)) return fail(res, 400, 'from must be YYYY-MM-DD.');
            conditions.push('c.collected_at >= ?');
            params.push(from);
        }
        if (to !== undefined) {
            if (!isValidISODate(to)) return fail(res, 400, 'to must be YYYY-MM-DD.');
            conditions.push('c.collected_at <= ?');
            params.push(to);
        }
        if (from !== undefined && to !== undefined && from > to) {
            return fail(res, 400, 'from must not be after to.');
        }

        if (isStaff(req.user)) {
            if (worker_id !== undefined) {
                const id = parsePositiveInt(worker_id);
                if (!id) return fail(res, 400, 'worker_id must be a positive integer.');
                conditions.push('c.worker_id = ?');
                params.push(id);
            }
        } else {
            conditions.push('c.worker_id = ?');
            params.push(req.user.userId);
        }

        const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
        const [rows] = await db.query(
            `${COLLECTION_SELECT}${where} ORDER BY c.collected_at DESC, c.log_id DESC`,
            params
        );

        const data = rows.map(normalise);
        const totalTons = Math.round(data.reduce((sum, r) => sum + r.waste_tons, 0) * 100) / 100;

        return res.status(200).json({ success: true, count: data.length, totalTons, data });
    } catch (error) {
        return next(error);
    }
};

// GET /api/collections/:id
exports.getCollectionById = async (req, res, next) => {
    try {
        const id = parsePositiveInt(req.params.id);
        if (!id) return fail(res, 400, 'Invalid collection id.');

        const [rows] = await db.query(`${COLLECTION_SELECT} WHERE c.log_id = ?`, [id]);
        if (rows.length === 0) return fail(res, 404, 'Collection record not found.');

        if (!isStaff(req.user) && rows[0].worker_id !== req.user.userId) {
            return fail(res, 403, 'You can only view your own collection records.');
        }

        return res.status(200).json({ success: true, data: normalise(rows[0]) });
    } catch (error) {
        return next(error);
    }
};
