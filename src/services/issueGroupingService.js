
const db = require('../config/db');
const { recordAuditEvent } = require('./auditService');

// Normalize complaint types so casing, punctuation and extra spaces
// do not create duplicate issue groups.
function normalizeComplaintType(type) {
    return String(type || '')
        .normalize('NFKC')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ');
}

async function autoGroupComplaint(complaintId) {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const [complaints] = await conn.query(
            `SELECT id, ward, type
             FROM complaints
             WHERE id = ?
             FOR UPDATE`,
            [complaintId]
        );

        if (complaints.length === 0) {
            throw new Error('Complaint not found for automatic grouping.');
        }

        const complaint = complaints[0];

        const normalizedType = normalizeComplaintType(complaint.type);

        if (!normalizedType) {
            throw new Error('Complaint type cannot be normalized.');
        }

        // Do not overwrite an existing supervisor-reviewed group.
        const [existingLinks] = await conn.query(
            `SELECT link_id, issue_id
             FROM complaint_issue_links
             WHERE complaint_id = ?
             FOR UPDATE`,
            [complaintId]
        );

        if (existingLinks.length > 0) {
            await conn.commit();

            return {
                grouped: false,
                alreadyGrouped: true,
                issueId: existingLinks[0].issue_id
            };
        }

        // Find the ward + normalized type group or create it.
        const [insertResult] = await conn.query(
            `INSERT INTO issues
                (ward, normalized_type, display_type)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                issue_id = LAST_INSERT_ID(issue_id)`,
            [complaint.ward, normalizedType, complaint.type.trim()]
        );

        const issueId = insertResult.insertId;

        if (!issueId) {
            throw new Error('Could not identify the issue group.');
        }

        const [linkResult] = await conn.query(
            `INSERT INTO complaint_issue_links
                (complaint_id, issue_id, grouping_method)
             VALUES (?, ?, 'Automatic')`,
            [complaintId, issueId]
        );

        if (linkResult.affectedRows > 0) {
            await recordAuditEvent({
                actor: { role: 'System' },
                action: 'COMPLAINT_AUTO_GROUPED',
                entityType: 'complaint_issue_link',
                entityId: linkResult.insertId,
                oldValues: null,
                newValues: {
                    complaintId,
                    issueId,
                    groupingMethod: 'Automatic'
                },
                metadata: {
                    ward: complaint.ward,
                    normalizedType
                },
                executor: conn
            });
        }

        await conn.commit();

        return {
            grouped: true,
            issueId
        };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

module.exports = {
    normalizeComplaintType,
    autoGroupComplaint
};
