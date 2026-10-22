// Dashboard Summary Controller with Database Integration
const db = require('../config/db');

exports.getDashboardSummary = async (req, res, next) => {
    try {
        const [complaintRows] = await db.query(`
            SELECT
                COUNT(*) AS totalComplaints,
                COALESCE(SUM(CASE
                    WHEN status = 'Pending' THEN 1 ELSE 0
                END), 0) AS pendingComplaints,
                COALESCE(SUM(CASE
                    WHEN status = 'Resolved' THEN 1 ELSE 0
                END), 0) AS resolvedComplaints
            FROM complaints
        `);

        const [vehicleRows] = await db.query(`
            SELECT COUNT(*) AS activeVehicles
            FROM vehicles
            WHERE status = 'Active'
        `);

        const stats = {
            totalComplaints: Number(complaintRows[0].totalComplaints),
            pendingComplaints: Number(complaintRows[0].pendingComplaints),
            resolvedComplaints: Number(complaintRows[0].resolvedComplaints),
            activeVehicles: Number(vehicleRows[0].activeVehicles),
            wardEfficiency: '84.5%'
        };

        return res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        next(error);
    }
};
