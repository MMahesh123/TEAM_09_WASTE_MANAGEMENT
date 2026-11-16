jest.mock('../src/config/db', () => require('./helpers/mockDb').makeDb());
jest.mock('../src/middleware/authMiddleware', () => require('./helpers/mockAuth'));
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { resetDb } = require('./helpers/mockDb');
const { calculateAmount } = require('../src/controllers/paymentController');

const admin = { 'x-role': 'Admin' };
const sup = { 'x-role': 'Supervisor' };
const worker = { 'x-role': 'Worker', 'x-user-id': '5' };
const citizen = { 'x-role': 'Citizen', 'x-user-id': '9' };
const valid = { worker_id: 5, period_start: '2026-10-01', period_end: '2026-10-31', rate_per_ton: 600 };
beforeEach(() => resetDb(db));

const asWorker = () => db.query.mockResolvedValueOnce([[{ role: 'Worker' }]]);
const logs = (...l) => l.map(([log_id, waste_tons, paid = 0]) => ({ log_id, waste_tons, paid }));
const dbError = () => Object.assign(new Error('secret sql detail'), { code: 'ER_LOCK_DEADLOCK' });

describe('calculateAmount', () => {
  it('multiplies tons by rate', () => expect(calculateAmount(12.5, 600)).toBe(7500));
  it('rounds to 2 decimals', () => expect(calculateAmount(0.333, 10)).toBe(3.33));
  it('is 0 for 0 tons', () => expect(calculateAmount(0, 500)).toBe(0));
});

describe('request validation (calculate and simulate)', () => {
  it.each(['calculate', 'simulate'])('%s requires Admin or Supervisor', async (action) => {
    for (const headers of [worker, citizen]) {
      expect((await request(app).post(`/api/payments/${action}`).set(headers).send(valid)).status).toBe(403);
    }
    expect((await request(app).post(`/api/payments/${action}`).send(valid)).status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });
  it.each([
    ['non-numeric worker_id', { ...valid, worker_id: 'x' }],
    ['zero worker_id', { ...valid, worker_id: 0 }],
    ['missing worker_id', { ...valid, worker_id: undefined }],
    ['wrong date format', { ...valid, period_start: '01-10-2026' }],
    ['impossible date', { ...valid, period_start: '2026-02-31' }],
    ['non-leap Feb 29', { ...valid, period_start: '2026-02-29', period_end: '2026-03-05' }],
    ['month 13', { ...valid, period_end: '2026-13-01' }],
    ['missing dates', { worker_id: 5 }],
    ['reversed period', { ...valid, period_start: '2026-11-01', period_end: '2026-10-01' }],
    ['period over 366 days', { ...valid, period_start: '2026-01-01', period_end: '2027-01-02' }],
    ['zero rate', { ...valid, rate_per_ton: 0 }],
    ['negative rate', { ...valid, rate_per_ton: -1 }],
    ['string rate', { ...valid, rate_per_ton: '600' }],
    ['3-decimal rate', { ...valid, rate_per_ton: 1.005 }],
  ])('returns 400 for %s', async (_name, bad) => {
    for (const action of ['calculate', 'simulate']) {
      expect((await request(app).post(`/api/payments/${action}`).set(admin).send(bad)).status).toBe(400);
    }
    expect(db.query).not.toHaveBeenCalled();
    expect(db.getConnection).not.toHaveBeenCalled();
  });
  it('accepts a period of exactly 366 days', async () => {
    asWorker();
    db.query.mockResolvedValueOnce([logs([1, '1.00'])]);
    const res = await request(app).post('/api/payments/calculate').set(admin)
      .send({ ...valid, period_start: '2024-01-01', period_end: '2024-12-31' });
    expect(res.status).toBe(200);
  });
  it('accepts a single-day period', async () => {
    asWorker();
    db.query.mockResolvedValueOnce([[]]);
    const res = await request(app).post('/api/payments/calculate').set(admin).send({ ...valid, period_start: '2026-10-05', period_end: '2026-10-05' });
    expect(res.status).toBe(200);
  });
});

describe('worker validation', () => {
  it.each([['Citizen'], ['Supervisor'], ['Admin']])('rejects a %s as payee', async (role) => {
    db.query.mockResolvedValueOnce([[{ role }]]);
    const res = await request(app).post('/api/payments/calculate').set(admin).send(valid);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Worker role/);
    expect(db.query).toHaveBeenCalledTimes(1); // no collection query before the role check
  });
  it('returns 404 when the user does not exist', async () => {
    db.query.mockResolvedValueOnce([[]]);
    expect((await request(app).post('/api/payments/simulate').set(admin).send(valid)).status).toBe(404);
    expect(db.getConnection).not.toHaveBeenCalled();
  });
});

