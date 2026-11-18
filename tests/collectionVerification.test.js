
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

const supervisorToken = sign(2, 'Supervisor');
const adminToken = sign(4, 'Admin');
const workerToken = sign(3, 'Worker');
const citizenToken = sign(1, 'Citizen');

let conn;

const collectionRow = (overrides = {}) => ({
    log_id: 5,
    assignment_id: 10,
    worker_id: 3,
    worker_name: 'ravi',
    vehicle_id: 1,
    ward_id: 2,
    ward_name: 'Indiranagar',
    waste_type: 'Wet',
    waste_tons: '2.00',
    collected_at: '2026-11-12',
    notes: null,
    created_at: '2026-11-12T10:00:00.000Z',
    verification_status: 'Approved',
    accepted_tons: '1.50',
    verified_by: 2,
    verified_at: '2026-11-12T11:00:00.000Z',
    verification_reason: 'Test reason',
    ...overrides
});

function setupConnection() {
    conn = {
        query: jest.fn(),
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn()
    };

    db.getConnection.mockResolvedValue(conn);
}

function setupSuccessfulVerification({
    recordedTons = '2.00',
    acceptedTons = '1.50',
    status = 'Approved',
    reason = 'Test verification reason'
} = {}) {
    conn.query
        // Lock and retrieve pending collection.
        .mockResolvedValueOnce([[
            {
                log_id: 5,
                waste_tons: recordedTons,
                verification_status: 'Pending'
            }
        ]])

        // Update collection.
        .mockResolvedValueOnce([{ affectedRows: 1 }])

        // Insert audit record.
        .mockResolvedValueOnce([{ insertId: 99 }])

        // Retrieve updated collection.
        .mockResolvedValueOnce([[
            collectionRow({
                waste_tons: recordedTons,
                accepted_tons: acceptedTons,
                verification_status: status,
                verified_by: 2,
                verification_reason: reason
            })
        ]]);
}

const verify = (token, body, id = 5) => {
    const req = request(app).patch(`/api/collections/${id}/verify`);

    if (token) {
        req.set('Authorization', `Bearer ${token}`);
    }

    return req.send(body);
};

beforeEach(() => {
    jest.resetAllMocks();
    setupConnection();
});

