
const db = require('../src/config/db');
const { recordAuditEvent } = require('../src/services/auditService');
const { normalizeComplaintType } = require('../src/services/issueGroupingService');

async function backfillIssueGroups() {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const [complaints] = await conn.query(`
            SELECT c.id, c.ward, c.type
            FROM complaints c
            LEFT JOIN complaint_issue_links cil
                ON cil.complaint_id = c.id
            WHERE cil.complaint_id IS NULL
            ORDER BY c.id ASC
            FOR UPDATE
        `);

        let groupedCount = 0;

        for (const complaint of complaints) {
            const normalizedType = normalizeComplaintType(complaint.type);

            if (!normalizedType) {
                continue;
            }

            const [insertResult] = await conn.query(
                `INSERT INTO issues
                    (ward, normalized_type, display_type)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    issue_id = LAST_INSERT_ID(issue_id)`,
                [
                    complaint.ward,
                    normalizedType,
                    complaint.type.trim()
                ]
            );

            const issueId = insertResult.insertId;

            if (!issueId) {
                throw new Error(
                    `Could not identify issue group for complaint ${complaint.id}`
                );
            }

            const [linkResult] = await conn.query(
                `INSERT INTO complaint_issue_links
                    (complaint_id, issue_id, grouping_method)
                 VALUES (?, ?, 'Automatic')`,
                [complaint.id, issueId]
            );

            await recordAuditEvent({
                actor: { role: 'System' },
                action: 'COMPLAINT_AUTO_GROUPED',
                entityType: 'complaint_issue_link',
                entityId: linkResult.insertId,
                newValues: {
                    complaintId: complaint.id,
                    issueId,
                    groupingMethod: 'Automatic'
                },
                metadata: {
                    ward: complaint.ward,
                    normalizedType
                },
                executor: conn
            });

            groupedCount++;
        }

        await conn.commit();

        console.log('Issue grouping backfill completed.');
        console.log(`Complaints grouped: ${groupedCount}`);
    } catch (error) {
        await conn.rollback();
        console.error('Backfill failed:', error.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await db.end();
    }
}

backfillIssueGroups();
