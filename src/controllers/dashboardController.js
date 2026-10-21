// Dashboard Summary Controller
exports.getDashboardSummary = async (req, res) => {
    try {
        // Mock or database query stats for waste management
        const stats = {
            totalComplaints: 142,
            pendingComplaints: 28,
            resolvedComplaints: 114,
            activeVehicles: 19,
            wardEfficiency: "84.5%"
        };
        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};