describe('PATCH /api/collections/:id/verify', () => {

    test('accepts a partial collection and records the audit event', async () => {
        setupSuccessfulVerification();

        const res = await verify(supervisorToken, {
            acceptedTons: 1.50,
            reason: '0.50 tons rejected after inspection.'
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);

        expect(res.body.data).toMatchObject({
            log_id: 5,
            waste_tons: 2,
            accepted_tons: 1.5,
            rejected_tons: 0.5,
            verification_status: 'Approved',
            verified_by: 2
        });

        expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
        expect(conn.commit).toHaveBeenCalledTimes(1);
        expect(conn.rollback).not.toHaveBeenCalled();

        expect(conn.query).toHaveBeenCalledTimes(4);
        expect(conn.query.mock.calls[0][0]).toContain('FOR UPDATE');
        expect(conn.query.mock.calls[1][0]).toContain('UPDATE collection_logs');
        expect(conn.query.mock.calls[2][0]).toContain('INSERT INTO audit_logs');

        expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test('allows full acceptance without a reason', async () => {
        setupSuccessfulVerification({
            recordedTons: '2.00',
            acceptedTons: '2.00',
            status: 'Approved',
            reason: null
        });

        const res = await verify(supervisorToken, {
            acceptedTons: 2.00
        });

        expect(res.statusCode).toBe(200);

        expect(res.body.data).toMatchObject({
            waste_tons: 2,
            accepted_tons: 2,
            rejected_tons: 0,
            verification_status: 'Approved'
        });

        expect(conn.commit).toHaveBeenCalled();
    });

    test('allows full rejection with a reason', async () => {
        setupSuccessfulVerification({
            recordedTons: '1.00',
            acceptedTons: '0.00',
            status: 'Rejected',
            reason: 'Collection could not be verified.'
        });

        const res = await verify(supervisorToken, {
            acceptedTons: 0,
            reason: 'Collection could not be verified.'
        });

        expect(res.statusCode).toBe(200);

        expect(res.body.data).toMatchObject({
            waste_tons: 1,
            accepted_tons: 0,
            rejected_tons: 1,
            verification_status: 'Rejected'
        });

        expect(conn.query.mock.calls[2][0]).toContain('INSERT INTO audit_logs');
        expect(conn.commit).toHaveBeenCalled();
    });

    test('rejects acceptance greater than recorded quantity', async () => {
        conn.query.mockResolvedValueOnce([[
            {
                log_id: 5,
                waste_tons: '2.00',
                verification_status: 'Pending'
            }
        ]]);

        const res = await verify(supervisorToken, {
            acceptedTons: 3.00,
            reason: 'Invalid test quantity.'
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/cannot exceed/i);

        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });

    test('requires a reason for partial acceptance', async () => {
        conn.query.mockResolvedValueOnce([[
            {
                log_id: 5,
                waste_tons: '2.00',
                verification_status: 'Pending'
            }
        ]]);

        const res = await verify(supervisorToken, {
            acceptedTons: 1.50
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/reason is required/i);

        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    test('requires a reason for full rejection', async () => {
        conn.query.mockResolvedValueOnce([[
            {
                log_id: 5,
                waste_tons: '2.00',
                verification_status: 'Pending'
            }
        ]]);

        const res = await verify(supervisorToken, {
            acceptedTons: 0
        });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/reason is required/i);

        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    test('returns 409 when collection is already verified', async () => {
        conn.query.mockResolvedValueOnce([[
            {
                log_id: 5,
                waste_tons: '2.00',
                verification_status: 'Approved'
            }
        ]]);

        const res = await verify(supervisorToken, {
            acceptedTons: 2.00
        });

        expect(res.statusCode).toBe(409);
        expect(res.body.message).toMatch(/already been verified/i);

        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    test('returns 404 when collection does not exist', async () => {
        conn.query.mockResolvedValueOnce([[]]);

        const res = await verify(supervisorToken, {
            acceptedTons: 1.00
        });

        expect(res.statusCode).toBe(404);

        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    test('rejects Worker verification with 403', async () => {
        const res = await verify(workerToken, {
            acceptedTons: 2.00
        });

        expect(res.statusCode).toBe(403);
        expect(conn.beginTransaction).not.toHaveBeenCalled();
    });

    test('rejects Citizen verification with 403', async () => {
        const res = await verify(citizenToken, {
            acceptedTons: 2.00
        });

        expect(res.statusCode).toBe(403);
        expect(conn.beginTransaction).not.toHaveBeenCalled();
    });

    test('rejects requests without authentication', async () => {
        const res = await verify(null, {
            acceptedTons: 2.00
        });

        expect(res.statusCode).toBe(401);
        expect(conn.beginTransaction).not.toHaveBeenCalled();
    });

    test('allows Admin verification', async () => {
        setupSuccessfulVerification();

        const res = await verify(adminToken, {
            acceptedTons: 1.50,
            reason: 'Admin verification test.'
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(conn.commit).toHaveBeenCalled();
    });

    test('rolls back collection update when audit insertion fails', async () => {
        conn.query
            // Retrieve pending collection.
            .mockResolvedValueOnce([[
                {
                    log_id: 5,
                    waste_tons: '2.00',
                    verification_status: 'Pending'
                }
            ]])

            // Collection update succeeds.
            .mockResolvedValueOnce([{ affectedRows: 1 }])

            // Audit insertion fails.
            .mockRejectedValueOnce(new Error('Audit database failure'));

        const res = await verify(supervisorToken, {
            acceptedTons: 1.50,
            reason: 'Testing audit rollback.'
        });

        expect(res.statusCode).toBe(500);

        expect(conn.beginTransaction).toHaveBeenCalled();
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });

});
