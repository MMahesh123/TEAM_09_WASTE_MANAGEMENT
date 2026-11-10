// WMS-F-006: Vehicle & Staff Shift Assignment (TC-ASG-01 plus negative cases)
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

const sign = (userId, role) => jwt.sign({ userId, role }, process.env.JWT_SECRET);
const citizenToken = sign(1, 'Citizen');
const supervisorToken = sign(2, 'Supervisor');
const workerToken = sign(3, 'Worker');
const otherWorkerToken = sign(5, 'Worker');
const adminToken = sign(4, 'Admin');

const conn = {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn()
};

const validBody = {
    vehicle_id: 1,
    worker_id: 3,
    ward_id: 2,
    shift_date: '2026-11-12',
    shift: 'Morning'
};

const assignmentRow = {
    id: 10,
    vehicle_id: 1,
    registration_number: 'KA-01-AB-1234',
    worker_id: 3,
    worker_name: 'ravi',
    ward_id: 2,
    ward_name: 'Indiranagar',
    shift_date: '2026-11-12',
    shift: 'Morning',
    status: 'Scheduled'
};

// Queues the conn.query results for a successful create, in call order.
function mockSuccessfulCreate() {
    conn.query
        .mockResolvedValueOnce([[{ id: 1, status: 'Available' }]]) // vehicle FOR UPDATE
        .mockResolvedValueOnce([[{ user_id: 3, role: 'Worker' }]]) // worker
        .mockResolvedValueOnce([[{ id: 2 }]]) // ward
        .mockResolvedValueOnce([[]]) // no conflicts
        .mockResolvedValueOnce([{ insertId: 10 }]) // insert
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // vehicle -> Assigned
        .mockResolvedValueOnce([[assignmentRow]]); // select created row
}

const sqlCalls = () => conn.query.mock.calls.map((c) => c[0]);

beforeEach(() => {
    jest.resetAllMocks();
    db.getConnection.mockResolvedValue(conn);
});

describe('Assignments API: authentication and roles', () => {
    test('rejects a missing token with 401', async () => {
        const res = await request(app).get('/api/assignments');
        expect(res.statusCode).toBe(401);
    });

    test('rejects a token signed with the wrong secret with 403', async () => {
        const forged = jwt.sign({ userId: 2, role: 'Supervisor' }, 'not-the-secret');
        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${forged}`)
            .send(validBody);
        expect(res.statusCode).toBe(403);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('rejects a Citizen from listing assignments', async () => {
        const res = await request(app)
            .get('/api/assignments')
            .set('Authorization', `Bearer ${citizenToken}`);
        expect(res.statusCode).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects a Worker from creating an assignment', async () => {
        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${workerToken}`)
            .send(validBody);
        expect(res.statusCode).toBe(403);
        expect(db.getConnection).not.toHaveBeenCalled();
    });
});

