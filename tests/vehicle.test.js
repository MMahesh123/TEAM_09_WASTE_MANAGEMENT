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

describe('Vehicle Module Full CRUD, Lifecycle & Auth Tests', () => {
    const adminToken = makeToken('Admin', 1);
    const supervisorToken = makeToken('Supervisor', 2);
    const workerToken = makeToken('Worker', 3);
    const citizenToken = makeToken('Citizen', 4);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- Authentication & Authorization ---
    test('GET /api/vehicles - rejects missing token (401)', async () => {
        const res = await request(app).get('/api/vehicles');
        expect(res.statusCode).toBe(401);
    });

    test('GET /api/vehicles - rejects invalid/malformed token (401)', async () => {
    const res = await request(app)
        .get('/api/vehicles')
        .set('Authorization', 'Bearer invalid.jwt.token');

    expect(res.statusCode).toBe(401);
});
    test('POST /api/vehicles - rejects Worker and Citizen write operations (403)', async () => {
        const workerRes = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${workerToken}`)
            .send({ registration_number: 'KA-01-XY-9999', capacity_tons: 4 });
        expect(workerRes.statusCode).toBe(403);

        const citizenRes = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${citizenToken}`)
            .send({ registration_number: 'KA-01-XY-9999', capacity_tons: 4 });
        expect(citizenRes.statusCode).toBe(403);
    });

    test('DELETE /api/vehicles/:id - allows Admin only, rejects Supervisor (403)', async () => {
        const supRes = await request(app)
            .delete('/api/vehicles/1')
            .set('Authorization', `Bearer ${supervisorToken}`);
        expect(supRes.statusCode).toBe(403);
    });

    // --- Read Operations ---
    test('GET /api/vehicles - returns vehicle list for authenticated users (200)', async () => {
        db.query.mockResolvedValueOnce([[
            { id: 1, registration_number: 'KA-01-AB-1234', capacity_tons: 5, status: 'Available' }
        ]]);

        const res = await request(app)
            .get('/api/vehicles')
            .set('Authorization', `Bearer ${workerToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body[0].registration_number).toBe('KA-01-AB-1234');
    });

    test('GET /api/vehicles/:id - returns 400 on invalid ID and 404 when not found', async () => {
        const badIdRes = await request(app)
            .get('/api/vehicles/abc')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(badIdRes.statusCode).toBe(400);

        db.query.mockResolvedValueOnce([[]]);
        const notFoundRes = await request(app)
            .get('/api/vehicles/999')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(notFoundRes.statusCode).toBe(404);
    });

    // --- Create & Validation ---
    test('POST /api/vehicles - rejects missing registration or non-positive capacity (400)', async () => {
        const resMissing = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ capacity_tons: 5 });
        expect(resMissing.statusCode).toBe(400);

        const resZeroCap = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ registration_number: 'KA-01-AB-1111', capacity_tons: 0 });
        expect(resZeroCap.statusCode).toBe(400);

        const resNegCap = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ registration_number: 'KA-01-AB-1111', capacity_tons: -3 });
        expect(resNegCap.statusCode).toBe(400);
    });

    test('POST /api/vehicles - rejects duplicate registration_number (409)', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1 }]]);

        const res = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ registration_number: 'KA-01-AB-1234', capacity_tons: 5 });

        expect(res.statusCode).toBe(409);
    });

    test('POST /api/vehicles - creates vehicle successfully for Admin (201)', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 12 }]);

        const res = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ registration_number: 'ka-05-mn-4321', capacity_tons: 6 });

        expect(res.statusCode).toBe(201);
        expect(res.body.vehicleId).toBe(12);
        expect(res.body.vehicle.registration_number).toBe('KA-05-MN-4321');
    });

    // --- Update & Delete Operations ---
    test('PUT /api/vehicles/:id - updates vehicle details cleanly (200)', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, registration_number: 'KA-01-AB-1234', capacity_tons: 5, status: 'Available' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .put('/api/vehicles/1')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ registration_number: 'KA-01-AB-1234', capacity_tons: 7.5, status: 'Available' });

        expect(res.statusCode).toBe(200);
        expect(res.body.vehicle.capacity_tons).toBe(7.5);
    });

    test('DELETE /api/vehicles/:id - blocks deletion of Assigned vehicle (409) and deletes Available vehicle (200)', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, status: 'Assigned' }]]);
        const blockedRes = await request(app)
            .delete('/api/vehicles/1')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(blockedRes.statusCode).toBe(409);

        db.query
            .mockResolvedValueOnce([[{ id: 2, status: 'Available' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        const okRes = await request(app)
            .delete('/api/vehicles/2')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(okRes.statusCode).toBe(200);
    });

    // --- Assignment Lifecycle Status Transitions ---
    test('PUT /api/vehicles/:id/status - enforces valid lifecycle transitions and blocks conflicts', async () => {
        // Cannot assign vehicle in Maintenance (409)
        db.query.mockResolvedValueOnce([[{ id: 1, status: 'Maintenance' }]]);
        const maintRes = await request(app)
            .put('/api/vehicles/1/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Assigned' });
        expect(maintRes.statusCode).toBe(409);

        // Cannot double-assign an already Assigned vehicle (409)
        db.query.mockResolvedValueOnce([[{ id: 1, status: 'Assigned' }]]);
        const doubleAssignRes = await request(app)
            .put('/api/vehicles/1/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Assigned' });
        expect(doubleAssignRes.statusCode).toBe(409);

        // Cannot move Assigned vehicle directly to Maintenance (409)
        db.query.mockResolvedValueOnce([[{ id: 1, status: 'Assigned' }]]);
        const activeMaintRes = await request(app)
            .put('/api/vehicles/1/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Maintenance' });
        expect(activeMaintRes.statusCode).toBe(409);

        // Valid transition: Assigned -> In Use (normalized to 'Active' per schema ENUM)
        db.query
            .mockResolvedValueOnce([[{ id: 1, status: 'Assigned' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        const inUseRes = await request(app)
            .put('/api/vehicles/1/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'In Use' });
        expect(inUseRes.statusCode).toBe(200);
        expect(inUseRes.body.status).toBe('Active');

        // Valid transition: Active -> Available (assignment completed or cancelled)
        db.query
            .mockResolvedValueOnce([[{ id: 1, status: 'Active' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        const availRes = await request(app)
            .put('/api/vehicles/1/status')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({ status: 'Available' });
        expect(availRes.statusCode).toBe(200);
        expect(availRes.body.status).toBe('Available');
    });

    // --- Database Error & FK Handling ---
    test('DELETE /api/vehicles/:id - handles FK constraint violation (409) and DB failure (500)', async () => {
        const fkError = new Error('Cannot delete or update a parent row');
        fkError.code = 'ER_ROW_IS_REFERENCED_2';

        db.query
            .mockResolvedValueOnce([[{ id: 3, status: 'Available' }]])
            .mockRejectedValueOnce(fkError);

        const fkRes = await request(app)
            .delete('/api/vehicles/3')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(fkRes.statusCode).toBe(409);

        db.query.mockRejectedValueOnce(new Error('DB connection lost'));
        const errRes = await request(app)
            .get('/api/vehicles')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(errRes.statusCode).toBe(500);
    });
    test('POST /api/vehicles - rejects registration_number exceeding 30 characters (400)', async () => {
        const res = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ registration_number: 'KA-01-VERY-LONG-REGISTRATION-12345', capacity_tons: 5 });

        expect(res.statusCode).toBe(400);
    });
});