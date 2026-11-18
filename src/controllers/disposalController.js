
const db = require('../config/db');
const { isTons, isNonEmptyString, parseId } = require('../utils/validate');
const { bad, notFound, conflict, send, serverError } = require('../utils/respond');
const { recordAuditEvent } = require('../services/auditService');

const SITE_COLUMNS = `
    site_id, name, location, max_capacity_tons, current_load_tons,
    ROUND(current_load_tons / max_capacity_tons * 100, 2) AS utilization_pct
`;

const DELIVERY_SELECT = `
    SELECT
        d.delivery_id,
        d.collection_log_id,
        d.site_id,
        d.worker_id,
        u.username AS worker_name,
        d.delivered_tons,
        d.verification_status,
        d.accepted_tons,
        d.verified_by,
        d.verified_at,
        d.verification_reason,
        d.notes,
        d.created_at,
        s.name AS site_name,
        s.location AS site_location
    FROM disposal_logs d
    JOIN disposal_sites s ON s.site_id = d.site_id
    JOIN users u ON u.user_id = d.worker_id
`;

const toSite = (row) => ({
    ...row,
    max_capacity_tons: Number(row.max_capacity_tons),
    current_load_tons: Number(row.current_load_tons),
    ...(row.utilization_pct !== undefined && {
        utilization_pct: Number(row.utilization_pct)
    })
});

const toDelivery = (row) => ({
    ...row,
    delivered_tons: Number(row.delivered_tons),
    accepted_tons: row.accepted_tons == null
        ? null
        : Number(row.accepted_tons)
});

