
exports.validateComplaint = (req, res, next) => {
    const { ward, type } = req.body || {};

    if (
        typeof ward !== 'string' ||
        typeof type !== 'string' ||
        !ward.trim() ||
        !type.trim()
    ) {
        return res.status(400).json({
            success: false,
            message: 'Ward and complaint type must be non-empty strings.'
        });
    }

    next();
};
