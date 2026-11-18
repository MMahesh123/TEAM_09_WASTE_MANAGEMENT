
const db = require('../config/db');

const VALID_ROLES = [
    'Admin',
    'Supervisor',
    'Worker',
    'Citizen',
    'System'
];

function serializeJson(value) {
    if (value === undefined || value === null) {
        return null;
    }

    return JSON.stringify(value);
}

/**
 * Records an auditable system action.
 *
 * Pass a transaction connection as executor when the audit entry
 * must be committed or rolled back together with the business action.
 *
 * @param {Object} event
 * @param {Object} event.actor Authenticated user or system actor
 * @param {string} event.action Action performed
 * @param {string} event.entityType Type of affected record
 * @param {string|number|null} event.entityId ID of affected record
 * @param {Object|null} event.oldValues Previous values
 * @param {Object|null} event.newValues Updated values
 * @param {string|null} event.reason Reason for the action or override
 * @param {Object|null} event.metadata Additional context
 * @param {Object} event.executor Database pool or transaction connection
 */
async function recordAuditEvent({
    actor,
    action,
    entityType,
    entityId = null,
    oldValues = null,
    newValues = null,
    reason = null,
    metadata = null,
    executor = db
}) {
    if (!actor || typeof actor !== 'object') {
        throw new Error('Audit actor is required');
    }

    const actorRole = actor.role;

    if (!VALID_ROLES.includes(actorRole)) {
        throw new Error('Invalid audit actor role');
    }

    if (
        typeof action !== 'string' ||
        !action.trim() ||
        action.length > 100
    ) {
        throw new Error('A valid audit action is required');
    }

    if (
        typeof entityType !== 'string' ||
        !entityType.trim() ||
        entityType.length > 100
    ) {
        throw new Error('A valid audit entity type is required');
    }

    if (
        reason !== null &&
        (typeof reason !== 'string' || reason.length > 1000)
    ) {
        throw new Error('Audit reason must be a string of at most 1000 characters');
    }

    const actorUserId =
        actorRole === 'System'
            ? null
            : Number(actor.userId ?? actor.id);

    if (
        actorRole !== 'System' &&
        (!Number.isInteger(actorUserId) || actorUserId <= 0)
    ) {
        throw new Error('A valid authenticated user ID is required for audit');
    }

    const normalizedEntityId =
        entityId === null || entityId === undefined
            ? null
            : String(entityId);

    if (
        normalizedEntityId !== null &&
        normalizedEntityId.length > 64
    ) {
        throw new Error('Audit entity ID cannot exceed 64 characters');
    }

    const sql = `
        INSERT INTO audit_logs (
            actor_user_id,
            actor_role,
            action,
            entity_type,
            entity_id,
            old_values,
            new_values,
            reason,
            metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        actorUserId,
        actorRole,
        action.trim(),
        entityType.trim(),
        normalizedEntityId,
        serializeJson(oldValues),
        serializeJson(newValues),
        reason ? reason.trim() : null,
        serializeJson(metadata)
    ];

    const [result] = await executor.query(sql, values);

    return {
        auditId: result.insertId,
        actorUserId,
        actorRole,
        action: action.trim(),
        entityType: entityType.trim(),
        entityId: normalizedEntityId
    };
}

module.exports = {
    recordAuditEvent
};
