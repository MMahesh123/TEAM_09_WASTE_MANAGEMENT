
jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));

jest.mock('../src/services/auditService', () => ({
    recordAuditEvent: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../src/middleware/authMiddleware', () =>
    require('./helpers/mockAuth')
);

const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { recordAuditEvent } = require('../src/services/auditService');

const admin = { 'x-role': 'Admin', 'x-user-id': '3' };
const supervisor = { 'x-role': 'Supervisor', 'x-user-id': '5' };
const worker = { 'x-role': 'Worker', 'x-user-id': '5' };
const citizen = { 'x-role': 'Citizen', 'x-user-id': '8' };

const deliveryBody = {
    collection_log_id: 10,
    site_id: 2,
    delivered_tons: 1.5,
    notes: 'Test delivery'
};

const collectionRow = {
    log_id: 10,
    worker_id: 5,
    verification_status: 'Approved',
    accepted_tons: '2.00'
};

const siteRow = {
    site_id: 2,
    current_load_tons: '10.00',
    max_capacity_tons: '100.00'
};

const deliveryRow = {
    delivery_id: 20,
    collection_log_id: 10,
    site_id: 2,
    worker_id: 5,
    worker_name: 'Test Worker',
    delivered_tons: '1.50',
    verification_status: 'Pending',
    accepted_tons: null,
    verified_by: null,
    verified_at: null,
    verification_reason: null,
    notes: 'Test delivery',
    site_name: 'Test Disposal Site',
    site_location: 'Bangalore'
};

function normaliseSql(sql) {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeConnection(queryImplementation) {
    const conn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
        query: jest.fn(queryImplementation)
    };

    db.getConnection.mockResolvedValue(conn);
    return conn;
}

function setupCreateDelivery({
    collection = collectionRow,
    site = siteRow,
    approvedTons = 0,
    pendingTons = 0,
    insertedId = 20,
    createdDelivery = deliveryRow
} = {}) {
    return makeConnection(async (sql) => {
        const query = normaliseSql(sql);

        if (query.includes('from collection_logs')) {
            return [collection ? [collection] : []];
        }

        if (
            query.includes('from disposal_sites') &&
            query.includes('for update')
        ) {
            return [site ? [{ site_id: site.site_id }] : []];
        }

        if (query.includes('sum(') && query.includes('disposal_logs')) {
            return [[{
                approved_tons: approvedTons,
                pending_tons: pendingTons
            }]];
        }

        if (query.startsWith('insert into disposal_logs')) {
            return [{ insertId: insertedId, affectedRows: 1 }];
        }

        if (query.includes('join disposal_sites') && query.includes('join users')) {
            return [[createdDelivery]];
        }

        throw new Error(`Unexpected SQL in create test: ${query}`);
    });
}

function setupVerifyDelivery({
    delivery = {
        delivery_id: 20,
        collection_log_id: 10,
        site_id: 2,
        worker_id: 5,
        delivered_tons: '1.50',
        verification_status: 'Pending'
    },
    site = siteRow,
    updatedDelivery = {
        ...deliveryRow,
        verification_status: 'Approved',
        accepted_tons: '1.00',
        verified_by: 5,
        verification_reason: 'Partial acceptance test'
    }
} = {}) {
    return makeConnection(async (sql) => {
        const query = normaliseSql(sql);

        if (
            query.includes('from disposal_logs') &&
            query.includes('for update')
        ) {
            return [delivery ? [delivery] : []];
        }

        if (
            query.includes('from disposal_sites') &&
            query.includes('for update')
        ) {
            return [site ? [site] : []];
        }

        if (query.startsWith('update disposal_logs')) {
            return [{ affectedRows: 1 }];
        }

        if (query.startsWith('update disposal_sites')) {
            return [{ affectedRows: 1 }];
        }

        if (query.includes('join disposal_sites') && query.includes('join users')) {
            return [[updatedDelivery]];
        }

        throw new Error(`Unexpected SQL in verify test: ${query}`);
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    db.getConnection.mockReset();
    recordAuditEvent.mockReset().mockResolvedValue(undefined);
});

// =========================================================
// POST /api/disposal/deliveries
// =========================================================

describe('POST /api/disposal/deliveries', () => {
    const url = '/api/disposal/deliveries';

    it('rejects unauthenticated requests', async () => {
        const res = await request(app).post(url).send(deliveryBody);

        expect(res.status).toBe(401);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it.each([[citizen], [supervisor]])(
        'rejects unauthorized role %#',
        async (headers) => {
            const res = await request(app)
                .post(url)
                .set(headers)
                .send(deliveryBody);

            expect(res.status).toBe(403);
            expect(db.getConnection).not.toHaveBeenCalled();
        }
    );

    it.each([
        [{ ...deliveryBody, collection_log_id: 0 }],
        [{ ...deliveryBody, collection_log_id: -1 }],
        [{ ...deliveryBody, site_id: 0 }],
        [{ ...deliveryBody, site_id: 'abc' }],
        [{ ...deliveryBody, delivered_tons: 0 }],
        [{ ...deliveryBody, delivered_tons: -1 }],
        [{ ...deliveryBody, delivered_tons: 1.005 }],
        [{ ...deliveryBody, delivered_tons: 1e12 }],
        [{ ...deliveryBody, delivered_tons: null }],
        [{ ...deliveryBody, notes: 'x'.repeat(256) }]
    ])('rejects invalid delivery input %#', async (body) => {
        const res = await request(app)
            .post(url)
            .set(worker)
            .send(body);

        expect(res.status).toBe(400);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it('accepts numeric strings for tonnage', async () => {
        setupCreateDelivery();

        const res = await request(app)
            .post(url)
            .set(worker)
            .send({
                collection_log_id: '10',
                site_id: '2',
                delivered_tons: '1.50'
            });

        expect(res.status).toBe(201);
    });

    it('creates a delivery successfully', async () => {
        const conn = setupCreateDelivery();

        const res = await request(app)
            .post(url)
            .set(worker)
            .send(deliveryBody);

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            delivery_id: 20,
            collection_log_id: 10,
            site_id: 2,
            worker_id: 5,
            delivered_tons: 1.5,
            verification_status: 'Pending'
        });

        expect(conn.beginTransaction).toHaveBeenCalled();
        expect(conn.commit).toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();

        expect(recordAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'DISPOSAL_DELIVERY_CREATED',
                entityType: 'disposal_delivery',
                entityId: 20,
                executor: conn
            })
        );
    });

    it('allows an Admin to record a delivery', async () => {
        setupCreateDelivery();

        const res = await request(app)
            .post(url)
            .set(admin)
            .send(deliveryBody);

        expect(res.status).toBe(201);
    });

    it('allows delivery creation without optional notes', async () => {
        const conn = setupCreateDelivery();

        const res = await request(app)
            .post(url)
            .set(worker)
            .send({
                collection_log_id: 10,
                site_id: 2,
                delivered_tons: 1.5
            });

        expect(res.status).toBe(201);

        const insertCall = conn.query.mock.calls.find(([sql]) =>
            normaliseSql(sql).startsWith('insert into disposal_logs')
        );

        expect(insertCall[1][4]).toBeNull();
    });

    it('returns 404 when the source collection does not exist', async () => {
        const conn = setupCreateDelivery({ collection: null });

        const res = await request(app)
            .post(url)
            .set(worker)
            .send(deliveryBody);

        expect(res.status).toBe(404);
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    it.each([
        [{ ...collectionRow, verification_status: 'Pending' }],
        [{ ...collectionRow, verification_status: 'Rejected' }],
        [{ ...collectionRow, accepted_tons: '0.00' }],
        [{ ...collectionRow, accepted_tons: null }]
    ])('rejects a collection that is not eligible %#', async (collection) => {
        const conn = setupCreateDelivery({ collection });

        const res = await request(app)
            .post(url)
            .set(worker)
            .send(deliveryBody);

        expect(res.status).toBe(409);
        expect(conn.rollback).toHaveBeenCalled();
    });

    it('prevents a worker from delivering another worker collection', async () => {
        const conn = setupCreateDelivery({
            collection: {
                ...collectionRow,
                worker_id: 9
            }
        });

        const res = await request(app)
            .post(url)
            .set(worker)
            .send(deliveryBody);

        expect(res.status).toBe(403);
        expect(conn.rollback).toHaveBeenCalled();
    });

    it('returns 404 when the disposal site does not exist', async () => {
        const conn = setupCreateDelivery({ site: null });

        const res = await request(app)
            .post(url)
            .set(worker)
            .send(deliveryBody);

        expect(res.status).toBe(404);
        expect(conn.rollback).toHaveBeenCalled();
    });

    it('blocks delivery exceeding remaining collection quantity', async () => {
        const conn = setupCreateDelivery({
            approvedTons: 1,
            pendingTons: 0.5
        });

        const res = await request(app)
            .post(url)
            .set(worker)
            .send({
                ...deliveryBody,
                delivered_tons: 0.75
            });

        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/remaining collection quantity/i);
        expect(conn.rollback).toHaveBeenCalled();
    });

    it('accounts for approved and pending deliveries', async () => {
        const conn = setupCreateDelivery({
            approvedTons: 1,
            pendingTons: 0.5
        });

        const res = await request(app)
            .post(url)
            .set(worker)
            .send({
                ...deliveryBody,
                delivered_tons: 0.5
            });

        expect(res.status).toBe(201);

        const usageCall = conn.query.mock.calls.find(([sql]) =>
            normaliseSql(sql).includes('sum(')
        );

        expect(usageCall).toBeDefined();
    });

    it('rolls back when a database operation fails', async () => {
        const conn = makeConnection(async (sql) => {
            const query = normaliseSql(sql);

            if (query.includes('from collection_logs')) {
                return [[collectionRow]];
            }

            if (query.includes('from disposal_sites')) {
                return [[{ site_id: 2 }]];
            }

            if (query.includes('sum(')) {
                return [[{ approved_tons: 0, pending_tons: 0 }]];
            }

            if (query.startsWith('insert into disposal_logs')) {
                throw new Error('Database failure');
            }

            throw new Error(`Unexpected SQL: ${query}`);
        });

        const res = await request(app)
            .post(url)
            .set(worker)
            .send(deliveryBody);

        expect(res.status).toBe(500);
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });
});

// =========================================================
// GET /api/disposal/deliveries
// =========================================================

describe('GET /api/disposal/deliveries', () => {
    const url = '/api/disposal/deliveries';

    it('rejects unauthenticated requests', async () => {
        const res = await request(app).get(url);
        expect(res.status).toBe(401);
    });

    it.each([[worker], [supervisor], [admin]])(
        'lists deliveries for role %#',
        async (headers) => {
            db.query.mockResolvedValueOnce([[deliveryRow]]);

            const res = await request(app)
                .get(url)
                .set(headers);

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(1);
            expect(res.body.data[0].delivered_tons).toBe(1.5);
        }
    );

    it('restricts worker list queries to their own records', async () => {
        db.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .get(url)
            .set(worker);

        expect(res.status).toBe(200);
        expect(db.query.mock.calls[0][0]).toMatch(/WHERE d\.worker_id = \?/i);
        expect(db.query.mock.calls[0][1]).toEqual([5]);
    });

    it('returns an empty list', async () => {
        db.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .get(url)
            .set(supervisor);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            count: 0,
            data: []
        });
    });
});

// =========================================================
// GET /api/disposal/deliveries/:id
// =========================================================

describe('GET /api/disposal/deliveries/:id', () => {
    it.each(['abc', '0', '-1', '1.5', '1e3'])(
        'rejects invalid delivery id "%s"',
        async (id) => {
            const res = await request(app)
                .get(`/api/disposal/deliveries/${id}`)
                .set(worker);

            expect(res.status).toBe(400);
            expect(db.query).not.toHaveBeenCalled();
        }
    );

    it('returns 404 when delivery does not exist', async () => {
        db.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .get('/api/disposal/deliveries/99')
            .set(supervisor);

        expect(res.status).toBe(404);
    });

    it('returns a delivery with numeric tonnage', async () => {
        db.query.mockResolvedValueOnce([[deliveryRow]]);

        const res = await request(app)
            .get('/api/disposal/deliveries/20')
            .set(supervisor);

        expect(res.status).toBe(200);
        expect(res.body.data.delivered_tons).toBe(1.5);
    });

    it('prevents a worker from viewing another worker delivery', async () => {
        db.query.mockResolvedValueOnce([[
            { ...deliveryRow, worker_id: 9 }
        ]]);

        const res = await request(app)
            .get('/api/disposal/deliveries/20')
            .set(worker);

        expect(res.status).toBe(403);
    });

    it('allows a worker to view their own delivery', async () => {
        db.query.mockResolvedValueOnce([[deliveryRow]]);

        const res = await request(app)
            .get('/api/disposal/deliveries/20')
            .set(worker);

        expect(res.status).toBe(200);
    });
});

// =========================================================
// PATCH /api/disposal/deliveries/:id/verify
// =========================================================

describe('PATCH /api/disposal/deliveries/:id/verify', () => {
    const url = '/api/disposal/deliveries/20/verify';

    it('rejects unauthenticated requests', async () => {
        const res = await request(app)
            .patch(url)
            .send({ acceptedTons: 1 });

        expect(res.status).toBe(401);
    });

    it.each([[worker], [citizen]])(
        'rejects unauthorized verification role %#',
        async (headers) => {
            const res = await request(app)
                .patch(url)
                .set(headers)
                .send({ acceptedTons: 1 });

            expect(res.status).toBe(403);
            expect(db.getConnection).not.toHaveBeenCalled();
        }
    );

    it.each([
        [{}],
        [{ acceptedTons: -1 }],
        [{ acceptedTons: 1.005 }],
        [{ acceptedTons: 1e12 }],
        [{ acceptedTons: null }],
        [{ acceptedTons: 1, reason: 'x'.repeat(1001) }]
    ])('rejects invalid verification input %#', async (body) => {
        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send(body);

        expect(res.status).toBe(400);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it('accepts numeric strings for acceptedTons', async () => {
        setupVerifyDelivery();

        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send({
                acceptedTons: '1.00',
                reason: 'Partial acceptance test'
            });

        expect(res.status).toBe(200);
    });

    it('partially accepts delivery and updates site load', async () => {
        const conn = setupVerifyDelivery();

        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send({
                acceptedTons: 1,
                reason: 'Partial acceptance test'
            });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            verification_status: 'Approved',
            accepted_tons: 1,
            rejected_tons: 0.5
        });

        expect(conn.commit).toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();

        const siteUpdate = conn.query.mock.calls.find(([sql]) =>
            normaliseSql(sql).startsWith('update disposal_sites')
        );

        expect(siteUpdate).toBeDefined();
        expect(siteUpdate[1]).toEqual([1, 2]);

        expect(recordAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'DISPOSAL_DELIVERY_VERIFIED',
                entityType: 'disposal_delivery',
                entityId: 20,
                executor: conn
            })
        );
    });

    it('requires a reason for partial acceptance', async () => {
        const conn = setupVerifyDelivery();

        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send({ acceptedTons: 1 });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/reason is required/i);
        expect(conn.rollback).toHaveBeenCalled();
        expect(recordAuditEvent).not.toHaveBeenCalled();
    });

    it('rejects the entire delivery when acceptedTons is zero', async () => {
        const conn = setupVerifyDelivery({
            updatedDelivery: {
                ...deliveryRow,
                verification_status: 'Rejected',
                accepted_tons: '0.00',
                verified_by: 5,
                verification_reason: 'Material not accepted'
            }
        });

        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send({
                acceptedTons: 0,
                reason: 'Material not accepted'
            });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            verification_status: 'Rejected',
            accepted_tons: 0,
            rejected_tons: 1.5
        });

        expect(conn.query.mock.calls.some(([sql]) =>
            normaliseSql(sql).startsWith('update disposal_sites')
        )).toBe(false);

        expect(recordAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'DISPOSAL_DELIVERY_REJECTED'
            })
        );
    });

    it('requires a reason for full rejection', async () => {
        const conn = setupVerifyDelivery();

        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send({ acceptedTons: 0 });

        expect(res.status).toBe(400);
        expect(conn.rollback).toHaveBeenCalled();
    });

    it('allows full acceptance without a reason', async () => {
        const conn = setupVerifyDelivery({
            updatedDelivery: {
                ...deliveryRow,
                verification_status: 'Approved',
                accepted_tons: '1.50',
                verified_by: 5,
                verification_reason: null
            }
        });

        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send({ acceptedTons: 1.5 });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            verification_status: 'Approved',
            accepted_tons: 1.5,
            rejected_tons: 0
        });

        expect(conn.commit).toHaveBeenCalled();
    });

    it('returns 400 when accepted quantity exceeds delivered quantity', async () => {
        const conn = setupVerifyDelivery();

        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send({
                acceptedTons: 2,
                reason: 'Test reason'
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/cannot exceed/i);
        expect(conn.rollback).toHaveBeenCalled();
    });

    it('returns 409 when accepted quantity exceeds site capacity', async () => {
        const conn = setupVerifyDelivery({
            site: {
                site_id: 2,
                current_load_tons: '99.00',
                max_capacity_tons: '100.00'
            }
        });

        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send({
                acceptedTons: 1.5,
                reason: 'Test reason'
            });

        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/site capacity/i);
        expect(conn.rollback).toHaveBeenCalled();
    });

    it('returns 409 when delivery has already been verified', async () => {
        const conn = setupVerifyDelivery({
            delivery: {
                delivery_id: 20,
                collection_log_id: 10,
                site_id: 2,
                worker_id: 5,
                delivered_tons: '1.50',
                verification_status: 'Approved'
            }
        });

        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send({
                acceptedTons: 1,
                reason: 'Test reason'
            });

        expect(res.status).toBe(409);
        expect(conn.rollback).toHaveBeenCalled();
        expect(recordAuditEvent).not.toHaveBeenCalled();
    });

    it('returns 404 when delivery does not exist', async () => {
        const conn = setupVerifyDelivery({ delivery: null });

        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send({
                acceptedTons: 1,
                reason: 'Test reason'
            });

        expect(res.status).toBe(404);
        expect(conn.rollback).toHaveBeenCalled();
    });

    it('does not verify when disposal site is missing', async () => {
        const conn = setupVerifyDelivery({ site: null });

        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send({
                acceptedTons: 1,
                reason: 'Partial acceptance test'
            });

        expect(res.status).toBe(404);
        expect(conn.rollback).toHaveBeenCalled();
        expect(recordAuditEvent).not.toHaveBeenCalled();
    });

    it('rolls back when an unexpected database error occurs', async () => {
        const conn = makeConnection(async (sql) => {
            const query = normaliseSql(sql);

            if (
                query.includes('from disposal_logs') &&
                query.includes('for update')
            ) {
                return [[{
                    delivery_id: 20,
                    collection_log_id: 10,
                    site_id: 2,
                    worker_id: 5,
                    delivered_tons: '1.50',
                    verification_status: 'Pending'
                }]];
            }

            if (
                query.includes('from disposal_sites') &&
                query.includes('for update')
            ) {
                throw new Error('Database failure');
            }

            throw new Error(`Unexpected SQL: ${query}`);
        });

        const res = await request(app)
            .patch(url)
            .set(supervisor)
            .send({
                acceptedTons: 1,
                reason: 'Partial acceptance test'
            });

        expect(res.status).toBe(500);
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });
});
