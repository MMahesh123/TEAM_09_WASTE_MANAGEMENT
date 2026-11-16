const { parsePositiveInt } = require('../utils/inputValidators');

const WASTE_TYPES = ['Wet', 'Dry', 'Mixed', 'Hazardous', 'E-waste'];
const MAX_TONS = 99999999.99; // DECIMAL(10,2) upper bound
const MAX_NOTES_LENGTH = 255;

// Accepts a number or a numeric string. Blank strings, null, booleans, NaN and Infinity are rejected.
function parseTons(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
        return Number(value.trim());
    }
    return null;
}

// POST /api/collections (WMS-F-008: valid waste type and non-negative quantity)
exports.validateCollection = (req, res, next) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ success: false, message: 'Request body must be a JSON object.' });
    }

    const errors = [];
    const assignmentId = parsePositiveInt(body.assignment_id);
    const tons = parseTons(body.waste_tons);

    if (!assignmentId) errors.push('assignment_id must be a positive integer.');
    if (!WASTE_TYPES.includes(body.waste_type)) {
        errors.push(`waste_type must be one of: ${WASTE_TYPES.join(', ')}.`);
    }
    if (body.waste_tons === undefined || tons === null) {
        errors.push('waste_tons is required and must be a number.');
    } else if (tons < 0) {
        errors.push('waste_tons cannot be negative.');
    } else if (tons > MAX_TONS) {
        errors.push('waste_tons is too large.');
    } else if (Math.round(tons * 100) / 100 !== tons) {
        errors.push('waste_tons can have at most 2 decimal places.');
    }
    if (body.notes !== undefined && body.notes !== null) {
        if (typeof body.notes !== 'string' || body.notes.length > MAX_NOTES_LENGTH) {
            errors.push(`notes must be text of at most ${MAX_NOTES_LENGTH} characters.`);
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, message: 'Invalid collection data.', errors });
    }

    req.collectionInput = {
        assignmentId,
        wasteType: body.waste_type,
        wasteTons: tons,
        notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
    };
    return next();
};

exports.WASTE_TYPES = WASTE_TYPES;
