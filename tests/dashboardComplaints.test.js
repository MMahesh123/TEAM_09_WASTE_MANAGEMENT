
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-for-jest-only';

jest.mock('../src/config/db', () => ({
    query: jest.fn()
}));

const db = require('../src/config/db');
const app = require('../src/app');

const citizenToken = jwt.sign(
    { userId: 1, role: 'Citizen', email: 'citizen@example.com' },
    process.env.JWT_SECRET
);

const supervisorToken = jwt.sign(
    { userId: 2, role: 'Supervisor', email: 'supervisor@example.com' },
    process.env.JWT_SECRET
);

const workerToken = jwt.sign(
    { userId: 3, role: 'Worker', email: 'worker@example.com' },
    process.env.JWT_SECRET
);

const adminToken = jwt.sign(
    { userId: 4, role: 'Admin', email: 'admin@example.com' },
    process.env.JWT_SECRET
);

describe('WMS Dashboard & Complaints API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Dashboard access control and summary

    test('GET dashboard summary returns metrics for a Supervisor', async () => {
        db.query
            .mockResolvedValueOnce([[
                {
                    totalComplaints: 10,
                    pendingComplaints: 4,
                    inProgressComplaints: 2,
                    resolvedComplaints: 4
                }
            ]])
            .mockResolvedValueOnce([[
                { activeVehicles: 3 }
            ]]);

        const res = await request(app)
            .get('/api/dashboard/summary')
            .set('Authorization', `Bearer ${supervisorToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual({
            totalComplaints: 10,
            pendingComplaints: 4,
            inProgressComplaints: 2,
            resolvedComplaints: 4,
            activeVehicles: 3
        });
    });

    test('GET dashboard summary allows an Admin', async () => {
        db.query
            .mockResolvedValueOnce([[
                {
                    totalComplaints: 0,
                    pendingComplaints: 0,
                    inProgressComplaints: 0,
                    resolvedComplaints: 0
                }
            ]])
            .mockResolvedValueOnce([[
                { activeVehicles: 0 }
            ]]);

        const res = await request(app)
            .get('/api/dashboard/summary')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual({
            totalComplaints: 0,
            pendingComplaints: 0,
            inProgressComplaints: 0,
            resolvedComplaints: 0,
            activeVehicles: 0
        });
    });

    test('GET dashboard summary rejects a missing token', async () => {
        const res = await request(app)
            .get('/api/dashboard/summary');

        expect(res.statusCode).toBe(401);
    });

    test('GET dashboard summary rejects a Citizen', async () => {
        const res = await request(app)
            .get('/api/dashboard/summary')
            .set('Authorization', `Bearer ${citizenToken}`);

        expect(res.statusCode).toBe(403);
    });

    test('GET dashboard summary rejects a Worker', async () => {
        const res = await request(app)
            .get('/api/dashboard/summary')
            .set('Authorization', `Bearer ${workerToken}`);

        expect(res.statusCode).toBe(403);
    });

    // Complaints API

    test('GET complaints rejects a missing token', async () => {
        const res = await request(app)
            .get('/api/complaints');

        expect(res.statusCode).toBe(401);
    });

    test('GET complaints allows an authenticated Citizen', async () => {
        db.query.mockResolvedValueOnce([[
            { id: 1, ward: 'Ward 12', status: 'Pending' }
        ]]);

        const res = await request(app)
            .get('/api/complaints?ward=Ward%2012')
            .set('Authorization', `Bearer ${citizenToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('POST complaints rejects a missing token', async () => {
        const res = await request(app)
            .post('/api/complaints')
            .send({ description: 'Bin is overflowing' });

        expect(res.statusCode).toBe(401);
    });

    test('POST complaints validates input for an authenticated Citizen', async () => {
        const res = await request(app)
            .post('/api/complaints')
            .set('Authorization', `Bearer ${citizenToken}`)
            .send({ description: 'Bin is overflowing' });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('PATCH status rejects a missing token', async () => {
        const res = await request(app)
            .patch('/api/complaints/1/status')
            .send({ status: 'Resolved' });

        expect(res.statusCode).toBe(401);
    });

    test('PATCH status rejects a Citizen', async () => {
        const res = await request(app)
            .patch('/api/complaints/1/status')
            .set('Authorization', `Bearer ${citizenToken}`)
            .send({ status: 'Resolved' });

        expect(res.statusCode).toBe(403);
    });

    test('PATCH status rejects an invalid status for a Supervisor', async () => {
        const res = await request(app)
            .patch('/api/complaints/1/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Unknown' });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('PATCH status rejects a missing status for a Supervisor', async () => {
        const res = await request(app)
            .patch('/api/complaints/1/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({});

        expect(res.statusCode).toBe(400);
    });
});
