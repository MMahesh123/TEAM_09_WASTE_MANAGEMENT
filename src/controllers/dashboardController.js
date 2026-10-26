
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

exports.getDashboardCharts = async (req, res, next) => {
    try {
        const period = req.query.period || '6m';

        // Whitelist accepted periods to avoid arbitrary SQL intervals.
        const periodConfig = {
            '7d': { interval: 7, unit: 'DAY' },
            '30d': { interval: 30, unit: 'DAY' },
            '6m': { interval: 6, unit: 'MONTH' }
        };

        if (!periodConfig[period]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid period. Use 7d, 30d, or 6m.'
            });
        }

        const { interval, unit } = periodConfig[period];

        // Complaints are grouped by creation date.
        // currentlyResolved means their current status is Resolved,
        // not that they were resolved on that date.
        const [trendRows] = await db.query(`
            SELECT
                DATE(created_at) AS date,
                COUNT(*) AS received,
                SUM(CASE
                    WHEN status = 'Resolved' THEN 1
                    ELSE 0
                END) AS currentlyResolved
            FROM complaints
            WHERE created_at >= DATE_SUB(
                CURDATE(), INTERVAL ${interval} ${unit}
            )
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        `);

        const [vehicleRows] = await db.query(`
            SELECT status, COUNT(*) AS total
            FROM vehicles
            GROUP BY status
            ORDER BY status ASC
        `);

        return res.status(200).json({
            success: true,
            data: {
                period,
                complaintsTrend: trendRows.map(row => ({
                    date: row.date,
                    received: Number(row.received),
                    currentlyResolved: Number(row.currentlyResolved)
                })),
                vehicleStatus: vehicleRows.map(row => ({
                    name: row.status,
                    value: Number(row.total)
                }))
            }
        });
    } catch (error) {
        next(error);
    }
};
