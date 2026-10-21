// Dashboard & Complaints Tests
const request = require('supertest');
const app = require('../src/app'); 

describe('WMS Dashboard & Complaints API', () => {
    test('GET /api/dashboard/summary should return success and metrics', async () => {
        const res = await request(app).get('/api/dashboard/summary');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('totalComplaints');
    });

    test('GET /api/complaints should return list and support ward filter', async () => {
        const res = await request(app).get('/api/complaints?ward=Ward%2012');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBeGreaterThan(0);
    });

    test('POST /api/complaints should fail if ward or type is missing', async () => {
        const res = await request(app)
            .post('/api/complaints')
            .send({ description: 'Bin is overflowing' });
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('PATCH /api/complaints/:id/status should update complaint status successfully', async () => {
        const res = await request(app)
            .patch('/api/complaints/1/status')
            .send({ status: 'Resolved' });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('Resolved');
    });

    test('PATCH /api/complaints/:id/status should fail if status is missing', async () => {
        const res = await request(app)
            .patch('/api/complaints/1/status')
            .send({});
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });
});