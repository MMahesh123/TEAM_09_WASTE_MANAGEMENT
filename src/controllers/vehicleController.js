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
    
    // 1. Input Validation
    if (!registration_number || !capacity_tons) {
        return res.status(400).json({ error: "Registration number and capacity in tons are required." });
    }

    try {
        // 2. Check for duplicate registration number
        const [existing] = await db.query('SELECT * FROM vehicles WHERE registration_number = ?', [registration_number]);
        if (existing.length > 0) {
            return res.status(409).json({ error: "Duplicate error: A vehicle with this registration number already exists." });
        }

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

    // 1. Validate status input
    if (!status) {
        return res.status(400).json({ error: "Status field is required for update." });
    }

    try {
        // 2. Check if the vehicle exists (404 handling)
        const [vehicle] = await db.query('SELECT * FROM vehicles WHERE id = ?', [id]);
        if (vehicle.length === 0) {
            return res.status(404).json({ error: "Vehicle not found with the provided ID." });
        }

        await db.query('UPDATE vehicles SET status = ? WHERE id = ?', [status, id]);
        res.status(200).json({ message: 'Vehicle status updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};