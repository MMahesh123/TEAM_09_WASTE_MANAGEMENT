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

    // 1. Input Validation
    if (!ward_number || !ward_name) {
        return res.status(400).json({ error: "Ward number and ward name are required." });
    }

    try {
        // 2. Check for duplicate ward number
        const [existing] = await db.query('SELECT * FROM wards WHERE ward_number = ?', [ward_number]);
        if (existing.length > 0) {
            return res.status(409).json({ error: "Duplicate error: A ward with this ward number already exists." });
        }

        const [result] = await db.query(
            'INSERT INTO wards (ward_number, ward_name, zone) VALUES (?, ?, ?)',
            [ward_number, ward_name, zone]
        );
        res.status(201).json({ message: 'Ward added successfully', wardId: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};