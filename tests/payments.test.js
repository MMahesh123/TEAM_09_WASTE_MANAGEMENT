jest.mock('../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../src/middleware/authMiddleware', () => require('./helpers/mockAuth'));
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { calculateAmount } = require('../src/controllers/paymentController');

const admin = { 'x-role': 'Admin' };
const worker = { 'x-role': 'Worker', 'x-user-id': '5' };
const valid = { worker_id: 5, period_start: '2026-10-01', period_end: '2026-10-31', rate_per_ton: 600 };
beforeEach(() => db.query.mockReset());

describe('calculateAmount', () => {
  it('multiplies tons by rate', () => expect(calculateAmount(12.5, 600)).toBe(7500));
  it('rounds to 2 decimals', () => expect(calculateAmount(0.333, 10)).toBe(3.33));
  it('is 0 for 0 tons', () => expect(calculateAmount(0, 500)).toBe(0));
});

describe('POST /api/payments/calculate', () => {
  it('requires staff', async () => {
    expect((await request(app).post('/api/payments/calculate').set(worker).send(valid)).status).toBe(403);
  });
  it.each([
    [{ ...valid, worker_id: 'x' }],
    [{ ...valid, period_start: '01-10-2026' }],
    [{ ...valid, period_start: '2026-11-01', period_end: '2026-10-01' }],
    [{ ...valid, rate_per_ton: 0 }],
  ])('returns 400 for invalid body %#', async (bad) => {
    expect((await request(app).post('/api/payments/calculate').set(admin).send(bad)).status).toBe(400);
  });
  it('calculates from collection logs without saving', async () => {
    db.query.mockResolvedValueOnce([[{ total_tons: '10.50', log_count: 3 }]]);
    const res = await request(app).post('/api/payments/calculate').set(admin).send(valid);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total_tons: 10.5, amount: 6300, log_count: 3 });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('uses the default rate when none is given', async () => {
    db.query.mockResolvedValueOnce([[{ total_tons: '2', log_count: 1 }]]);
    const { rate_per_ton, ...noRate } = valid;
    const res = await request(app).post('/api/payments/calculate').set(admin).send(noRate);
    expect(res.status).toBe(200);
    expect(res.body.data.rate_per_ton).toBeGreaterThan(0);
  });
});

describe('POST /api/payments/simulate', () => {
  it('rejects when there are no logs', async () => {
    db.query.mockResolvedValueOnce([[{ total_tons: '0', log_count: 0 }]]);
    expect((await request(app).post('/api/payments/simulate').set(admin).send(valid)).status).toBe(400);
  });
  it('stores a simulated payment with a reference number', async () => {
    db.query.mockResolvedValueOnce([[{ total_tons: '10', log_count: 2 }]]).mockResolvedValueOnce([{ insertId: 11 }]);
    const res = await request(app).post('/api/payments/simulate').set(admin).send(valid);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ payment_id: 11, status: 'Simulated', amount: 6000 });
    expect(res.body.data.reference_no).toMatch(/^SIM-[0-9A-F]{12}$/);
  });
});

describe('GET /api/payments', () => {
  it('workers only see their own', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await request(app).get('/api/payments').set(worker);
    expect(db.query.mock.calls[0][1]).toEqual([5]);
  });
  it('admin can filter by worker', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await request(app).get('/api/payments?worker_id=8').set(admin);
    expect(db.query.mock.calls[0][1]).toEqual([8]);
  });
  it('rejects a bad worker_id filter', async () => {
    expect((await request(app).get('/api/payments?worker_id=abc').set(admin)).status).toBe(400);
  });
  it('blocks a worker from another worker’s payment', async () => {
    db.query.mockResolvedValueOnce([[{ payment_id: 1, worker_id: 9 }]]);
    expect((await request(app).get('/api/payments/1').set(worker)).status).toBe(403);
  });
  it('returns own payment', async () => {
    db.query.mockResolvedValueOnce([[{ payment_id: 1, worker_id: 5 }]]);
    expect((await request(app).get('/api/payments/1').set(worker)).status).toBe(200);
  });
  it('404 when missing', async () => {
    db.query.mockResolvedValueOnce([[]]);
    expect((await request(app).get('/api/payments/1').set(admin)).status).toBe(404);
  });
});