describe('POST /api/payments/calculate', () => {
  it('totals only unpaid logs and reports the already-paid ones', async () => {
    asWorker();
    db.query.mockResolvedValueOnce([logs([1, '4.25'], [2, '6.25'], [3, '5.00', 1])]);
    const res = await request(app).post('/api/payments/calculate').set(sup).send(valid);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ log_count: 2, already_paid_log_count: 1, total_tons: 10.5, amount: 6300, rate_per_ton: 600 });
    expect(db.getConnection).not.toHaveBeenCalled(); // calculate never opens a transaction or writes
    expect(db.query.mock.calls[1][0]).not.toMatch(/FOR UPDATE|INSERT/);
    expect(db.query.mock.calls[1][1]).toEqual([5, '2026-10-01', '2026-10-31']);
  });
  it('sums decimals without floating-point drift', async () => {
    asWorker();
    db.query.mockResolvedValueOnce([logs([1, '0.10'], [2, '0.20'], [3, '0.30'])]);
    const res = await request(app).post('/api/payments/calculate').set(admin).send({ ...valid, rate_per_ton: 100 });
    expect(res.body.data.total_tons).toBe(0.6);
    expect(res.body.data.amount).toBe(60);
  });
  it('returns zeros when there is nothing to pay', async () => {
    asWorker();
    db.query.mockResolvedValueOnce([[]]);
    const res = await request(app).post('/api/payments/calculate').set(admin).send(valid);
    expect(res.body.data).toMatchObject({ log_count: 0, total_tons: 0, amount: 0 });
  });
  it('uses the default rate when none is given', async () => {
    asWorker();
    db.query.mockResolvedValueOnce([logs([1, '2.00'])]);
    const { rate_per_ton, ...noRate } = valid;
    const res = await request(app).post('/api/payments/calculate').set(admin).send(noRate);
    expect(res.status).toBe(200);
    expect(res.body.data.rate_per_ton).toBeGreaterThan(0);
  });
  it('rejects an amount that would overflow DECIMAL(12,2)', async () => {
    asWorker();
    db.query.mockResolvedValueOnce([logs([1, '99999999.00'])]);
    const res = await request(app).post('/api/payments/calculate').set(admin).send({ ...valid, rate_per_ton: 99999999.99 });
    expect(res.status).toBe(400);
  });
  it('does not leak database errors', async () => {
    asWorker();
    db.query.mockRejectedValueOnce(dbError());
    const res = await request(app).post('/api/payments/calculate').set(admin).send(valid);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
});

