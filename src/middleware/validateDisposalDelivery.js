
const { parsePositiveInt } = require('../utils/inputValidators');

const MAX_TONS = 99999999.99;
const MAX_NOTES_LENGTH = 255;
const MAX_REASON_LENGTH = 1000;

function parseTons(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (
        typeof value === 'string' &&
        value.trim() !== '' &&
        /^-?\d+(\.\d+)?$/.test(value.trim())
    ) {
        return Number(value.trim());
    }

    return null;
}

// POST /api/disposal/deliveries
exports.validateDisposalDelivery = (req, res, next) => {
    const body = req.body;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({
            success: false,
            message: 'Request body must be a JSON object.'
        });
    }

    const errors = [];

    const collectionLogId = parsePositiveInt(body.collection_log_id);
    const siteId = parsePositiveInt(body.site_id);
    const deliveredTons = parseTons(body.delivered_tons);

    if (!collectionLogId) {
        errors.push('collection_log_id must be a positive integer.');
    }

    if (!siteId) {
        errors.push('site_id must be a positive integer.');
    }

    if (body.delivered_tons === undefined || deliveredTons === null) {
        errors.push('delivered_tons is required and must be a number.');
    } else if (deliveredTons <= 0) {
        errors.push('delivered_tons must be greater than zero.');
    } else if (deliveredTons > MAX_TONS) {
        errors.push('delivered_tons is too large.');
    } else if (Math.round(deliveredTons * 100) / 100 !== deliveredTons) {
        errors.push('delivered_tons can have at most 2 decimal places.');
    }

    if (body.notes !== undefined && body.notes !== null) {
        if (
            typeof body.notes !== 'string' ||
            body.notes.length > MAX_NOTES_LENGTH
        ) {
            errors.push(`notes must be text of at most ${MAX_NOTES_LENGTH} characters.`);
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Invalid disposal delivery data.',
            errors
        });
    }

    req.deliveryInput = {
        collectionLogId,
        siteId,
        deliveredTons,
        notes: typeof body.notes === 'string' && body.notes.trim()
            ? body.notes.trim()
            : null
    };

    return next();
};

// PATCH /api/disposal/deliveries/:id/verify
exports.validateDisposalDeliveryVerification = (req, res, next) => {
    const body = req.body;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({
            success: false,
            message: 'Request body must be a JSON object.'
        });
    }

    const acceptedTons = parseTons(body.acceptedTons);
    const errors = [];

    if (body.acceptedTons === undefined || acceptedTons === null) {
        errors.push('acceptedTons is required and must be a number.');
    } else if (acceptedTons < 0) {
        errors.push('acceptedTons cannot be negative.');
    } else if (acceptedTons > MAX_TONS) {
        errors.push('acceptedTons is too large.');
    } else if (Math.round(acceptedTons * 100) / 100 !== acceptedTons) {
        errors.push('acceptedTons can have at most 2 decimal places.');
    }

    if (body.reason !== undefined && body.reason !== null) {
        if (
            typeof body.reason !== 'string' ||
            body.reason.length > MAX_REASON_LENGTH
        ) {
            errors.push(`reason must be text of at most ${MAX_REASON_LENGTH} characters.`);
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Invalid disposal delivery verification data.',
            errors
        });
    }

    req.deliveryVerificationInput = {
        acceptedTons,
        reason: typeof body.reason === 'string' && body.reason.trim()
            ? body.reason.trim()
            : null
    };

    return next();
};

exports.parseTons = parseTons;
