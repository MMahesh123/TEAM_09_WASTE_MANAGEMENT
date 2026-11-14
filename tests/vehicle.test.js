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

describe('Vehicle Module API & Authorization Tests', () => {
    const adminToken = makeToken('Admin', 1);
    const supervisorToken = makeToken('Supervisor', 2);
    const workerToken = makeToken('Worker', 3);
    const citizenToken = makeToken('Citizen', 4);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- Authentication & Authorization ---
    test('GET /api/vehicles - rejects unauthenticated request with 401', async () => {
        const res = await request(app).get('/api/vehicles');
        expect(res.statusCode).toBe(401);
    });

    test('GET /api/vehicles - allows authenticated user to list vehicles (200)', async () => {
        db.query.mockResolvedValueOnce([[
            { id: 1, registration_number: 'KA-01-AB-1234', capacity_tons: 5, status: 'Available' }
        ]]);

        const res = await request(app)
            .get('/api/vehicles')
            .set('Authorization', `Bearer ${workerToken}`);

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].registration_number).toBe('KA-01-AB-1234');
    });

    test('POST /api/vehicles - rejects Citizen or Worker with 403', async () => {
        const res = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${citizenToken}`)
            .send({ registration_number: 'KA-01-XY-9999', capacity_tons: 4 });

        expect(res.statusCode).toBe(403);
    });

    // --- Validation & Duplicate Handling ---
    test('POST /api/vehicles - returns 400 when required fields are missing', async () => {
        const res = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        expect(res.statusCode).toBe(400);
    });

    test('POST /api/vehicles - returns 409 on duplicate registration_number', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, registration_number: 'KA-01-AB-1234' }]]);

        const res = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ registration_number: 'KA-01-AB-1234', capacity_tons: 5 });

        expect(res.statusCode).toBe(409);
    });

    test('POST /api/vehicles - creates vehicle successfully for Admin (201)', async () => {
        db.query
            .mockResolvedValueOnce([[]]) // duplicate check returns empty
            .mockResolvedValueOnce([{ insertId: 10 }]); // insert succeeds

        const res = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ registration_number: 'KA-05-MN-4321', capacity_tons: 6 });

        expect(res.statusCode).toBe(201);
        expect(res.body.vehicleId).toBe(10);
    });

    // --- Status Transitions & 404 Handling ---
    test('PUT /api/vehicles/:id/status - returns 400 for invalid status value', async () => {
        const res = await request(app)
            .put('/api/vehicles/1/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'BrokenBeyondRepair' });

        expect(res.statusCode).toBe(400);
    });

    test('PUT /api/vehicles/:id/status - returns 404 when vehicle ID does not exist', async () => {
        db.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .put('/api/vehicles/999/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Assigned' });

        expect(res.statusCode).toBe(404);
    });

    test('PUT /api/vehicles/:id/status - updates status cleanly for valid assignment transition (200)', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, status: 'Available' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .put('/api/vehicles/1/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Assigned' });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('Assigned');
    });

    // --- Database Failure Handling ---
    test('GET /api/vehicles - returns 500 when database query fails', async () => {
        db.query.mockRejectedValueOnce(new Error('DB connection lost'));

        const res = await request(app)
            .get('/api/vehicles')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.statusCode).toBe(500);
    });
});