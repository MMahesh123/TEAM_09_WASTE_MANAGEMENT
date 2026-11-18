
const db = require('../config/db');

const periodConfig = {
    '7d': { interval: 7, unit: 'DAY' },
    '30d': { interval: 30, unit: 'DAY' },
    '6m': { interval: 6, unit: 'MONTH' }
};

function toNumber(value) {
    return Number(value || 0);
}

exports.getDashboardSummary = async (req, res, next) => {
    try {
        const [complaintRows] = await db.query(`
            SELECT
                COUNT(*) AS totalComplaints,
                COALESCE(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) AS pendingComplaints,
                COALESCE(SUM(CASE WHEN status = 'In-Progress' THEN 1 ELSE 0 END), 0) AS inProgressComplaints,
                COALESCE(SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END), 0) AS resolvedComplaints
            FROM complaints
        `);

        const [vehicleRows] = await db.query(`
            SELECT COUNT(*) AS activeVehicles
            FROM vehicles
            WHERE status = 'Active'
        `);

        const stats = {
            totalComplaints: toNumber(complaintRows[0].totalComplaints),
            pendingComplaints: toNumber(complaintRows[0].pendingComplaints),
            inProgressComplaints: toNumber(complaintRows[0].inProgressComplaints),
            resolvedComplaints: toNumber(complaintRows[0].resolvedComplaints),
            activeVehicles: toNumber(vehicleRows[0].activeVehicles)
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

        if (!periodConfig[period]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid period. Use 7d, 30d, or 6m.'
            });
        }

        const { interval, unit } = periodConfig[period];

        const [trendRows] = await db.query(`
            SELECT
                DATE(created_at) AS date,
                COUNT(*) AS received,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) AS currentlyResolved
            FROM complaints
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ${interval} ${unit})
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
                    received: toNumber(row.received),
                    currentlyResolved: toNumber(row.currentlyResolved)
                })),
                vehicleStatus: vehicleRows.map(row => ({
                    name: row.status,
                    value: toNumber(row.total)
                }))
            }
        });
    } catch (error) {
        next(error);
    }
};

// Operational reports for Admin and Supervisor.
exports.getDashboardOperations = async (req, res, next) => {
    try {
        const period = req.query.period || '30d';
        const config = periodConfig[period];

        if (!config) {
            return res.status(400).json({
                success: false,
                message: 'Invalid period. Use 7d, 30d, or 6m.'
            });
        }

        const { interval, unit } = config;
        const dateFilter = `DATE_SUB(CURDATE(), INTERVAL ${interval} ${unit})`;

        const [
            collectionRows,
            collectionVerificationRows,
            vehicleUsageRows,
            disposalRows,
            disposalVerificationRows,
            paymentRows
        ] = await Promise.all([
            db.query(`
                SELECT
                    w.ward_name AS ward,
                    COUNT(cl.log_id) AS collectionCount,
                    COALESCE(SUM(cl.waste_tons), 0) AS collectedTons,
                    COALESCE(SUM(
                        CASE
                            WHEN cl.verification_status = 'Approved'
                            THEN COALESCE(cl.accepted_tons, 0)
                            ELSE 0
                        END
                    ), 0) AS acceptedTons,
                    SUM(CASE WHEN cl.verification_status = 'Pending' THEN 1 ELSE 0 END) AS pendingCount,
                    SUM(CASE WHEN cl.verification_status = 'Approved' THEN 1 ELSE 0 END) AS approvedCount,
                    SUM(CASE WHEN cl.verification_status = 'Rejected' THEN 1 ELSE 0 END) AS rejectedCount
                FROM collection_logs cl
                INNER JOIN assignments a ON a.id = cl.assignment_id
                INNER JOIN wards w ON w.id = a.ward_id
                WHERE cl.collected_at >= ${dateFilter}
                GROUP BY w.id, w.ward_name
                ORDER BY collectedTons DESC
            `),

            db.query(`
                SELECT
                    verification_status AS status,
                    COUNT(*) AS total,
                    COALESCE(SUM(waste_tons), 0) AS wasteTons,
                    COALESCE(SUM(
                        CASE
                            WHEN verification_status = 'Approved'
                            THEN COALESCE(accepted_tons, 0)
                            ELSE 0
                        END
                    ), 0) AS acceptedTons
                FROM collection_logs
                WHERE collected_at >= ${dateFilter}
                GROUP BY verification_status
                ORDER BY verification_status
            `),

            db.query(`
                SELECT
                    v.id AS vehicleId,
                    v.registration_number AS vehicle,
                    COUNT(a.id) AS totalAssignments,
                    SUM(CASE WHEN a.status = 'Completed' THEN 1 ELSE 0 END) AS completedAssignments,
                    SUM(CASE WHEN a.status = 'In-Progress' THEN 1 ELSE 0 END) AS inProgressAssignments,
                    SUM(CASE WHEN a.status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelledAssignments
                FROM assignments a
                INNER JOIN vehicles v ON v.id = a.vehicle_id
                WHERE a.shift_date >= ${dateFilter}
                GROUP BY v.id, v.registration_number
                ORDER BY totalAssignments DESC
            `),

            db.query(`
                SELECT
                    ds.site_id AS siteId,
                    ds.name AS site,
                    COUNT(dl.delivery_id) AS deliveryCount,
                    COALESCE(SUM(dl.delivered_tons), 0) AS deliveredTons,
                    COALESCE(SUM(
                        CASE
                            WHEN dl.verification_status = 'Approved'
                            THEN COALESCE(dl.accepted_tons, 0)
                            ELSE 0
                        END
                    ), 0) AS acceptedTons,
                    SUM(CASE WHEN dl.verification_status = 'Pending' THEN 1 ELSE 0 END) AS pendingCount,
                    SUM(CASE WHEN dl.verification_status = 'Approved' THEN 1 ELSE 0 END) AS approvedCount,
                    SUM(CASE WHEN dl.verification_status = 'Rejected' THEN 1 ELSE 0 END) AS rejectedCount
                FROM disposal_logs dl
                INNER JOIN disposal_sites ds ON ds.site_id = dl.site_id
                WHERE dl.created_at >= ${dateFilter}
                GROUP BY ds.site_id, ds.name
                ORDER BY deliveredTons DESC
            `),

            db.query(`
                SELECT
                    verification_status AS status,
                    COUNT(*) AS total,
                    COALESCE(SUM(delivered_tons), 0) AS deliveredTons,
                    COALESCE(SUM(
                        CASE
                            WHEN verification_status = 'Approved'
                            THEN COALESCE(accepted_tons, 0)
                            ELSE 0
                        END
                    ), 0) AS acceptedTons
                FROM disposal_logs
                WHERE created_at >= ${dateFilter}
                GROUP BY verification_status
                ORDER BY verification_status
            `),

            db.query(`
                SELECT
                    status,
                    COUNT(*) AS paymentCount,
                    COALESCE(SUM(amount), 0) AS totalAmount,
                    COALESCE(SUM(total_tons), 0) AS totalTons
                FROM payments
                WHERE created_at >= ${dateFilter}
                GROUP BY status
                ORDER BY status
            `)
        ]);

        const collectionByWard = collectionRows[0].map(row => ({
            ward: row.ward,
            collectionCount: toNumber(row.collectionCount),
            collectedTons: toNumber(row.collectedTons),
            acceptedTons: toNumber(row.acceptedTons),
            pendingCount: toNumber(row.pendingCount),
            approvedCount: toNumber(row.approvedCount),
            rejectedCount: toNumber(row.rejectedCount)
        }));

        const collectionVerification = collectionVerificationRows[0].map(row => ({
            status: row.status,
            total: toNumber(row.total),
            wasteTons: toNumber(row.wasteTons),
            acceptedTons: toNumber(row.acceptedTons)
        }));

        const vehicleUsage = vehicleUsageRows[0].map(row => ({
            vehicleId: toNumber(row.vehicleId),
            vehicle: row.vehicle,
            totalAssignments: toNumber(row.totalAssignments),
            completedAssignments: toNumber(row.completedAssignments),
            inProgressAssignments: toNumber(row.inProgressAssignments),
            cancelledAssignments: toNumber(row.cancelledAssignments)
        }));

        const disposalBySite = disposalRows[0].map(row => ({
            siteId: toNumber(row.siteId),
            site: row.site,
            deliveryCount: toNumber(row.deliveryCount),
            deliveredTons: toNumber(row.deliveredTons),
            acceptedTons: toNumber(row.acceptedTons),
            pendingCount: toNumber(row.pendingCount),
            approvedCount: toNumber(row.approvedCount),
            rejectedCount: toNumber(row.rejectedCount)
        }));

        const disposalVerification = disposalVerificationRows[0].map(row => ({
            status: row.status,
            total: toNumber(row.total),
            deliveredTons: toNumber(row.deliveredTons),
            acceptedTons: toNumber(row.acceptedTons)
        }));

        const paymentSummary = paymentRows[0].map(row => ({
            status: row.status,
            paymentCount: toNumber(row.paymentCount),
            totalAmount: toNumber(row.totalAmount),
            totalTons: toNumber(row.totalTons)
        }));

        const sum = (rows, key) =>
            rows.reduce((total, row) => total + toNumber(row[key]), 0);

        return res.status(200).json({
            success: true,
            data: {
                period,
                collectionByWard,
                collectionVerification,
                vehicleUsage,
                disposalBySite,
                disposalVerification,
                paymentSummary,
                totals: {
                    collectionCount: sum(collectionByWard, 'collectionCount'),
                    collectedTons: sum(collectionByWard, 'collectedTons'),
                    acceptedCollectionTons: sum(collectionByWard, 'acceptedTons'),
                    totalAssignments: sum(vehicleUsage, 'totalAssignments'),
                    completedAssignments: sum(vehicleUsage, 'completedAssignments'),
                    deliveryCount: sum(disposalBySite, 'deliveryCount'),
                    deliveredTons: sum(disposalBySite, 'deliveredTons'),
                    acceptedDisposalTons: sum(disposalBySite, 'acceptedTons'),
                    paymentCount: sum(paymentSummary, 'paymentCount'),
                    paymentAmount: sum(paymentSummary, 'totalAmount')
                }
            }
        });
    } catch (error) {
        next(error);
    }
};
