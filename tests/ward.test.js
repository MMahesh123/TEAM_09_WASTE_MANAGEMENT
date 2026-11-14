process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/config/db');

jest.mock('../src/config/db', () => ({
    query: jest.fn()
}));

const makeToken = (role, userId = 1) =>
    jwt.sign({ id: userId, userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

describe('Ward Module API & Authorization Tests', () => {
    const adminToken = makeToken('Admin', 1);
    const workerToken = makeToken('Worker', 3);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('GET /api/wards - rejects missing token with 401', async () => {
        const res = await request(app).get('/api/wards');
        expect(res.statusCode).toBe(401);
    });

    test('GET /api/wards - returns wards for authenticated user (200)', async () => {
        db.query.mockResolvedValueOnce([[
            { id: 1, ward_number: 'W-101', ward_name: 'Indiranagar', zone: 'East' }
        ]]);

        const res = await request(app)
            .get('/api/wards')
            .set('Authorization', `Bearer ${workerToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body[0].ward_number).toBe('W-101');
    });

    test('POST /api/wards - rejects Worker role with 403', async () => {
        const res = await request(app)
            .post('/api/wards')
            .set('Authorization', `Bearer ${workerToken}`)
            .send({ ward_number: 'W-102', ward_name: 'Koramangala', zone: 'South' });

        expect(res.statusCode).toBe(403);
    });

    test('POST /api/wards - returns 400 when ward_number or ward_name is missing', async () => {
        const res = await request(app)
            .post('/api/wards')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ zone: 'East' });

        expect(res.statusCode).toBe(400);
    });

    test('POST /api/wards - returns 409 on duplicate ward_number', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, ward_number: 'W-101' }]]);

        const res = await request(app)
            .post('/api/wards')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ward_number: 'W-101', ward_name: 'Indiranagar', zone: 'East' });

        expect(res.statusCode).toBe(409);
    });

    test('POST /api/wards - creates ward successfully for Admin (201)', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 5 }]);

        const res = await request(app)
            .post('/api/wards')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ward_number: 'W-105', ward_name: 'Jayanagar', zone: 'South' });

        expect(res.statusCode).toBe(201);
        expect(res.body.wardId).toBe(5);
    });

    test('POST /api/wards - returns 500 on database error', async () => {
        db.query.mockRejectedValueOnce(new Error('DB failure'));

        const res = await request(app)
            .post('/api/wards')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ward_number: 'W-106', ward_name: 'Whitefield', zone: 'East' });

        expect(res.statusCode).toBe(500);
    });
});