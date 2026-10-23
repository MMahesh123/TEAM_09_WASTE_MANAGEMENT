
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
                    WHEN status = 'In-Progress' THEN 1 ELSE 0
                END), 0) AS inProgressComplaints,
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
            inProgressComplaints: Number(
                complaintRows[0].inProgressComplaints
            ),
            resolvedComplaints: Number(complaintRows[0].resolvedComplaints),
            activeVehicles: Number(vehicleRows[0].activeVehicles)
        };

        return res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        next(error);
    }
};
