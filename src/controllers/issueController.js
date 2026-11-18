
const db = require('../config/db');
const { recordAuditEvent } = require('../services/auditService');

const isValidId = (id) =>
    typeof id === 'string' &&
    /^[1-9]\d*$/.test(id) &&
    Number.isSafeInteger(Number(id));

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function withTransaction(work) {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const result = await work(conn);

        await conn.commit();

        return result;
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

// GET /api/issues
// List common issue groups with complaint counts.
exports.getIssues = async (req, res, next) => {
    try {
        const { ward } = req.query;

        let query = `
            SELECT
                i.issue_id,
                i.ward,
                i.normalized_type,
                i.display_type,
                i.created_at,
                i.updated_at,
                COUNT(cil.link_id) AS complaint_count
            FROM issues i
            LEFT JOIN complaint_issue_links cil
                ON cil.issue_id = i.issue_id
            LEFT JOIN complaints c
                ON c.id = cil.complaint_id
            WHERE 1 = 1
        `;

        const params = [];

        if (ward) {
            query += ' AND i.ward = ?';
            params.push(ward);
        }

        query += `
            GROUP BY
                i.issue_id,
                i.ward,
                i.normalized_type,
                i.display_type,
                i.created_at,
                i.updated_at
            ORDER BY i.updated_at DESC
        `;

        const [rows] = await db.query(query, params);

        return res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (error) {
        return next(error);
    }
};

// GET /api/issues/:id
// Get an issue group and all its linked complaints.
exports.getIssueById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!isValidId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid issue ID.'
            });
        }

        const [issues] = await db.query(
            `SELECT *
             FROM issues
             WHERE issue_id = ?`,
            [id]
        );

        if (issues.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Issue group not found.'
            });
        }

        const [complaints] = await db.query(
            `SELECT
                c.*,
                cil.link_id,
                cil.grouping_method,
                cil.reviewed_by,
                cil.reviewed_at
             FROM complaint_issue_links cil
             INNER JOIN complaints c
                ON c.id = cil.complaint_id
             WHERE cil.issue_id = ?
             ORDER BY c.created_at DESC`,
            [id]
        );

        return res.status(200).json({
            success: true,
            data: {
                issue: issues[0],
                complaintCount: complaints.length,
                complaints
            }
        });
    } catch (error) {
        return next(error);
    }
};

// PATCH /api/issues/complaints/:complaintId/group
// Supervisor/Admin reviews or corrects a complaint's issue group.
exports.reviewComplaintGrouping = async (req, res, next) => {
    const { complaintId } = req.params;
    const { issueId, reason } = req.body || {};

    if (!isValidId(complaintId) || !isValidId(String(issueId ?? ''))) {
        return res.status(400).json({
            success: false,
            message: 'Valid complaint ID and issue ID are required.'
        });
    }

    if (
        reason !== undefined &&
        reason !== null &&
        (typeof reason !== 'string' || reason.length > 1000)
    ) {
        return res.status(400).json({
            success: false,
            message: 'Reason must be text of at most 1000 characters.'
        });
    }

    const isAdmin = req.user.role === 'Admin';

    if (isAdmin && (typeof reason !== 'string' || !reason.trim())) {
        return res.status(400).json({
            success: false,
            message: 'Admin grouping overrides require a reason.'
        });
    }

    try {
        const result = await withTransaction(async (conn) => {
            const [complaints] = await conn.query(
                `SELECT id, ward
                 FROM complaints
                 WHERE id = ?
                 FOR UPDATE`,
                [complaintId]
            );

            if (complaints.length === 0) {
                throw new HttpError(404, 'Complaint not found.');
            }

            const [issues] = await conn.query(
                `SELECT issue_id, ward, normalized_type, display_type
                 FROM issues
                 WHERE issue_id = ?
                 FOR UPDATE`,
                [issueId]
            );

            if (issues.length === 0) {
                throw new HttpError(404, 'Target issue group not found.');
            }

            const complaint = complaints[0];
            const targetIssue = issues[0];

            // Prevent grouping complaints across different wards.
            if (complaint.ward !== targetIssue.ward) {
                throw new HttpError(
                    400,
                    'A complaint can only be grouped with an issue from the same ward.'
                );
            }

            const [existingLinks] = await conn.query(
                `SELECT *
                 FROM complaint_issue_links
                 WHERE complaint_id = ?
                 FOR UPDATE`,
                [complaintId]
            );

            const oldLink = existingLinks[0] || null;

            if (oldLink && Number(oldLink.issue_id) === Number(issueId)) {
                // Mark the current grouping as supervisor-reviewed.
                await conn.query(
                    `UPDATE complaint_issue_links
                     SET grouping_method = 'Supervisor',
                         reviewed_by = ?,
                         reviewed_at = CURRENT_TIMESTAMP
                     WHERE complaint_id = ?`,
                    [req.user.userId, complaintId]
                );

                if (oldLink.grouping_method !== 'Supervisor') {
                    await recordAuditEvent({
                        actor: req.user,
                        action: 'COMPLAINT_GROUPING_REVIEWED',
                        entityType: 'complaint_issue_link',
                        entityId: oldLink.link_id,
                        oldValues: {
                            issueId: oldLink.issue_id,
                            groupingMethod: oldLink.grouping_method
                        },
                        newValues: {
                            issueId: Number(issueId),
                            groupingMethod: 'Supervisor'
                        },
                        reason: reason?.trim() || null,
                        executor: conn
                    });
                }

                return {
                    issueId: Number(issueId),
                    unchanged: true
                };
            }

            if (oldLink) {
                await conn.query(
                    `UPDATE complaint_issue_links
                     SET issue_id = ?,
                         grouping_method = 'Supervisor',
                         reviewed_by = ?,
                         reviewed_at = CURRENT_TIMESTAMP
                     WHERE complaint_id = ?`,
                    [issueId, req.user.userId, complaintId]
                );
            } else {
                await conn.query(
                    `INSERT INTO complaint_issue_links
                        (complaint_id, issue_id, grouping_method,
                         reviewed_by, reviewed_at)
                     VALUES (?, ?, 'Supervisor', ?, CURRENT_TIMESTAMP)`,
                    [complaintId, issueId, req.user.userId]
                );
            }

            await recordAuditEvent({
                actor: req.user,
                action: isAdmin
                    ? 'COMPLAINT_GROUPING_OVERRIDE'
                    : 'COMPLAINT_GROUPING_REVIEWED',
                entityType: 'complaint_issue_link',
                entityId: oldLink ? oldLink.link_id : complaintId,
                oldValues: oldLink
                    ? {
                        issueId: oldLink.issue_id,
                        groupingMethod: oldLink.grouping_method
                    }
                    : null,
                newValues: {
                    issueId: Number(issueId),
                    groupingMethod: 'Supervisor',
                    reviewedBy: req.user.userId
                },
                reason: reason?.trim() || null,
                metadata: {
                    complaintId: Number(complaintId),
                    previousIssueId: oldLink?.issue_id || null,
                    targetIssueId: Number(issueId)
                },
                executor: conn
            });

            return {
                issueId: Number(issueId),
                unchanged: false
            };
        });

        return res.status(200).json({
            success: true,
            message: result.unchanged
                ? 'Complaint grouping reviewed.'
                : 'Complaint grouping updated successfully.',
            data: result
        });
    } catch (error) {
        if (error instanceof HttpError) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            });
        }

        return next(error);
    }
};
