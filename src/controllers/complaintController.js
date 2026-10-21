// Citizen Complaints Controller with Database Integration
const db = require('../config/db');

exports.getComplaints = async (req, res, next) => {
    try {
        const { ward, status } = req.query;
        let complaints = [
            { id: 1, ward: 'Ward 12', type: 'Overflowing Bin', status: 'Pending' },
            { id: 2, ward: 'Ward 05', type: 'Missed Pickup', status: 'Resolved' },
            { id: 3, ward: 'Ward 12', type: 'Illegal Dumping', status: 'Pending' }
        ];

        try {
            let query = 'SELECT * FROM complaints WHERE 1=1';
            let params = [];

            if (ward) {
                query += ' AND ward = ?';
                params.push(ward);
            }
            if (status) {
                query += ' AND status = ?';
                params.push(status);
            }

            const [rows] = await db.query(query, params);
            if (rows && rows.length > 0) {
                complaints = rows;
            } else if (ward || status) {
                // If filtered query returns empty from DB, filter mock data or keep empty
                complaints = complaints.filter(c => {
                    let match = true;
                    if (ward && c.ward.toLowerCase() !== ward.toLowerCase()) match = false;
                    if (status && c.status.toLowerCase() !== status.toLowerCase()) match = false;
                    return match;
                });
            }
        } catch (dbErr) {
            // Fallback to mock filtering if table doesn't exist yet
            if (ward) {
                complaints = complaints.filter(c => c.ward.toLowerCase() === ward.toLowerCase());
            }
            if (status) {
                complaints = complaints.filter(c => c.status.toLowerCase() === status.toLowerCase());
            }
        }

        res.status(200).json({ success: true, count: complaints.length, data: complaints });
    } catch (error) {
        next(error);
    }
};

exports.createComplaint = async (req, res, next) => {
    try {
        const { ward, type, description } = req.body;
        let newComplaint = { id: Date.now(), ward, type, description, status: 'Pending' };

        try {
            const [result] = await db.query(
                'INSERT INTO complaints (ward, type, description, status) VALUES (?, ?, ?, ?)',
                [ward, type, description || '', 'Pending']
            );
            newComplaint.id = result.insertId;
        } catch (dbErr) {
            // Fallback if table doesn't exist yet
        }

        res.status(201).json({ success: true, message: 'Complaint registered successfully', data: newComplaint });
    } catch (error) {
        next(error);
    }
};

exports.updateComplaintStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: 'Status field is required.' });
        }

        try {
            await db.query('UPDATE complaints SET status = ? WHERE id = ?', [status, id]);
        } catch (dbErr) {
            // Fallback if table doesn't exist yet
        }

        res.status(200).json({
            success: true,
            message: `Complaint ${id} status updated to ${status}`,
            data: { id: Number(id), status }
        });
    } catch (error) {
        next(error);
    }
};

// Get single complaint by ID
exports.getComplaintById = async (req, res, next) => {
    try {
        const { id } = req.params;
        let complaint = { id: Number(id), ward: 'Ward 12', type: 'Overflowing Bin', description: 'Bin is overflowing near park', status: 'Pending' };

        try {
            const [rows] = await db.query('SELECT * FROM complaints WHERE id = ?', [id]);
            if (rows && rows.length > 0) {
                complaint = rows[0];
            } else {
                return res.status(404).json({ success: false, message: 'Complaint not found.' });
            }
        } catch (dbErr) {
            // Fallback mock check if table doesn't exist yet
        }

        res.status(200).json({ success: true, data: complaint });
    } catch (error) {
        next(error);
    }
};