
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-for-jest-only';

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));

const db = require('../src/config/db');
const app = require('../src/app');

const mockConnection = {
    beginTransaction: jest.fn(),
    query: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn()
};

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

        db.getConnection.mockResolvedValue(mockConnection);

        mockConnection.beginTransaction.mockResolvedValue(undefined);
        mockConnection.commit.mockResolvedValue(undefined);
        mockConnection.rollback.mockResolvedValue(undefined);

        mockConnection.query.mockReset();
        mockConnection.release.mockReset();
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

        expect(db.query).toHaveBeenCalledTimes(2);
        expect(db.query.mock.calls[0][0]).toContain('FROM complaints');
        expect(db.query.mock.calls[1][0]).toContain('FROM vehicles');
        expect(db.query.mock.calls[1][0])
            .toContain("WHERE status = 'Active'");
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

    test('GET dashboard summary returns zero metrics for an empty database', async () => {
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

    test('GET dashboard summary returns 500 when the database query fails', async () => {
        db.query.mockRejectedValueOnce(
            new Error('Database unavailable')
        );

        const res = await request(app)
            .get('/api/dashboard/summary')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.statusCode).toBe(500);
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

    // Complaints API: listing

    test('GET complaints rejects a missing token', async () => {
        const res = await request(app)
            .get('/api/complaints');

        expect(res.statusCode).toBe(401);
    });

    test('GET complaints allows an authenticated Citizen and filters by owner', async () => {
        db.query.mockResolvedValueOnce([[
            {
                id: 1,
                user_id: 1,
                ward: 'Ward 12',
                status: 'Pending'
            }
        ]]);

        const res = await request(app)
            .get('/api/complaints?ward=Ward%2012')
            .set('Authorization', `Bearer ${citizenToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBe(1);

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM complaints'),
            [1, 'Ward 12']
        );

        expect(db.query.mock.calls[0][0])
            .toContain('user_id = ?');
    });

    test('GET complaints returns 500 when the database query fails', async () => {
        db.query.mockRejectedValueOnce(
            new Error('Database unavailable')
        );

        const res = await request(app)
            .get('/api/complaints')
            .set('Authorization', `Bearer ${citizenToken}`);

        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
    });

    test('GET complaints rejects an invalid status filter', async () => {
        const res = await request(app)
            .get('/api/complaints?status=Unknown')
            .set('Authorization', `Bearer ${citizenToken}`);

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe('Invalid status value.');
        expect(db.query).not.toHaveBeenCalled();
    });

    // Complaint retrieval by ID

    test('GET complaint by ID returns the complaint successfully', async () => {
        db.query.mockResolvedValueOnce([[
            {
                id: 7,
                user_id: 1,
                ward: 'Ward 12',
                type: 'Overflow',
                description: 'Bin is overflowing',
                status: 'Pending'
            }
        ]]);

        const res = await request(app)
            .get('/api/complaints/7')
            .set('Authorization', `Bearer ${citizenToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({
            id: 7,
            user_id: 1,
            ward: 'Ward 12',
            type: 'Overflow',
            status: 'Pending'
        });

        expect(db.query).toHaveBeenCalledWith(
    expect.stringContaining('WHERE c.id = ?'),
    ['7', 1]
);
    });

    test('GET complaint by ID returns 404 when the complaint does not exist', async () => {
        db.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .get('/api/complaints/999')
            .set('Authorization', `Bearer ${citizenToken}`);

        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Complaint not found.');
    });

    test('GET complaint by ID returns 404 for another Citizen complaint', async () => {
        db.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .get('/api/complaints/7')
            .set('Authorization', `Bearer ${citizenToken}`);

        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Complaint not found.');

        expect(db.query).toHaveBeenCalledWith(
    expect.stringContaining('WHERE c.id = ?'),
    ['7', 1]
);
    });

    // Complaint creation

    test('POST complaints creates a complaint successfully', async () => {
        db.query
            .mockResolvedValueOnce([{ insertId: 7 }])
            .mockResolvedValueOnce([[
                {
                    id: 7,
                    user_id: 1,
                    ward: 'Ward 12',
                    type: 'Overflow',
                    description: 'Bin is overflowing',
                    status: 'Pending'
                }
            ]]);

        const res = await request(app)
            .post('/api/complaints')
            .set('Authorization', `Bearer ${citizenToken}`)
            .send({
                ward: 'Ward 12',
                type: 'Overflow',
                description: 'Bin is overflowing'
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({
            id: 7,
            user_id: 1,
            ward: 'Ward 12',
            type: 'Overflow',
            description: 'Bin is overflowing',
            status: 'Pending'
        });

        expect(db.query).toHaveBeenCalledTimes(2);
        expect(db.query.mock.calls[0][0])
            .toContain('INSERT INTO complaints');

        expect(db.query.mock.calls[0][1]).toEqual([
            1,
            'Ward 12',
            'Overflow',
            'Bin is overflowing',
            'Pending'
        ]);
    });

    test('POST complaints ignores a client-supplied user_id', async () => {
        db.query
            .mockResolvedValueOnce([{ insertId: 7 }])
            .mockResolvedValueOnce([[
                {
                    id: 7,
                    user_id: 1,
                    ward: 'Ward 12',
                    type: 'Overflow',
                    description: 'Bin is overflowing',
                    status: 'Pending'
                }
            ]]);

        const res = await request(app)
            .post('/api/complaints')
            .set('Authorization', `Bearer ${citizenToken}`)
            .send({
                user_id: 2,
                ward: 'Ward 12',
                type: 'Overflow',
                description: 'Bin is overflowing'
            });

        expect(res.statusCode).toBe(201);

        expect(db.query.mock.calls[0][1]).toEqual([
            1,
            'Ward 12',
            'Overflow',
            'Bin is overflowing',
            'Pending'
        ]);
    });

    test('POST complaints returns 500 when the database insert fails', async () => {
        db.query.mockRejectedValueOnce(
            new Error('Database unavailable')
        );

        const res = await request(app)
            .post('/api/complaints')
            .set('Authorization', `Bearer ${citizenToken}`)
            .send({
                ward: 'Ward 12',
                type: 'Overflow',
                description: 'Bin is overflowing'
            });

        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
        expect(db.query).toHaveBeenCalledTimes(1);
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
        expect(db.query).not.toHaveBeenCalled();
    });

    test('POST complaints rejects whitespace-only ward and type', async () => {
        const res = await request(app)
            .post('/api/complaints')
            .set('Authorization', `Bearer ${citizenToken}`)
            .send({ ward: '   ', type: '   ' });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('POST complaints rejects non-string ward and type', async () => {
        const res = await request(app)
            .post('/api/complaints')
            .set('Authorization', `Bearer ${citizenToken}`)
            .send({ ward: 123, type: { name: 'Overflow' } });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('POST complaints rejects a null request body', async () => {
        const res = await request(app)
            .post('/api/complaints')
            .set('Authorization', `Bearer ${citizenToken}`)
            .set('Content-Type', 'application/json')
            .send('null');

        expect(res.statusCode).toBe(400);
    });

    // Complaint status updates

    test('PATCH status updates a complaint successfully for a Supervisor and audits it', async () => {
        mockConnection.query
            .mockResolvedValueOnce([[
                {
                    id: 7,
                    user_id: 1,
                    ward: 'Ward 12',
                    type: 'Overflow',
                    description: 'Bin is overflowing',
                    status: 'Pending'
                }
            ]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ insertId: 1 }])
            .mockResolvedValueOnce([[
                {
                    id: 7,
                    user_id: 1,
                    ward: 'Ward 12',
                    type: 'Overflow',
                    description: 'Bin is overflowing',
                    status: 'Resolved'
                }
            ]]);

        const res = await request(app)
            .patch('/api/complaints/7/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Resolved' });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({
            id: 7,
            status: 'Resolved'
        });

        expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
        expect(mockConnection.commit).toHaveBeenCalledTimes(1);
        expect(mockConnection.rollback).not.toHaveBeenCalled();

        expect(mockConnection.query.mock.calls[0][0])
            .toContain('FOR UPDATE');

        expect(mockConnection.query.mock.calls[1][0])
            .toContain('UPDATE complaints SET status');

        expect(mockConnection.query.mock.calls[2][0])
            .toContain('INSERT INTO audit_logs');

        expect(mockConnection.query.mock.calls[2][1])
            .toContain('COMPLAINT_STATUS_UPDATED');

        expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    test('PATCH status returns 404 when the complaint does not exist', async () => {
        mockConnection.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .patch('/api/complaints/999/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Resolved' });

        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Complaint not found.');

        expect(mockConnection.commit).not.toHaveBeenCalled();
        expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
        expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    test('PATCH status returns 500 when the database update fails', async () => {
        mockConnection.query
            .mockResolvedValueOnce([[
                {
                    id: 7,
                    user_id: 1,
                    status: 'Pending'
                }
            ]])
            .mockRejectedValueOnce(
                new Error('Database unavailable')
            );

        const res = await request(app)
            .patch('/api/complaints/7/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Resolved' });

        expect(res.statusCode).toBe(500);
        expect(res.body.success).toBe(false);
        expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
        expect(mockConnection.commit).not.toHaveBeenCalled();
    });

    test('PATCH status rolls back when audit insertion fails', async () => {
        mockConnection.query
            .mockResolvedValueOnce([[
                {
                    id: 7,
                    user_id: 1,
                    status: 'Pending'
                }
            ]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockRejectedValueOnce(
                new Error('Audit insert failed')
            );

        const res = await request(app)
            .patch('/api/complaints/7/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Resolved' });

        expect(res.statusCode).toBe(500);
        expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
        expect(mockConnection.commit).not.toHaveBeenCalled();
        expect(mockConnection.release).toHaveBeenCalledTimes(1);
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

    test('PATCH status rejects a Worker', async () => {
        const res = await request(app)
            .patch('/api/complaints/7/status')
            .set('Authorization', `Bearer ${workerToken}`)
            .send({ status: 'Resolved' });

        expect(res.statusCode).toBe(403);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('PATCH status rejects an invalid status for a Supervisor', async () => {
        const res = await request(app)
            .patch('/api/complaints/1/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Unknown' });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('PATCH status rejects a missing status for a Supervisor', async () => {
        const res = await request(app)
            .patch('/api/complaints/1/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({});

        expect(res.statusCode).toBe(400);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('PATCH status requires a reason for an Admin override', async () => {
        const res = await request(app)
            .patch('/api/complaints/7/status')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'Resolved' });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toContain('reason');
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('PATCH status rejects an empty Admin override reason', async () => {
        const res = await request(app)
            .patch('/api/complaints/7/status')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                status: 'Resolved',
                reason: '   '
            });

        expect(res.statusCode).toBe(400);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('PATCH status allows an Admin override with a reason and audits it', async () => {
        mockConnection.query
            .mockResolvedValueOnce([[
                {
                    id: 7,
                    user_id: 1,
                    status: 'Pending'
                }
            ]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ insertId: 2 }])
            .mockResolvedValueOnce([[
                {
                    id: 7,
                    user_id: 1,
                    status: 'Resolved'
                }
            ]]);

        const res = await request(app)
            .patch('/api/complaints/7/status')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                status: 'Resolved',
                reason: 'Administrative review'
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);

        const auditCall = mockConnection.query.mock.calls[2];

        expect(auditCall[0]).toContain('INSERT INTO audit_logs');
        expect(auditCall[1]).toContain('COMPLAINT_STATUS_OVERRIDE');
        expect(auditCall[1]).toContain('Administrative review');

        expect(mockConnection.commit).toHaveBeenCalledTimes(1);
        expect(mockConnection.rollback).not.toHaveBeenCalled();
    });

    test('PATCH status does not create an audit event for an unchanged status', async () => {
        mockConnection.query.mockResolvedValueOnce([[
            {
                id: 7,
                user_id: 1,
                status: 'Resolved'
            }
        ]]);

        const res = await request(app)
            .patch('/api/complaints/7/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Resolved' });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('Resolved');

        expect(mockConnection.query).toHaveBeenCalledTimes(1);
        expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    });

    test('PATCH status rejects an invalid complaint ID', async () => {
        const res = await request(app)
            .patch('/api/complaints/abc/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Resolved' });

        expect(res.statusCode).toBe(400);
        expect(db.getConnection).not.toHaveBeenCalled();
    });
});
