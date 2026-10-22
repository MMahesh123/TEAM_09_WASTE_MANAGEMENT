
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

describe('WMS Dashboard & Complaints API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    
test('GET dashboard summary returns metrics', async () => {
    db.query
        .mockResolvedValueOnce([[
            {
                totalComplaints: 10,
                pendingComplaints: 4,
                resolvedComplaints: 6
            }
        ]])
        .mockResolvedValueOnce([[
            { activeVehicles: 3 }
        ]]);

    const res = await request(app).get('/api/dashboard/summary');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
        totalComplaints: 10,
        pendingComplaints: 4,
        resolvedComplaints: 6,
        activeVehicles: 3,
        wardEfficiency: '84.5%'
    });
});


    test('GET complaints rejects a missing token', async () => {
        const res = await request(app).get('/api/complaints');

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
