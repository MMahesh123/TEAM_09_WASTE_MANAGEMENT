const db = require('../config/db');

const ALLOWED_STATUSES = ['Available', 'Assigned', 'Active', 'Maintenance', 'Inactive'];

const normalizeStatus = (status) => {
    if (!status) return null;
    if (status === 'In Use') return 'Active';
    return status;
};

const isValidId = (id) => /^\d+$/.test(String(id)) && Number(id) > 0;

// GET /api/vehicles
exports.getAllVehicles = async (req, res, next) => {
    const statusFilter = req.query && req.query.status ? normalizeStatus(req.query.status) : null;

    if (statusFilter && !ALLOWED_STATUSES.includes(statusFilter)) {
        return res.status(400).json({
            error: `Invalid status filter. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
        });
    }

    try {
        if (statusFilter) {
            const [rows] = await db.query(
                'SELECT * FROM vehicles WHERE status = ? ORDER BY id ASC',
                [statusFilter]
            );
            return res.status(200).json(rows);
        }

        const [rows] = await db.query('SELECT * FROM vehicles ORDER BY id ASC');
        res.status(200).json(rows);
    } catch (error) {
        next(error);
    }
};

// GET /api/vehicles/:id
exports.getVehicleById = async (req, res, next) => {
    const { id } = req.params;
    if (!isValidId(id)) {
        return res.status(400).json({ error: 'Invalid vehicle ID.' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM vehicles WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Vehicle not found.' });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        next(error);
    }
};

// POST /api/vehicles
exports.createVehicle = async (req, res, next) => {
    const { registration_number, capacity_tons, status } = req.body;

    if (!registration_number || String(registration_number).trim() === '') {
        return res.status(400).json({ error: 'registration_number is required.' });
    }

    const numericCapacity = Number(capacity_tons);
    if (capacity_tons === undefined || capacity_tons === null || Number.isNaN(numericCapacity) || numericCapacity <= 0) {
        return res.status(400).json({ error: 'capacity_tons must be a positive number.' });
    }

    const initialStatus = status ? normalizeStatus(status) : 'Available';
    if (!ALLOWED_STATUSES.includes(initialStatus)) {
        return res.status(400).json({
            error: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
        });
    }

    const cleanReg = String(registration_number).trim().toUpperCase();
     if (cleanReg.length > 30) {
    return res.status(400).json({ error: 'registration_number must not exceed 30 characters.' });
}
    try {
        const [existing] = await db.query(
            'SELECT id FROM vehicles WHERE registration_number = ?',
            [cleanReg]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Vehicle with this registration_number already exists.' });
        }

        const [result] = await db.query(
            'INSERT INTO vehicles (registration_number, capacity_tons, status) VALUES (?, ?, ?)',
            [cleanReg, numericCapacity, initialStatus]
        );

        res.status(201).json({
            message: 'Vehicle created successfully.',
            vehicleId: result.insertId,
            vehicle: {
                id: result.insertId,
                registration_number: cleanReg,
                capacity_tons: numericCapacity,
                status: initialStatus
            }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Vehicle with this registration_number already exists.' });
        }
        next(error);
    }
};

// PUT /api/vehicles/:id
exports.updateVehicle = async (req, res, next) => {
    const { id } = req.params;
    const { registration_number, capacity_tons, status } = req.body;

    if (!isValidId(id)) {
        return res.status(400).json({ error: 'Invalid vehicle ID.' });
    }

    if (!registration_number || String(registration_number).trim() === '') {
        return res.status(400).json({ error: 'registration_number is required.' });
    }

    const numericCapacity = Number(capacity_tons);
    if (capacity_tons === undefined || capacity_tons === null || Number.isNaN(numericCapacity) || numericCapacity <= 0) {
        return res.status(400).json({ error: 'capacity_tons must be a positive number.' });
    }

    const normalizedStatus = status ? normalizeStatus(status) : null;
    if (normalizedStatus && !ALLOWED_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({
            error: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
        });
    }

    const cleanReg = String(registration_number).trim().toUpperCase();

    try {
        const [rows] = await db.query('SELECT * FROM vehicles WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Vehicle not found.' });
        }

        const currentVehicle = rows[0];
        const nextStatus = normalizedStatus || currentVehicle.status;

        if ((currentVehicle.status === 'Assigned' || currentVehicle.status === 'Active') &&
            (nextStatus === 'Maintenance' || nextStatus === 'Inactive')) {
            return res.status(409).json({
                error: `Cannot move vehicle to ${nextStatus} while status is ${currentVehicle.status}. Complete or cancel active assignment first.`
            });
        }

        const [duplicate] = await db.query(
            'SELECT id FROM vehicles WHERE registration_number = ? AND id != ?',
            [cleanReg, id]
        );
        if (duplicate.length > 0) {
            return res.status(409).json({ error: 'Another vehicle already uses this registration_number.' });
        }

        await db.query(
            'UPDATE vehicles SET registration_number = ?, capacity_tons = ?, status = ? WHERE id = ?',
            [cleanReg, numericCapacity, nextStatus, id]
        );

        res.status(200).json({
            message: 'Vehicle updated successfully.',
            vehicle: {
                id: Number(id),
                registration_number: cleanReg,
                capacity_tons: numericCapacity,
                status: nextStatus
            }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Another vehicle already uses this registration_number.' });
        }
        next(error);
    }
};

// PUT /api/vehicles/:id/status
exports.updateVehicleStatus = async (req, res, next) => {
    const { id } = req.params;
    const normalizedStatus = normalizeStatus(req.body.status);

    if (!isValidId(id)) {
        return res.status(400).json({ error: 'Invalid vehicle ID.' });
    }

    if (!normalizedStatus || !ALLOWED_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({
            error: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
        });
    }

    try {
        const [rows] = await db.query('SELECT id, status FROM vehicles WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Vehicle not found.' });
        }

        const currentStatus = rows[0].status;

        if ((currentStatus === 'Maintenance' || currentStatus === 'Inactive') &&
            (normalizedStatus === 'Assigned' || normalizedStatus === 'Active')) {
            return res.status(409).json({
                error: `Cannot assign or activate a vehicle currently in ${currentStatus} status.`
            });
        }

        if ((currentStatus === 'Assigned' || currentStatus === 'Active') &&
            (normalizedStatus === 'Maintenance' || normalizedStatus === 'Inactive')) {
            return res.status(409).json({
                error: `Cannot set ${normalizedStatus} while vehicle is ${currentStatus}. Complete or cancel the assignment first.`
            });
        }

        if ((currentStatus === 'Assigned' || currentStatus === 'Active') && normalizedStatus === 'Assigned') {
            return res.status(409).json({
                error: `Vehicle is already ${currentStatus} and cannot be double-assigned.`
            });
        }

        await db.query('UPDATE vehicles SET status = ? WHERE id = ?', [normalizedStatus, id]);

        res.status(200).json({
            message: 'Vehicle status updated successfully.',
            id: Number(id),
            previousStatus: currentStatus,
            status: normalizedStatus
        });
    } catch (error) {
        next(error);
    }
};

// DELETE /api/vehicles/:id
exports.deleteVehicle = async (req, res, next) => {
    const { id } = req.params;

    if (!isValidId(id)) {
        return res.status(400).json({ error: 'Invalid vehicle ID.' });
    }

    try {
        const [rows] = await db.query('SELECT id, status FROM vehicles WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Vehicle not found.' });
        }

        if (rows[0].status === 'Assigned' || rows[0].status === 'Active') {
            return res.status(409).json({
                error: `Cannot delete vehicle while status is ${rows[0].status}.`
            });
        }

        await db.query('DELETE FROM vehicles WHERE id = ?', [id]);
        res.status(200).json({ message: 'Vehicle deleted successfully.', id: Number(id) });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({
                error: 'Cannot delete vehicle because it is referenced by existing assignment records.'
            });
        }
        next(error);
    }
};