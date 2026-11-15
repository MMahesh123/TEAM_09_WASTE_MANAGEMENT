const db = require('../config/db');

const isValidId = (id) => /^\d+$/.test(String(id)) && Number(id) > 0;

// GET /api/wards
exports.getAllWards = async (req, res, next) => {
    try {
        const [rows] = await db.query('SELECT * FROM wards ORDER BY id ASC');
        res.status(200).json(rows);
    } catch (error) {
        next(error);
    }
};

// GET /api/wards/:id
exports.getWardById = async (req, res, next) => {
    const { id } = req.params;
    if (!isValidId(id)) {
        return res.status(400).json({ error: 'Invalid ward ID.' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM wards WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Ward not found.' });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        next(error);
    }
};

// POST /api/wards
exports.createWard = async (req, res, next) => {
    const { ward_number, ward_name, zone } = req.body;

    if (
        !ward_number || String(ward_number).trim() === '' ||
        !ward_name || String(ward_name).trim() === '' ||
        !zone || String(zone).trim() === ''
    ) {
        return res.status(400).json({ error: 'ward_number, ward_name, and zone are required.' });
    }

    const cleanNumber = String(ward_number).trim().toUpperCase();
    const cleanName = String(ward_name).trim();
    const cleanZone = String(zone).trim();

    try {
        const [existing] = await db.query(
            'SELECT id FROM wards WHERE ward_number = ?',
            [cleanNumber]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Ward with this ward_number already exists.' });
        }

        const [result] = await db.query(
            'INSERT INTO wards (ward_number, ward_name, zone) VALUES (?, ?, ?)',
            [cleanNumber, cleanName, cleanZone]
        );

        res.status(201).json({
            message: 'Ward created successfully.',
            wardId: result.insertId,
            ward: {
                id: result.insertId,
                ward_number: cleanNumber,
                ward_name: cleanName,
                zone: cleanZone
            }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ward with this ward_number already exists.' });
        }
        next(error);
    }
};

// PUT /api/wards/:id
exports.updateWard = async (req, res, next) => {
    const { id } = req.params;
    const { ward_number, ward_name, zone } = req.body;

    if (!isValidId(id)) {
        return res.status(400).json({ error: 'Invalid ward ID.' });
    }

    if (
        !ward_number || String(ward_number).trim() === '' ||
        !ward_name || String(ward_name).trim() === '' ||
        !zone || String(zone).trim() === ''
    ) {
        return res.status(400).json({ error: 'ward_number, ward_name, and zone are required.' });
    }

    const cleanNumber = String(ward_number).trim().toUpperCase();
    const cleanName = String(ward_name).trim();
    const cleanZone = String(zone).trim();

    try {
        const [rows] = await db.query('SELECT id FROM wards WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Ward not found.' });
        }

        const [duplicate] = await db.query(
            'SELECT id FROM wards WHERE ward_number = ? AND id != ?',
            [cleanNumber, id]
        );
        if (duplicate.length > 0) {
            return res.status(409).json({ error: 'Another ward already uses this ward_number.' });
        }

        await db.query(
            'UPDATE wards SET ward_number = ?, ward_name = ?, zone = ? WHERE id = ?',
            [cleanNumber, cleanName, cleanZone, id]
        );

        res.status(200).json({
            message: 'Ward updated successfully.',
            ward: {
                id: Number(id),
                ward_number: cleanNumber,
                ward_name: cleanName,
                zone: cleanZone
            }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Another ward already uses this ward_number.' });
        }
        next(error);
    }
};

// DELETE /api/wards/:id
exports.deleteWard = async (req, res, next) => {
    const { id } = req.params;

    if (!isValidId(id)) {
        return res.status(400).json({ error: 'Invalid ward ID.' });
    }

    try {
        const [rows] = await db.query('SELECT id FROM wards WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Ward not found.' });
        }

        await db.query('DELETE FROM wards WHERE id = ?', [id]);
        res.status(200).json({ message: 'Ward deleted successfully.', id: Number(id) });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({
                error: 'Cannot delete ward because it is referenced by existing assignments or complaints.'
            });
        }
        next(error);
    }
};