describe('POST /api/assignments', () => {
    test('TC-ASG-01: a Supervisor assigns an available vehicle and worker to a ward and shift', async () => {
        mockSuccessfulCreate();

        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send(validBody);

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({ id: 10, status: 'Scheduled', shift: 'Morning' });

        const insert = conn.query.mock.calls[4];
        expect(insert[0]).toContain('INSERT INTO assignments');
        expect(insert[1]).toEqual([1, 3, 2, '2026-11-12', 'Morning', 2]);

        expect(conn.query.mock.calls[5]).toEqual([
            "UPDATE vehicles SET status = 'Assigned' WHERE id = ?",
            [1]
        ]);
        expect(conn.commit).toHaveBeenCalledTimes(1);
        expect(conn.rollback).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test('locks the vehicle row while checking availability', async () => {
        mockSuccessfulCreate();
        await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send(validBody);
        expect(sqlCalls()[0]).toContain('FOR UPDATE');
    });

    test('accepts numeric strings for ids', async () => {
        mockSuccessfulCreate();
        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ ...validBody, vehicle_id: '1', worker_id: '3', ward_id: '2' });
        expect(res.statusCode).toBe(201);
    });

    test('allows an Admin to create an assignment', async () => {
        mockSuccessfulCreate();
        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(validBody);
        expect(res.statusCode).toBe(201);
    });

    test.each([
        ['missing vehicle_id', { vehicle_id: undefined }],
        ['zero worker_id', { worker_id: 0 }],
        ['negative ward_id', { ward_id: -2 }],
        ['impossible shift_date', { shift_date: '2026-02-31' }],
        ['wrongly formatted shift_date', { shift_date: '12/11/2026' }],
        ['unknown shift', { shift: 'Evening' }]
    ])('returns 400 for %s without touching the database', async (_label, override) => {
        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ ...validBody, ...override });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.errors.length).toBeGreaterThan(0);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('returns 400 for a JSON array body', async () => {
        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send([validBody]);
        expect(res.statusCode).toBe(400);
    });

    test('returns 400 when the vehicle is under Maintenance', async () => {
        conn.query.mockResolvedValueOnce([[{ id: 1, status: 'Maintenance' }]]);

        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send(validBody);

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/Maintenance/);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalledTimes(1);
        expect(sqlCalls().some((sql) => sql.includes('INSERT'))).toBe(false);
    });

    test('returns 400 when the vehicle is Inactive', async () => {
        conn.query.mockResolvedValueOnce([[{ id: 1, status: 'Inactive' }]]);
        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send(validBody);
        expect(res.statusCode).toBe(400);
    });

    test('returns 404 when the vehicle does not exist', async () => {
        conn.query.mockResolvedValueOnce([[]]);
        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send(validBody);
        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Vehicle not found.');
    });

    test('returns 404 when the worker does not exist', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 1, status: 'Available' }]])
            .mockResolvedValueOnce([[]]);
        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send(validBody);
        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Worker not found.');
    });

    test('returns 400 when worker_id belongs to a non-Worker user', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 1, status: 'Available' }]])
            .mockResolvedValueOnce([[{ user_id: 3, role: 'Citizen' }]]);
        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send(validBody);
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/Worker role/);
    });

    test('returns 404 when the ward does not exist', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 1, status: 'Available' }]])
            .mockResolvedValueOnce([[{ user_id: 3, role: 'Worker' }]])
            .mockResolvedValueOnce([[]]);
        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send(validBody);
        expect(res.statusCode).toBe(404);
        expect(res.body.message).toBe('Ward not found.');
    });

    test('returns 409 when the vehicle is already booked for that date and shift', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 1, status: 'Assigned' }]])
            .mockResolvedValueOnce([[{ user_id: 3, role: 'Worker' }]])
            .mockResolvedValueOnce([[{ id: 2 }]])
            .mockResolvedValueOnce([[{ vehicle_id: 1, worker_id: 9 }]]);

        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send(validBody);

        expect(res.statusCode).toBe(409);
        expect(res.body.message).toMatch(/vehicle/);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
    });

    test('returns 409 when the worker is already booked for that date and shift', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 1, status: 'Available' }]])
            .mockResolvedValueOnce([[{ user_id: 3, role: 'Worker' }]])
            .mockResolvedValueOnce([[{ id: 2 }]])
            .mockResolvedValueOnce([[{ vehicle_id: 7, worker_id: 3 }]]);

        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send(validBody);

        expect(res.statusCode).toBe(409);
        expect(res.body.message).toMatch(/worker/);
    });

    test('returns 409 when the database unique index catches a race', async () => {
        const dup = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
        conn.query
            .mockResolvedValueOnce([[{ id: 1, status: 'Available' }]])
            .mockResolvedValueOnce([[{ user_id: 3, role: 'Worker' }]])
            .mockResolvedValueOnce([[{ id: 2 }]])
            .mockResolvedValueOnce([[]])
            .mockRejectedValueOnce(dup);

        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send(validBody);

        expect(res.statusCode).toBe(409);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
    });

    test('returns 500 and rolls back when the database fails', async () => {
        conn.query.mockRejectedValueOnce(new Error('Database unavailable'));

        const res = await request(app)
            .post('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send(validBody);

        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.release).toHaveBeenCalledTimes(1);
    });
});

