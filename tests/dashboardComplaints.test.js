// Dashboard & Complaints Tests
const request = require('supertest');
// Assuming app is exported from app.js or server.js
const app = require('../src/app'); 

describe('WMS Dashboard & Complaints API', () => {
    test('GET /api/dashboard/summary should return success and metrics', async () => {
        const res = await request(app).get('/api/dashboard/summary');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('POST /api/complaints should fail if ward or type is missing', async () => {
        const res = await request(app)
            .post('/api/complaints')
            .send({ description: 'Bin is overflowing' });
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });
});