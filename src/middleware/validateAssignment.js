const { parsePositiveInt, isValidISODate } = require('../utils/inputValidators');

const SHIFTS = ['Morning', 'Afternoon', 'Night'];
const ASSIGNMENT_STATUSES = ['Scheduled', 'In-Progress', 'Completed', 'Cancelled'];

const badRequest = (res, message, extra = {}) =>
    res.status(400).json({ success: false, message, ...extra });

// POST /api/assignments
exports.validateCreateAssignment = (req, res, next) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return badRequest(res, 'Request body must be a JSON object.');
    }

    const errors = [];
    const vehicleId = parsePositiveInt(body.vehicle_id);
    const workerId = parsePositiveInt(body.worker_id);
    const wardId = parsePositiveInt(body.ward_id);

    if (!vehicleId) errors.push('vehicle_id must be a positive integer.');
    if (!workerId) errors.push('worker_id must be a positive integer.');
    if (!wardId) errors.push('ward_id must be a positive integer.');
    if (!isValidISODate(body.shift_date)) errors.push('shift_date must be a valid date in YYYY-MM-DD format.');
    if (!SHIFTS.includes(body.shift)) errors.push(`shift must be one of: ${SHIFTS.join(', ')}.`);

    if (errors.length > 0) {
        return badRequest(res, 'Invalid assignment data.', { errors });
    }

    req.assignmentInput = {
        vehicleId,
        workerId,
        wardId,
        shiftDate: body.shift_date,
        shift: body.shift
    };
    return next();
};

// PATCH /api/assignments/:id/status
exports.validateAssignmentStatus = (req, res, next) => {
    const status = req.body && req.body.status;
    if (!ASSIGNMENT_STATUSES.includes(status)) {
        return badRequest(res, 'A valid status is required.', { validStatuses: ASSIGNMENT_STATUSES });
    }
    return next();
};

exports.SHIFTS = SHIFTS;
exports.ASSIGNMENT_STATUSES = ASSIGNMENT_STATUSES;
