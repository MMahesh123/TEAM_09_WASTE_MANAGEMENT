// Complaint validation middleware
exports.validateComplaint = (req, res, next) => {
    const { ward, type } = req.body;
    if (!ward || !type) {
        return res.status(400).json({ success: false, message: 'Ward and complaint type are required fields.' });
    }
    next();
};