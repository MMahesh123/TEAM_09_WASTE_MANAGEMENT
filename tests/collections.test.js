
// WMS-F-007 / WMS-F-008: Waste Collection Logging & Validation
// Uses real JWTs through the real auth middleware; only the database is mocked.

const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-for-jest-only';

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));

const db = require('../src/config/db');
const app = require('../src/app');

const sign = (userId, role) =>
    jwt.sign({ userId, role }, process.env.JWT_SECRET);

const citizenToken = sign(1, 'Citizen');
const supervisorToken = sign(2, 'Supervisor');
const workerToken = sign(3, 'Worker');
const otherWorkerToken = sign(5, 'Worker');
const adminToken = sign(4, 'Admin');

const validBody = {
    assignment_id: 10,
    waste_type: 'Wet',
    waste_tons: 2.5
};

const assignment = (overrides = {}) => [[{
    id: 10,
    worker_id: 3,
    status: 'In-Progress',
    shift_date: '2026-11-12',
    capacity_tons: '8.00',
    ...overrides
}]];

const logRow = (overrides = {}) => ({
    log_id: 5,
    assignment_id: 10,
    worker_id: 3,
    worker_name: 'ravi',
    vehicle_id: 1,
    ward_id: 2,
    ward_name: 'Indiranagar',
    waste_type: 'Wet',
    waste_tons: '2.50',
    collected_at: '2026-11-12',
    notes: null,
    verification_status: 'Pending',
    accepted_tons: null,
    ...overrides
});

// Transaction connection used by createCollection and verifyCollection.
const conn = {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn()
};

const connSqlCalls = () =>
    conn.query.mock.calls.map(call => call[0]);

// Successful collection creation call sequence:
// 1. Lock/read assignment
// 2. Insert collection
// 3. Insert audit record
// 4. Select created collection
function mockSuccessfulCreate(assignmentOverrides = {}) {
    conn.query
        .mockResolvedValueOnce(assignment(assignmentOverrides))
        .mockResolvedValueOnce([{ insertId: 5 }])
        .mockResolvedValueOnce([{ insertId: 100 }])
        .mockResolvedValueOnce([[logRow()]]);
}

const post = (token, body) => {
    const req = request(app).post('/api/collections');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
};

beforeEach(() => {
    jest.resetAllMocks();
    db.getConnection.mockResolvedValue(conn);
});