describe('POST /api/payments/simulate', () => {
  const simulate = (body = valid) => request(app).post('/api/payments/simulate').set(admin).send(body);

  it('stores a payment and links exactly the unpaid logs, in one transaction', async () => {
    asWorker();
    db.conn.query
      .mockResolvedValueOnce([logs([1, '4.25'], [2, '6.25'], [3, '9.99', 1])])
      .mockResolvedValueOnce([{ insertId: 11 }])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);
    const res = await simulate();
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ payment_id: 11, status: 'Simulated', total_tons: 10.5, amount: 6300, log_count: 2, already_paid_log_count: 1 });
    expect(res.body.data.reference_no).toMatch(/^SIM-[0-9A-F]{16}$/);

    expect(db.conn.query.mock.calls[0][0]).toMatch(/FOR UPDATE/); // logs are locked while totalled
    expect(db.conn.query.mock.calls[2][1]).toEqual([[[11, 1], [11, 2]]]); // paid log 3 is not linked again
    expect(db.conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(db.conn.commit).toHaveBeenCalledTimes(1);
    expect(db.conn.rollback).not.toHaveBeenCalled();
    expect(db.conn.release).toHaveBeenCalledTimes(1);
  });
  it('is allowed for a Supervisor', async () => {
    asWorker();
    db.conn.query.mockResolvedValueOnce([logs([1, '1.00'])]).mockResolvedValueOnce([{ insertId: 1 }]).mockResolvedValueOnce([{}]);
    expect((await request(app).post('/api/payments/simulate').set(sup).send(valid)).status).toBe(201);
  });
  it('rejects a period with no logs (400) and rolls back', async () => {
    asWorker();
    db.conn.query.mockResolvedValueOnce([[]]);
    const res = await simulate();
    expect(res.status).toBe(400);
    expect(db.conn.rollback).toHaveBeenCalledTimes(1);
    expect(db.conn.commit).not.toHaveBeenCalled();
    expect(db.conn.release).toHaveBeenCalledTimes(1);
  });
  it('rejects a repeated request when every log is already paid (409)', async () => {
    asWorker();
    db.conn.query.mockResolvedValueOnce([logs([1, '4.00', 1], [2, '2.00', 1])]);
    const res = await simulate();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already been paid/);
    expect(db.conn.query).toHaveBeenCalledTimes(1); // nothing was inserted
    expect(db.conn.rollback).toHaveBeenCalled();
  });
  it('rejects unpaid logs that contain zero tons (400)', async () => {
    asWorker();
    db.conn.query.mockResolvedValueOnce([logs([1, '0.00'])]);
    expect((await simulate()).status).toBe(400);
    expect(db.conn.query).toHaveBeenCalledTimes(1);
  });
  it('turns a duplicate-key error from a concurrent request into 409 and rolls back', async () => {
    asWorker();
    db.conn.query
      .mockResolvedValueOnce([logs([1, '1.00'])])
      .mockResolvedValueOnce([{ insertId: 4 }])
      .mockRejectedValueOnce(Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }));
    const res = await simulate();
    expect(res.status).toBe(409);
    expect(db.conn.rollback).toHaveBeenCalledTimes(1);
    expect(db.conn.commit).not.toHaveBeenCalled();
    expect(db.conn.release).toHaveBeenCalledTimes(1);
  });
  it('asks the client to retry after a deadlock', async () => {
    asWorker();
    db.conn.query.mockRejectedValueOnce(dbError());
    const res = await simulate();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/retry/);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
  it('releases the connection and hides details on unexpected errors', async () => {
    asWorker();
    db.conn.query.mockRejectedValueOnce(new Error('secret sql detail'));
    const res = await simulate();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
    expect(db.conn.rollback).toHaveBeenCalled();
    expect(db.conn.release).toHaveBeenCalledTimes(1);
  });
  it('returns 500 and never opens a transaction when no connection is available', async () => {
    asWorker();
    db.getConnection.mockRejectedValueOnce(new Error('pool exhausted'));
    expect((await simulate()).status).toBe(500);
  });
  it('rejects an amount that would overflow', async () => {
    asWorker();
    db.conn.query.mockResolvedValueOnce([logs([1, '99999999.00'])]);
    expect((await simulate({ ...valid, rate_per_ton: 99999999.99 })).status).toBe(400);
    expect(db.conn.query).toHaveBeenCalledTimes(1);
  });
  it('generates a distinct reference for every payment', async () => {
    const refs = new Set();
    for (let i = 0; i < 20; i++) {
      asWorker();
      db.conn.query.mockResolvedValueOnce([logs([1, '1.00'])]).mockResolvedValueOnce([{ insertId: i + 1 }]).mockResolvedValueOnce([{}]);
      refs.add((await simulate()).body.data.reference_no);
    }
    expect(refs.size).toBe(20);
  });
});

