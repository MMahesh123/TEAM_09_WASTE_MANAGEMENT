const db = require('../config/db');

exports.getAllWards = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM wards');
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createWard = async (req, res) => {
    const { ward_number, ward_name, zone } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO wards (ward_number, ward_name, zone) VALUES (?, ?, ?)',
            [ward_number, ward_name, zone]
        );
        res.status(201).json({ message: 'Ward added successfully', wardId: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};