function validateSiteBody(body) {
    const { name, location, max_capacity_tons } = body || {};

    if (!isNonEmptyString(name, 100)) {
        return 'name is required (max 100 chars)';
    }

    if (!isNonEmptyString(location, 255)) {
        return 'location is required (max 255 chars)';
    }

    if (!isTons(max_capacity_tons)) {
        return 'max_capacity_tons must be a positive number with at most 2 decimals (max 99999999.99)';
    }

    return null;
}

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function fail(res, status, message) {
    return send(res, status, message);
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

function actorFromRequest(req) {
    return {
        userId: req.user.userId,
        role: req.user.role
    };
}

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// =========================================================
// DISPOSAL SITE MANAGEMENT — EXISTING FUNCTIONALITY
// =========================================================

// POST /api/disposal
exports.createSite = async (req, res) => {
    try {
        const error = validateSiteBody(req.body);
        if (error) return bad(res, error);

        const { name, location, max_capacity_tons } = req.body;

        const [duplicate] = await db.query(
            'SELECT site_id FROM disposal_sites WHERE name = ?',
            [name.trim()]
        );

        if (duplicate.length > 0) {
            return conflict(res, 'Disposal site already exists');
        }

        const [result] = await db.query(
            `INSERT INTO disposal_sites
                (name, location, max_capacity_tons)
             VALUES (?, ?, ?)`,
            [name.trim(), location.trim(), max_capacity_tons]
        );

        return send(res, 201, 'Disposal site created', {
            site_id: result.insertId
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return conflict(res, 'Disposal site already exists');
        }

        return serverError(res, error);
    }
};

// GET /api/disposal
exports.listSites = async (req, res) => {
    try {
        const [sites] = await db.query(
            `SELECT ${SITE_COLUMNS}
             FROM disposal_sites
             ORDER BY name`
        );

        return res.status(200).json({
            code: 200,
            count: sites.length,
            data: sites.map(toSite)
        });
    } catch (error) {
        return serverError(res, error);
    }
};

// GET /api/disposal/:id
exports.getSite = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return bad(res, 'Invalid site id');

        const [rows] = await db.query(
            `SELECT ${SITE_COLUMNS}
             FROM disposal_sites
             WHERE site_id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return notFound(res, 'Disposal site not found');
        }

        return res.status(200).json({
            code: 200,
            data: toSite(rows[0])
        });
    } catch (error) {
        return serverError(res, error);
    }
};

// PUT /api/disposal/:id
exports.updateSite = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return bad(res, 'Invalid site id');

        const error = validateSiteBody(req.body);
        if (error) return bad(res, error);

        const { name, location, max_capacity_tons } = req.body;

        const [result] = await db.query(
            `UPDATE disposal_sites
             SET name = ?, location = ?, max_capacity_tons = ?
             WHERE site_id = ?
               AND current_load_tons <= ?`,
            [name.trim(), location.trim(), max_capacity_tons, id, max_capacity_tons]
        );

        if (result.affectedRows === 0) {
            const [rows] = await db.query(
                'SELECT site_id FROM disposal_sites WHERE site_id = ?',
                [id]
            );

            if (rows.length === 0) {
                return notFound(res, 'Disposal site not found');
            }

            return bad(
                res,
                'max_capacity_tons cannot be lower than the current load'
            );
        }

        return send(res, 200, 'Disposal site updated');
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return conflict(res, 'Disposal site name already in use');
        }

        return serverError(res, error);
    }
};

// DELETE /api/disposal/:id
exports.deleteSite = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return bad(res, 'Invalid site id');

        const [result] = await db.query(
            `DELETE FROM disposal_sites
             WHERE site_id = ? AND current_load_tons = 0`,
            [id]
        );

        if (result.affectedRows === 0) {
            const [rows] = await db.query(
                'SELECT site_id FROM disposal_sites WHERE site_id = ?',
                [id]
            );

            if (rows.length === 0) {
                return notFound(res, 'Disposal site not found');
            }

            return conflict(
                res,
                'Cannot delete a site that still holds waste; remove its load first'
            );
        }

        return send(res, 200, 'Disposal site deleted');
    } catch (error) {
        return serverError(res, error);
    }
};

// POST /api/disposal/:id/load
// Existing manual load adjustment — preserved.
exports.updateLoad = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return bad(res, 'Invalid site id');

        const { tons, action } = req.body || {};

        if (!isTons(tons)) {
            return bad(
                res,
                'tons must be a positive number with at most 2 decimals (max 99999999.99)'
            );
        }

        if (!['add', 'remove'].includes(action)) {
            return bad(res, "action must be 'add' or 'remove'");
        }

        const sql = action === 'add'
            ? `UPDATE disposal_sites
               SET current_load_tons = current_load_tons + ?
               WHERE site_id = ?
                 AND current_load_tons + ? <= max_capacity_tons`
            : `UPDATE disposal_sites
               SET current_load_tons = current_load_tons - ?
               WHERE site_id = ?
                 AND current_load_tons - ? >= 0`;

        const [result] = await db.query(sql, [tons, id, tons]);

        if (result.affectedRows === 0) {
            const [rows] = await db.query(
                'SELECT site_id FROM disposal_sites WHERE site_id = ?',
                [id]
            );

            if (rows.length === 0) {
                return notFound(res, 'Disposal site not found');
            }

            return bad(
                res,
                action === 'add'
                    ? 'Load would exceed site capacity'
                    : 'Cannot remove more than the current load'
            );
        }

        const [rows] = await db.query(
            `SELECT ${SITE_COLUMNS}
             FROM disposal_sites
             WHERE site_id = ?`,
            [id]
        );

        return send(res, 200, 'Load updated', {
            data: toSite(rows[0])
        });
    } catch (error) {
        return serverError(res, error);
    }
};

// =========================================================
// DISPOSAL DELIVERY — NEW FUNCTIONALITY
// =========================================================

// POST /api/disposal/deliveries
exports.createDelivery = async (req, res) => {
    try {
        const {
            collectionLogId,
            siteId,
            deliveredTons,
            notes
        } = req.deliveryInput;

        const workerId = Number(req.user.userId);
        const actor = actorFromRequest(req);

        const delivery = await withTransaction(async (conn) => {
            // Lock the source collection to serialize delivery reservations.
            const [collections] = await conn.query(
                `SELECT
                    log_id,
                    worker_id,
                    verification_status,
                    accepted_tons
                 FROM collection_logs
                 WHERE log_id = ?
                 FOR UPDATE`,
                [collectionLogId]
            );

            if (collections.length === 0) {
                throw new HttpError(404, 'Collection record not found.');
            }

            const collection = collections[0];

            if (
                collection.verification_status !== 'Approved' ||
                collection.accepted_tons === null ||
                Number(collection.accepted_tons) <= 0
            ) {
                throw new HttpError(
                    409,
                    'Only approved collection records with accepted quantity can be delivered.'
                );
            }

            // Admin may assist with recording, but the delivery belongs to
            // the worker who owns the source collection.
            if (
                req.user.role === 'Worker' &&
                Number(collection.worker_id) !== workerId
            ) {
                throw new HttpError(
                    403,
                    'You can only deliver your own collection records.'
                );
            }

            const [sites] = await conn.query(
                `SELECT site_id
                 FROM disposal_sites
                 WHERE site_id = ?
                 FOR UPDATE`,
                [siteId]
            );

            if (sites.length === 0) {
                throw new HttpError(404, 'Disposal site not found.');
            }

            // Approved quantities are consumed.
            // Pending quantities are reserved.
            // Rejected quantities are available for a new attempt.
            const [usageRows] = await conn.query(
                `SELECT
                    COALESCE(
                        SUM(
                            CASE
                                WHEN verification_status = 'Approved'
                                THEN accepted_tons
                                ELSE 0
                            END
                        ), 0
                    ) AS approved_tons,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN verification_status = 'Pending'
                                THEN delivered_tons
                                ELSE 0
                            END
                        ), 0
                    ) AS pending_tons
                 FROM disposal_logs
                 WHERE collection_log_id = ?`,
                [collectionLogId]
            );

            const approvedTons = Number(usageRows[0].approved_tons);
            const pendingTons = Number(usageRows[0].pending_tons);
            const sourceTons = Number(collection.accepted_tons);

            const remainingTons = round2(
                sourceTons - approvedTons - pendingTons
            );

            if (deliveredTons > remainingTons) {
                throw new HttpError(
                    409,
                    `Delivery exceeds the remaining collection quantity (${remainingTons} tons remaining).`
                );
            }

            const [insertResult] = await conn.query(
                `INSERT INTO disposal_logs
                    (
                        collection_log_id,
                        site_id,
                        worker_id,
                        delivered_tons,
                        notes
                    )
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    collectionLogId,
                    siteId,
                    collection.worker_id,
                    deliveredTons,
                    notes
                ]
            );

            await recordAuditEvent({
                actor,
                action: 'DISPOSAL_DELIVERY_CREATED',
                entityType: 'disposal_delivery',
                entityId: insertResult.insertId,
                oldValues: null,
                newValues: {
                    collectionLogId,
                    siteId,
                    workerId: Number(collection.worker_id),
                    deliveredTons,
                    verificationStatus: 'Pending'
                },
                metadata: {
                    remainingCollectionTons: remainingTons
                },
                executor: conn
            });

            const [createdRows] = await conn.query(
                `${DELIVERY_SELECT}
                 WHERE d.delivery_id = ?`,
                [insertResult.insertId]
            );

            return toDelivery(createdRows[0]);
        });

        return send(
            res,
            201,
            'Disposal delivery recorded and awaiting verification.',
            { data: delivery }
        );
    } catch (error) {
        if (error instanceof HttpError) {
            return fail(res, error.status, error.message);
        }

        return serverError(res, error);
    }
};