describe('GET /api/assignments', () => {
    test('a Worker only sees their own assignments, even if they ask for another worker', async () => {
        db.query.mockResolvedValueOnce([[assignmentRow]]);

        const res = await request(app)
            .get('/api/assignments?worker_id=9')
            .set('Authorization', `Bearer ${workerToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.count).toBe(1);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('a.worker_id = ?');
        expect(params).toEqual([3]);
    });

    test('a Supervisor can filter by date, shift, status, ward and worker', async () => {
        db.query.mockResolvedValueOnce([[assignmentRow]]);

        const res = await request(app)
            .get('/api/assignments?shift_date=2026-11-12&shift=Morning&status=Scheduled&ward_id=2&worker_id=3')
            .set('Authorization', `Bearer ${supervisorToken}`);

        expect(res.statusCode).toBe(200);
        expect(db.query.mock.calls[0][1]).toEqual(['2026-11-12', 'Morning', 'Scheduled', 2, 3]);
    });

    test('a Supervisor without filters lists everything', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const res = await request(app)
            .get('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`);
        expect(res.statusCode).toBe(200);
        expect(db.query.mock.calls[0][0]).not.toContain('WHERE');
        expect(db.query.mock.calls[0][1]).toEqual([]);
    });

    test.each([
        'shift_date=2026-02-30',
        'shift=Evening',
        'status=Done',
        'ward_id=abc',
        'vehicle_id=-1',
        'worker_id=0'
    ])('returns 400 for invalid filter %s', async (query) => {
        const res = await request(app)
            .get(`/api/assignments?${query}`)
            .set('Authorization', `Bearer ${supervisorToken}`);
        expect(res.statusCode).toBe(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('returns 500 when the database fails', async () => {
        db.query.mockRejectedValueOnce(new Error('Database unavailable'));
        const res = await request(app)
            .get('/api/assignments')
            .set('Authorization', `Bearer ${supervisorToken}`);
        expect(res.statusCode).toBe(500);
    });
});

describe('GET /api/assignments/:id', () => {
    test('a Worker can view their own assignment', async () => {
        db.query.mockResolvedValueOnce([[assignmentRow]]);
        const res = await request(app)
            .get('/api/assignments/10')
            .set('Authorization', `Bearer ${workerToken}`);
        expect(res.statusCode).toBe(200);
        expect(res.body.data.id).toBe(10);
    });

    test("a Worker cannot view another worker's assignment", async () => {
        db.query.mockResolvedValueOnce([[assignmentRow]]);
        const res = await request(app)
            .get('/api/assignments/10')
            .set('Authorization', `Bearer ${otherWorkerToken}`);
        expect(res.statusCode).toBe(403);
    });

    test('returns 404 for an unknown assignment', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const res = await request(app)
            .get('/api/assignments/999')
            .set('Authorization', `Bearer ${supervisorToken}`);
        expect(res.statusCode).toBe(404);
    });

    test('returns 400 for a non-numeric id', async () => {
        const res = await request(app)
            .get('/api/assignments/abc')
            .set('Authorization', `Bearer ${supervisorToken}`);
        expect(res.statusCode).toBe(400);
        expect(db.query).not.toHaveBeenCalled();
    });
});

describe('PATCH /api/assignments/:id/status', () => {
    const current = (status, workerId = 3) => [[{ id: 10, vehicle_id: 1, worker_id: workerId, status }]];

    test('a Worker can start their own scheduled shift', async () => {
        conn.query
            .mockResolvedValueOnce(current('Scheduled'))
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ ...assignmentRow, status: 'In-Progress' }]]);

        const res = await request(app)
            .patch('/api/assignments/10/status')
            .set('Authorization', `Bearer ${workerToken}`)
            .send({ status: 'In-Progress' });

        expect(res.statusCode).toBe(200);
        expect(res.body.data.status).toBe('In-Progress');
        expect(sqlCalls().some((sql) => sql.includes("SET status = 'Available'"))).toBe(false);
        expect(conn.commit).toHaveBeenCalledTimes(1);
    });

    test('completing an assignment releases the vehicle if it has no other live shifts', async () => {
        conn.query
            .mockResolvedValueOnce(current('In-Progress'))
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ ...assignmentRow, status: 'Completed' }]]);

        const res = await request(app)
            .patch('/api/assignments/10/status')
            .set('Authorization', `Bearer ${workerToken}`)
            .send({ status: 'Completed' });

        expect(res.statusCode).toBe(200);
        const release = conn.query.mock.calls[2];
        expect(release[0]).toContain("UPDATE vehicles SET status = 'Available'");
        expect(release[0]).toContain('NOT EXISTS');
        expect(release[1]).toEqual([1, 1]);
    });

    test('a Supervisor can cancel a scheduled assignment', async () => {
        conn.query
            .mockResolvedValueOnce(current('Scheduled'))
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ ...assignmentRow, status: 'Cancelled' }]]);

        const res = await request(app)
            .patch('/api/assignments/10/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Cancelled' });

        expect(res.statusCode).toBe(200);
    });

    test('a Worker cannot cancel an assignment', async () => {
        conn.query.mockResolvedValueOnce(current('Scheduled'));
        const res = await request(app)
            .patch('/api/assignments/10/status')
            .set('Authorization', `Bearer ${workerToken}`)
            .send({ status: 'Cancelled' });
        expect(res.statusCode).toBe(403);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
    });

    test("a Worker cannot update another worker's assignment", async () => {
        conn.query.mockResolvedValueOnce(current('Scheduled', 3));
        const res = await request(app)
            .patch('/api/assignments/10/status')
            .set('Authorization', `Bearer ${otherWorkerToken}`)
            .send({ status: 'In-Progress' });
        expect(res.statusCode).toBe(403);
    });

    test.each([
        ['Completed', 'In-Progress'],
        ['Cancelled', 'Scheduled'],
        ['Scheduled', 'Completed'],
        ['Scheduled', 'Scheduled']
    ])('rejects the transition %s -> %s with 400', async (from, to) => {
        conn.query.mockResolvedValueOnce(current(from));
        const res = await request(app)
            .patch('/api/assignments/10/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: to });
        expect(res.statusCode).toBe(400);
        expect(sqlCalls().some((sql) => sql.startsWith('UPDATE assignments'))).toBe(false);
    });

    test('returns 400 for an unknown status value', async () => {
        const res = await request(app)
            .patch('/api/assignments/10/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Done' });
        expect(res.statusCode).toBe(400);
        expect(res.body.validStatuses).toContain('Completed');
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('returns 404 for an unknown assignment', async () => {
        conn.query.mockResolvedValueOnce([[]]);
        const res = await request(app)
            .patch('/api/assignments/999/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'In-Progress' });
        expect(res.statusCode).toBe(404);
    });

    test('rejects a Citizen', async () => {
        const res = await request(app)
            .patch('/api/assignments/10/status')
            .set('Authorization', `Bearer ${citizenToken}`)
            .send({ status: 'In-Progress' });
        expect(res.statusCode).toBe(403);
    });
});
