const db = require('../config/db');

exports.getAllVehicles = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM vehicles');
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createVehicle = async (req, res) => {
    const { registration_number, capacity_tons, status } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO vehicles (registration_number, capacity_tons, status) VALUES (?, ?, ?)',
            [registration_number, capacity_tons, status || 'Available']
        );
        res.status(201).json({ message: 'Vehicle created successfully', vehicleId: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateVehicleStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        await db.query('UPDATE vehicles SET status = ? WHERE id = ?', [status, id]);
        res.status(200).json({ message: 'Vehicle status updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};