// GET /api/disposal/deliveries
exports.listDeliveries = async (req, res) => {
    try {
        const isWorker = req.user.role === 'Worker';

        const sql = isWorker
            ? `${DELIVERY_SELECT}
               WHERE d.worker_id = ?
               ORDER BY d.created_at DESC, d.delivery_id DESC`
            : `${DELIVERY_SELECT}
               ORDER BY d.created_at DESC, d.delivery_id DESC`;

        const params = isWorker ? [req.user.userId] : [];

        const [rows] = await db.query(sql, params);
        const data = rows.map(toDelivery);

        return res.status(200).json({
            code: 200,
            count: data.length,
            data
        });
    } catch (error) {
        return serverError(res, error);
    }
};

// GET /api/disposal/deliveries/:id
exports.getDelivery = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return bad(res, 'Invalid delivery id');

        const [rows] = await db.query(
            `${DELIVERY_SELECT}
             WHERE d.delivery_id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return notFound(res, 'Disposal delivery not found');
        }

        if (
            req.user.role === 'Worker' &&
            Number(rows[0].worker_id) !== Number(req.user.userId)
        ) {
            return res.status(403).json({
                code: 403,
                message: 'You can only view your own deliveries.'
            });
        }

        return res.status(200).json({
            code: 200,
            data: toDelivery(rows[0])
        });
    } catch (error) {
        return serverError(res, error);
    }
};

// PATCH /api/disposal/deliveries/:id/verify
exports.verifyDelivery = async (req, res) => {
    try {
        const id = parseId(req.params.id);

        if (!id) {
            return bad(res, 'Invalid delivery id');
        }

        const { acceptedTons, reason } = req.deliveryVerificationInput;
        const actor = actorFromRequest(req);

        const result = await withTransaction(async (conn) => {
            // Lock delivery to prevent duplicate verification.
            const [deliveryRows] = await conn.query(
                `SELECT
                    delivery_id,
                    collection_log_id,
                    site_id,
                    worker_id,
                    delivered_tons,
                    verification_status
                 FROM disposal_logs
                 WHERE delivery_id = ?
                 FOR UPDATE`,
                [id]
            );

            if (deliveryRows.length === 0) {
                throw new HttpError(404, 'Disposal delivery not found.');
            }

            const delivery = deliveryRows[0];

            if (delivery.verification_status !== 'Pending') {
                throw new HttpError(
                    409,
                    'This disposal delivery has already been verified.'
                );
            }

            const deliveredHundredths = Math.round(
                Number(delivery.delivered_tons) * 100
            );

            const acceptedHundredths = Math.round(acceptedTons * 100);

            if (acceptedHundredths > deliveredHundredths) {
                throw new HttpError(
                    400,
                    'acceptedTons cannot exceed delivered_tons.'
                );
            }

            const rejectedTons = round2(
                (deliveredHundredths - acceptedHundredths) / 100
            );

            const partialAcceptance =
                acceptedHundredths > 0 &&
                acceptedHundredths < deliveredHundredths;

            const fullRejection = acceptedHundredths === 0;

            if ((partialAcceptance || fullRejection) && !reason) {
                throw new HttpError(
                    400,
                    'A reason is required for partial acceptance or full rejection.'
                );
            }

            const verificationStatus = acceptedHundredths === 0
                ? 'Rejected'
                : 'Approved';

            // Lock site before checking capacity.
            const [siteRows] = await conn.query(
                `SELECT
                    site_id,
                    current_load_tons,
                    max_capacity_tons
                 FROM disposal_sites
                 WHERE site_id = ?
                 FOR UPDATE`,
                [delivery.site_id]
            );

            if (siteRows.length === 0) {
                throw new HttpError(404, 'Disposal site not found.');
            }

            const site = siteRows[0];
            const currentLoadHundredths = Math.round(
                Number(site.current_load_tons) * 100
            );
            const capacityHundredths = Math.round(
                Number(site.max_capacity_tons) * 100
            );

            const availableHundredths =
                capacityHundredths - currentLoadHundredths;

            if (acceptedHundredths > availableHundredths) {
                throw new HttpError(
                    409,
                    `Accepted quantity exceeds site capacity. Available capacity: ${round2(availableHundredths / 100)} tons.`
                );
            }

            await conn.query(
                `UPDATE disposal_logs
                 SET
                    verification_status = ?,
                    accepted_tons = ?,
                    verified_by = ?,
                    verified_at = CURRENT_TIMESTAMP,
                    verification_reason = ?
                 WHERE delivery_id = ?`,
                [
                    verificationStatus,
                    acceptedTons,
                    req.user.userId,
                    reason,
                    id
                ]
            );

            // Only accepted tonnage contributes to site load.
            if (acceptedHundredths > 0) {
                await conn.query(
                    `UPDATE disposal_sites
                     SET current_load_tons = current_load_tons + ?
                     WHERE site_id = ?`,
                    [acceptedTons, delivery.site_id]
                );
            }

            await recordAuditEvent({
                actor,
                action: verificationStatus === 'Rejected'
                    ? 'DISPOSAL_DELIVERY_REJECTED'
                    : 'DISPOSAL_DELIVERY_VERIFIED',
                entityType: 'disposal_delivery',
                entityId: id,
                oldValues: {
                    verificationStatus: delivery.verification_status,
                    acceptedTons: null
                },
                newValues: {
                    verificationStatus,
                    deliveredTons: Number(delivery.delivered_tons),
                    acceptedTons,
                    rejectedTons,
                    verifiedBy: req.user.userId
                },
                reason,
                metadata: {
                    siteId: delivery.site_id,
                    collectionLogId: delivery.collection_log_id,
                    siteLoadBefore: Number(site.current_load_tons),
                    siteLoadAfter: round2(
                        Number(site.current_load_tons) + acceptedTons
                    )
                },
                executor: conn
            });

            const [updatedRows] = await conn.query(
                `${DELIVERY_SELECT}
                 WHERE d.delivery_id = ?`,
                [id]
            );

            return {
                delivery: toDelivery(updatedRows[0]),
                rejectedTons
            };
        });

        return send(
            res,
            200,
            result.delivery.verification_status === 'Rejected'
                ? 'Disposal delivery rejected.'
                : 'Disposal delivery verified successfully.',
            {
                data: {
                    ...result.delivery,
                    rejected_tons: result.rejectedTons
                }
            }
        );
    } catch (error) {
        if (error instanceof HttpError) {
            return fail(res, error.status, error.message);
        }

        return serverError(res, error);
    }
};