describe('POST /api/collections', () => {
    test('TC-COL-01: a Worker records collection against their valid assignment', async () => {
        mockSuccessfulCreate();

        const res = await post(workerToken, {
            ...validBody,
            notes: '  Market road bins  '
        });

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({
            log_id: 5,
            waste_type: 'Wet',
            waste_tons: 2.5
        });

        const [insertSql, params] = conn.query.mock.calls[1];

        expect(insertSql).toContain('INSERT INTO collection_logs');
        expect(params).toEqual([
            10,
            3,
            'Wet',
            2.5,
            '2026-11-12',
            'Market road bins'
        ]);

        expect(connSqlCalls().some(sql =>
            sql.includes('INSERT INTO audit_logs')
        )).toBe(true);

        expect(conn.commit).toHaveBeenCalledTimes(1);
        expect(conn.rollback).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test('ignores a worker_id or collected_at sent in the body', async () => {
        mockSuccessfulCreate();

        await post(workerToken, {
            ...validBody,
            worker_id: 99,
            collected_at: '2020-01-01'
        });

        const params = conn.query.mock.calls[1][1];

        expect(params[1]).toBe(3);
        expect(params[4]).toBe('2026-11-12');
    });

    test('accepts zero tons (non-negative)', async () => {
        mockSuccessfulCreate();

        const res = await post(workerToken, {
            ...validBody,
            waste_tons: 0
        });

        expect(res.statusCode).toBe(201);
    });

    test('accepts a numeric string quantity', async () => {
        mockSuccessfulCreate();

        const res = await post(workerToken, {
            ...validBody,
            waste_tons: '3.75'
        });

        expect(res.statusCode).toBe(201);
        expect(conn.query.mock.calls[1][1][3]).toBe(3.75);
    });

    test('allows logging against a Scheduled assignment', async () => {
        mockSuccessfulCreate({ status: 'Scheduled' });

        const res = await post(workerToken, validBody);

        expect(res.statusCode).toBe(201);
    });

    test('allows an Admin to log on behalf of the assigned worker', async () => {
        mockSuccessfulCreate();

        const res = await post(adminToken, validBody);

        expect(res.statusCode).toBe(201);
        expect(conn.query.mock.calls[1][1][1]).toBe(3);
    });

    test.each([
        ['a negative quantity', { waste_tons: -1 }, /negative/],
        ['a blank quantity', { waste_tons: '' }, /required/],
        ['a whitespace quantity', { waste_tons: '   ' }, /required/],
        ['a missing quantity', { waste_tons: undefined }, /required/],
        ['a null quantity', { waste_tons: null }, /required/],
        ['a non-numeric quantity', { waste_tons: 'abc' }, /required/],
        ['a boolean quantity', { waste_tons: true }, /required/],
        ['more than 2 decimal places', { waste_tons: 1.234 }, /decimal/],
        ['an absurdly large quantity', { waste_tons: 1e12 }, /too large/],
        ['a missing waste type', { waste_type: undefined }, /waste_type/],
        ['an unknown waste type', { waste_type: 'Plastic' }, /waste_type/],
        ['a missing assignment_id', { assignment_id: undefined }, /assignment_id/],
        ['a non-numeric assignment_id', { assignment_id: 'ten' }, /assignment_id/],
        ['non-text notes', { notes: 42 }, /notes/],
        ['overlong notes', { notes: 'x'.repeat(256) }, /notes/]
    ])('TC-COL-02: blocks %s with a validation message', async (_label, override, pattern) => {
        const res = await post(workerToken, {
            ...validBody,
            ...override
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.errors.join(' ')).toMatch(pattern);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('returns 400 for a null body', async () => {
        const res = await request(app)
            .post('/api/collections')
            .set('Authorization', `Bearer ${workerToken}`)
            .set('Content-Type', 'application/json')
            .send('null');

        expect(res.statusCode).toBe(400);
    });

    test('TC-COL-01: returns 404 when the assignment does not exist', async () => {
        conn.query.mockResolvedValueOnce([[]]);

        const res = await post(workerToken, validBody);

        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Assignment not found.');
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.commit).not.toHaveBeenCalled();
    });

    test("returns 403 when a Worker logs against someone else's assignment", async () => {
        conn.query.mockResolvedValueOnce(assignment());

        const res = await post(otherWorkerToken, validBody);

        expect(res.statusCode).toBe(403);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
    });

    test.each(['Completed', 'Cancelled'])(
        'returns 400 for a %s assignment',
        async (status) => {
            conn.query.mockResolvedValueOnce(assignment({ status }));

            const res = await post(workerToken, validBody);

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toContain(status);
            expect(conn.rollback).toHaveBeenCalledTimes(1);
        }
    );

    test('returns 400 when the quantity exceeds the vehicle capacity', async () => {
        conn.query.mockResolvedValueOnce(
            assignment({ capacity_tons: '2.00' })
        );

        const res = await post(workerToken, validBody);

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/capacity/);
    });

    test('skips the capacity check when the vehicle has no capacity set', async () => {
        mockSuccessfulCreate({ capacity_tons: null });

        const res = await post(workerToken, {
            ...validBody,
            waste_tons: 50
        });

        expect(res.statusCode).toBe(201);
    });

    test('rejects a missing token with 401', async () => {
        const res = await post(null, validBody);

        expect(res.statusCode).toBe(401);
    });

    test.each([
        ['Citizen', citizenToken],
        ['Supervisor', supervisorToken]
    ])('rejects a %s with 403', async (_role, token) => {
        const res = await post(token, validBody);

        expect(res.statusCode).toBe(403);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('returns 500 and rolls back when the database fails', async () => {
        conn.query.mockRejectedValueOnce(
            new Error('Database unavailable')
        );

        const res = await post(workerToken, validBody);

        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.release).toHaveBeenCalledTimes(1);
    });
});

describe('GET /api/collections', () => {
    test('a Worker only sees their own records and gets a tonnage total', async () => {
        db.query.mockResolvedValueOnce([[
            logRow(),
            logRow({ log_id: 6, waste_tons: '1.25' })
        ]]);

        const res = await request(app)
            .get('/api/collections?worker_id=9')
            .set('Authorization', `Bearer ${workerToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.count).toBe(2);
        expect(res.body.totalTons).toBe(3.75);
        expect(res.body.data[1].waste_tons).toBe(1.25);
        expect(db.query.mock.calls[0][1]).toEqual([3]);
    });

    test('a Supervisor can filter by assignment, type, date range and worker', async () => {
        db.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .get('/api/collections?assignment_id=10&waste_type=Dry&from=2026-11-01&to=2026-11-30&worker_id=3')
            .set('Authorization', `Bearer ${supervisorToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.totalTons).toBe(0);
        expect(db.query.mock.calls[0][1]).toEqual([
            10,
            'Dry',
            '2026-11-01',
            '2026-11-30',
            3
        ]);
    });

    test.each([
        'assignment_id=x',
        'waste_type=Plastic',
        'from=2026-02-30',
        'to=yesterday',
        'from=2026-11-30&to=2026-11-01',
        'worker_id=-4'
    ])('returns 400 for invalid filter %s', async (query) => {
        const res = await request(app)
            .get(`/api/collections?${query}`)
            .set('Authorization', `Bearer ${supervisorToken}`);

        expect(res.statusCode).toBe(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects a Citizen', async () => {
        const res = await request(app)
            .get('/api/collections')
            .set('Authorization', `Bearer ${citizenToken}`);

        expect(res.statusCode).toBe(403);
    });
});

describe('GET /api/collections/:id', () => {
    test('a Worker can view their own record', async () => {
        db.query.mockResolvedValueOnce([[logRow()]]);

        const res = await request(app)
            .get('/api/collections/5')
            .set('Authorization', `Bearer ${workerToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.data.waste_tons).toBe(2.5);
    });

    test("a Worker cannot view another worker's record", async () => {
        db.query.mockResolvedValueOnce([[logRow()]]);

        const res = await request(app)
            .get('/api/collections/5')
            .set('Authorization', `Bearer ${otherWorkerToken}`);

        expect(res.statusCode).toBe(403);
    });

    test('returns 404 for an unknown record', async () => {
        db.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .get('/api/collections/999')
            .set('Authorization', `Bearer ${supervisorToken}`);

        expect(res.statusCode).toBe(404);
    });

    test('returns 400 for a non-numeric id', async () => {
        const res = await request(app)
            .get('/api/collections/abc')
            .set('Authorization', `Bearer ${supervisorToken}`);

        expect(res.statusCode).toBe(400);
    });
});