describe('GET /api/payments', () => {
  const row = { payment_id: 1, worker_id: 5, total_tons: '10.50', rate_per_ton: '600.00', amount: '6300.00', status: 'Simulated', log_count: 2 };

  it('workers only see their own payments, even when they ask for another worker', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await request(app).get('/api/payments?worker_id=99').set(worker);
    expect(db.query.mock.calls[0][1]).toEqual([5, 50, 0]);
    expect(db.query.mock.calls[0][0]).toMatch(/p\.worker_id = \?/);
  });
  it('staff see every payment by default', async () => {
    db.query.mockResolvedValueOnce([[row]]);
    const res = await request(app).get('/api/payments').set(sup);
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][0]).not.toMatch(/WHERE p\./);
    expect(res.body).toMatchObject({ count: 1, limit: 50, offset: 0 });
    expect(res.body.data[0]).toMatchObject({ total_tons: 10.5, rate_per_ton: 600, amount: 6300, log_count: 2 });
  });
  it('admin can filter by worker and status with paging', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await request(app).get('/api/payments?worker_id=8&status=Paid&limit=10&offset=20').set(admin);
    expect(db.query.mock.calls[0][1]).toEqual([8, 'Paid', 10, 20]);
  });
  it.each([
    ['worker_id=abc'], ['worker_id=0'], ['status=Cancelled'], ['limit=0'], ['limit=201'], ['limit=abc'], ['offset=-1'], ['offset=1.5'],
  ])('rejects bad query %s', async (qs) => {
    expect((await request(app).get(`/api/payments?${qs}`).set(admin)).status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('forbids citizens', async () => {
    expect((await request(app).get('/api/payments').set(citizen)).status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('GET /api/payments/:id', () => {
  const row = { payment_id: 1, worker_id: 5, total_tons: '1.00', rate_per_ton: '2.00', amount: '2.00', log_count: 1 };
  it('blocks a worker from another worker’s payment', async () => {
    db.query.mockResolvedValueOnce([[{ ...row, worker_id: 9 }]]);
    expect((await request(app).get('/api/payments/1').set(worker)).status).toBe(403);
  });
  it('returns the worker’s own payment with numeric values', async () => {
    db.query.mockResolvedValueOnce([[row]]);
    const res = await request(app).get('/api/payments/1').set(worker);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total_tons: 1, amount: 2, log_count: 1 });
  });
  it.each([[admin], [sup]])('lets staff read any payment %#', async (headers) => {
    db.query.mockResolvedValueOnce([[{ ...row, worker_id: 9 }]]);
    expect((await request(app).get('/api/payments/1').set(headers)).status).toBe(200);
  });
  it('404 when missing', async () => {
    db.query.mockResolvedValueOnce([[]]);
    expect((await request(app).get('/api/payments/1').set(admin)).status).toBe(404);
  });
  it('400 for a bad id', async () => {
    expect((await request(app).get('/api/payments/abc').set(admin)).status).toBe(400);
  });
  it('403 for citizens before touching the database', async () => {
    expect((await request(app).get('/api/payments/1').set(citizen)).status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/payments/:id/status', () => {
  const url = '/api/payments/3/status';
  it.each([[sup], [worker], [citizen]])('only Admin may change status (role %#)', async (headers) => {
    expect((await request(app).patch(url).set(headers).send({ status: 'Paid' })).status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('requires a token', async () => {
    expect((await request(app).patch(url).send({ status: 'Paid' })).status).toBe(401);
  });
  it.each([[{ status: 'Simulated' }], [{ status: 'Cancelled' }], [{}], [undefined]])('rejects body %#', async (body) => {
    const r = request(app).patch(url).set(admin);
    expect((await (body ? r.send(body) : r)).status).toBe(400);
  });
  it('400 for a bad id', async () => {
    expect((await request(app).patch('/api/payments/abc/status').set(admin).send({ status: 'Paid' })).status).toBe(400);
  });
  it('moves Simulated to Paid with a conditional UPDATE', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ payment_id: 3, status: 'Paid', total_tons: '1', rate_per_ton: '1', amount: '1', log_count: 1 }]]);
    const res = await request(app).patch(url).set(admin).send({ status: 'Paid' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Paid');
    expect(db.query.mock.calls[0][0]).toMatch(/status = 'Simulated'/);
  });
  it('a repeated request gets 409', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[{ status: 'Paid' }]]);
    const res = await request(app).patch(url).set(admin).send({ status: 'Paid' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already Paid/);
  });
  it('404 for an unknown payment', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
    expect((await request(app).patch(url).set(admin).send({ status: 'Paid' })).status).toBe(404);
  });
});
