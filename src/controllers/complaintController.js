// Citizen Complaints Controller with Database Integration
const db = require('../config/db');

const VALID_STATUSES = ['Pending', 'In-Progress', 'Resolved'];

exports.getComplaints = async (req, res, next) => {
    try {
        const { ward, status } = req.query;

        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value.'
            });
        }

        let query = 'SELECT * FROM complaints WHERE 1=1';
        const params = [];

        if (ward) {
            query += ' AND ward = ?';
            params.push(ward);
        }

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        const [rows] = await db.query(query, params);

        return res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (error) {
        next(error);
    }
};

exports.createComplaint = async (req, res, next) => {
    try {
        const { ward, type, description } = req.body;

        const [result] = await db.query(
            'INSERT INTO complaints (ward, type, description, status) VALUES (?, ?, ?, ?)',
            [ward, type, description || '', 'Pending']
        );

        const [rows] = await db.query(
            'SELECT * FROM complaints WHERE id = ?',
            [result.insertId]
        );

        return res.status(201).json({
            success: true,
            message: 'Complaint registered successfully',
            data: rows[0]
        });
    } catch (error) {
        next(error);
    }
};

exports.updateComplaintStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !VALID_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'A valid status is required.',
                validStatuses: VALID_STATUSES
            });
        }

        const [result] = await db.query(
            'UPDATE complaints SET status = ? WHERE id = ?',
            [status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Complaint not found.'
            });
        }

        const [rows] = await db.query(
            'SELECT * FROM complaints WHERE id = ?',
            [id]
        );

        return res.status(200).json({
            success: true,
            message: `Complaint ${id} status updated to ${status}`,
            data: rows[0]
        });
    } catch (error) {
        next(error);
    }
};

// Get single complaint by ID
exports.getComplaintById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            'SELECT * FROM complaints WHERE id = ?',
            [id]
        );

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
        next(error);
    }
};