
process.env.WAGE_RATE_PER_TON = '600'; // Test-only fixture. Not the approved project rate.

jest.mock('../src/config/db', () => require('./helpers/mockDb').makeDb());
jest.mock('../src/middleware/authMiddleware', () => require('./helpers/mockAuth'));

const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { resetDb } = require('./helpers/mockDb');
const { calculateAmount } = require('../src/controllers/paymentController');

const admin = { 'x-role': 'Admin', 'x-user-id': '1' };
const sup = { 'x-role': 'Supervisor', 'x-user-id': '2' };
const worker = { 'x-role': 'Worker', 'x-user-id': '5' };
const citizen = { 'x-role': 'Citizen', 'x-user-id': '9' };

const valid = {
  worker_id: 5,
  period_start: '2026-10-01',
  period_end: '2026-10-31'
};

beforeEach(() => {
  process.env.WAGE_RATE_PER_TON = '600';
  resetDb(db);
});

const asWorker = () =>
  db.query.mockResolvedValueOnce([[{ role: 'Worker' }]]);

// accepted_tons represents the Supervisor-approved quantity.
const logs = (...items) =>
  items.map(([log_id, accepted_tons, paid = 0]) => ({
    log_id,
    accepted_tons,
    paid
  }));

const dbError = () =>
  Object.assign(new Error('secret sql detail'), {
    code: 'ER_LOCK_DEADLOCK'
  });

describe('calculateAmount', () => {
  it('multiplies tons by rate', () => {
    expect(calculateAmount(12.5, 600)).toBe(7500);
  });

  it('rounds to 2 decimals', () => {
    expect(calculateAmount(0.333, 10)).toBe(3.33);
  });

  it('returns zero for zero tons', () => {
    expect(calculateAmount(0, 500)).toBe(0);
  });
});

describe('request validation', () => {
  it.each(['calculate', 'simulate'])(
    '%s requires Admin or Supervisor',
    async (action) => {
      for (const headers of [worker, citizen]) {
        const res = await request(app)
          .post(`/api/payments/${action}`)
          .set(headers)
          .send(valid);

        expect(res.status).toBe(403);
      }

      expect(
        (await request(app)
          .post(`/api/payments/${action}`)
          .send(valid)).status
      ).toBe(401);

      expect(db.query).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['non-numeric worker_id', { ...valid, worker_id: 'x' }],
    ['zero worker_id', { ...valid, worker_id: 0 }],
    ['missing worker_id', { ...valid, worker_id: undefined }],
    ['wrong date format', { ...valid, period_start: '01-10-2026' }],
    ['impossible date', { ...valid, period_start: '2026-02-31' }],
    ['non-leap February 29', {
      ...valid,
      period_start: '2026-02-29',
      period_end: '2026-03-05'
    }],
    ['month 13', { ...valid, period_end: '2026-13-01' }],
    ['missing dates', { worker_id: 5 }],
    ['reversed period', {
      ...valid,
      period_start: '2026-11-01',
      period_end: '2026-10-01'
    }],
    ['period over 366 days', {
      ...valid,
      period_start: '2026-01-01',
      period_end: '2027-01-02'
    }],
    ['request rate override', { ...valid, rate_per_ton: 100 }],
    ['zero request rate', { ...valid, rate_per_ton: 0 }],
    ['negative request rate', { ...valid, rate_per_ton: -1 }]
  ])('returns 400 for %s', async (_name, body) => {
    for (const action of ['calculate', 'simulate']) {
      const res = await request(app)
        .post(`/api/payments/${action}`)
        .set(admin)
        .send(body);

      expect(res.status).toBe(400);
    }

    expect(db.query).not.toHaveBeenCalled();
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('returns 503 when the payment rate is missing', async () => {
    delete process.env.WAGE_RATE_PER_TON;

    const res = await request(app)
      .post('/api/payments/calculate')
      .set(admin)
      .send(valid);

    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/not configured/i);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 503 when the payment rate is invalid', async () => {
    process.env.WAGE_RATE_PER_TON = '0';

    const res = await request(app)
      .post('/api/payments/calculate')
      .set(admin)
      .send(valid);

    expect(res.status).toBe(503);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('accepts a period of exactly 366 days', async () => {
    asWorker();
    db.query.mockResolvedValueOnce([logs([1, '1.00'])]);

    const res = await request(app)
      .post('/api/payments/calculate')
      .set(admin)
      .send({
        ...valid,
        period_start: '2024-01-01',
        period_end: '2024-12-31'
      });

    expect(res.status).toBe(200);
  });

  it('accepts a single-day period', async () => {
    asWorker();
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/payments/calculate')
      .set(admin)
      .send({
        ...valid,
        period_start: '2026-10-05',
        period_end: '2026-10-05'
      });

    expect(res.status).toBe(200);
  });
});

describe('worker validation', () => {
  it.each(['Citizen', 'Supervisor', 'Admin'])(
    'rejects a %s as payee',
    async (role) => {
      db.query.mockResolvedValueOnce([[{ role }]]);

      const res = await request(app)
        .post('/api/payments/calculate')
        .set(admin)
        .send(valid);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Worker role/i);
      expect(db.query).toHaveBeenCalledTimes(1);
    }
  );

  it('returns 404 when the user does not exist', async () => {
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/payments/simulate')
      .set(admin)
      .send(valid);

    expect(res.status).toBe(404);
    expect(db.getConnection).not.toHaveBeenCalled();
  });
});

describe('POST /api/payments/calculate', () => {
  it('totals only unpaid approved quantities', async () => {
    asWorker();

    db.query.mockResolvedValueOnce([
      logs(
        [1, '4.25'],
        [2, '6.25'],
        [3, '5.00', 1]
      )
    ]);

    const res = await request(app)
      .post('/api/payments/calculate')
      .set(sup)
      .send(valid);

    expect(res.status).toBe(200);

    expect(res.body.data).toMatchObject({
      log_count: 2,
      already_paid_log_count: 1,
      total_tons: 10.5,
      amount: 6300,
      rate_per_ton: 600
    });

    expect(db.getConnection).not.toHaveBeenCalled();

    const collectionQuery = db.query.mock.calls[1][0];

    expect(collectionQuery).toMatch(/verification_status = 'Approved'/);
    expect(collectionQuery).toMatch(/accepted_tons/);
    expect(collectionQuery).toMatch(/accepted_tons > 0/);
    expect(collectionQuery).not.toMatch(/waste_tons/);
    expect(collectionQuery).not.toMatch(/FOR UPDATE|INSERT/);

    expect(db.query.mock.calls[1][1]).toEqual([
      5,
      '2026-10-01',
      '2026-10-31'
    ]);
  });

  it('uses accepted_tons rather than the originally recorded quantity', async () => {
    asWorker();

    db.query.mockResolvedValueOnce([
      [{ log_id: 1, accepted_tons: '1.50', paid: 0 }]
    ]);

    const res = await request(app)
      .post('/api/payments/calculate')
      .set(admin)
      .send(valid);

    expect(res.status).toBe(200);
    expect(res.body.data.total_tons).toBe(1.5);
    expect(res.body.data.amount).toBe(900);
  });

  it('sums decimal quantities without floating-point drift', async () => {
    asWorker();

    db.query.mockResolvedValueOnce([
      logs(
        [1, '0.10'],
        [2, '0.20'],
        [3, '0.30']
      )
    ]);

    const res = await request(app)
      .post('/api/payments/calculate')
      .set(admin)
      .send(valid);

    expect(res.body.data.total_tons).toBe(0.6);
    expect(res.body.data.amount).toBe(360);
  });

  it('returns zero when there are no eligible approved logs', async () => {
    asWorker();
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/payments/calculate')
      .set(admin)
      .send(valid);

    expect(res.status).toBe(200);

    expect(res.body.data).toMatchObject({
      log_count: 0,
      total_tons: 0,
      amount: 0
    });
  });

  it('uses the configured server rate', async () => {
    process.env.WAGE_RATE_PER_TON = '125.50';

    asWorker();
    db.query.mockResolvedValueOnce([logs([1, '2.00'])]);

    const res = await request(app)
      .post('/api/payments/calculate')
      .set(admin)
      .send(valid);

    expect(res.status).toBe(200);
    expect(res.body.data.rate_per_ton).toBe(125.5);
    expect(res.body.data.amount).toBe(251);
  });

  it('rejects an amount that would overflow DECIMAL(12,2)', async () => {
    process.env.WAGE_RATE_PER_TON = '99999999.99';

    asWorker();
    db.query.mockResolvedValueOnce([
      logs([1, '99999999.00'])
    ]);

    const res = await request(app)
      .post('/api/payments/calculate')
      .set(admin)
      .send(valid);

    expect(res.status).toBe(400);
  });

  it('does not expose database errors', async () => {
    asWorker();
    db.query.mockRejectedValueOnce(dbError());

    const res = await request(app)
      .post('/api/payments/calculate')
      .set(admin)
      .send(valid);

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
});

describe('POST /api/payments/simulate', () => {
  const simulate = (body = valid) =>
    request(app)
      .post('/api/payments/simulate')
      .set(admin)
      .send(body);

  it('stores a payment and links only unpaid approved logs in one transaction', async () => {
    asWorker();

    db.conn.query
      .mockResolvedValueOnce([
        logs(
          [1, '4.25'],
          [2, '6.25'],
          [3, '9.99', 1]
        )
      ])
      .mockResolvedValueOnce([{ insertId: 11 }])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);

    const res = await simulate();

    expect(res.status).toBe(201);

    expect(res.body.data).toMatchObject({
      payment_id: 11,
      status: 'Simulated',
      total_tons: 10.5,
      amount: 6300,
      log_count: 2,
      already_paid_log_count: 1
    });

    expect(res.body.data.reference_no).toMatch(
      /^SIM-[0-9A-F]{16}$/
    );

    expect(db.conn.query.mock.calls[0][0]).toMatch(
      /verification_status = 'Approved'/
    );

    expect(db.conn.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);

    expect(db.conn.query.mock.calls[2][1]).toEqual([
      [[11, 1], [11, 2]]
    ]);

    expect(db.conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(db.conn.commit).toHaveBeenCalledTimes(1);
    expect(db.conn.rollback).not.toHaveBeenCalled();
    expect(db.conn.release).toHaveBeenCalledTimes(1);
  });

  it('allows a Supervisor to simulate payment', async () => {
    asWorker();

    db.conn.query
      .mockResolvedValueOnce([logs([1, '1.00'])])
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post('/api/payments/simulate')
      .set(sup)
      .send(valid);

    expect(res.status).toBe(201);
  });

  it('rejects a period with no approved logs and rolls back', async () => {
    asWorker();
    db.conn.query.mockResolvedValueOnce([[]]);

    const res = await simulate();

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/approved collection logs/i);
    expect(db.conn.rollback).toHaveBeenCalledTimes(1);
    expect(db.conn.commit).not.toHaveBeenCalled();
    expect(db.conn.release).toHaveBeenCalledTimes(1);
  });

  it('rejects a repeated request when every eligible log is paid', async () => {
    asWorker();

    db.conn.query.mockResolvedValueOnce([
      logs(
        [1, '4.00', 1],
        [2, '2.00', 1]
      )
    ]);

    const res = await simulate();

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already been paid/i);
    expect(db.conn.query).toHaveBeenCalledTimes(1);
    expect(db.conn.rollback).toHaveBeenCalled();
  });

  it('rejects approved records with zero accepted quantity', async () => {
    asWorker();

    // Normally excluded by the SQL filter; this also tests defensive handling.
    db.conn.query.mockResolvedValueOnce([
      logs([1, '0.00'])
    ]);

    const res = await simulate();

    expect(res.status).toBe(400);
    expect(db.conn.rollback).toHaveBeenCalled();
  });

  it('turns a duplicate-key error into 409 and rolls back', async () => {
    asWorker();

    db.conn.query
      .mockResolvedValueOnce([logs([1, '1.00'])])
      .mockResolvedValueOnce([{ insertId: 4 }])
      .mockRejectedValueOnce(
        Object.assign(new Error('Duplicate entry'), {
          code: 'ER_DUP_ENTRY'
        })
      );

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
    expect(res.body.message).toMatch(/retry/i);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });

  it('releases the connection and hides unexpected errors', async () => {
    asWorker();
    db.conn.query.mockRejectedValueOnce(
      new Error('secret sql detail')
    );

    const res = await simulate();

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
    expect(db.conn.rollback).toHaveBeenCalled();
    expect(db.conn.release).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when no connection is available', async () => {
    asWorker();
    db.getConnection.mockRejectedValueOnce(
      new Error('pool exhausted')
    );

    const res = await simulate();

    expect(res.status).toBe(500);
  });

  it('rejects an amount that would overflow', async () => {
    process.env.WAGE_RATE_PER_TON = '99999999.99';

    asWorker();
    db.conn.query.mockResolvedValueOnce([
      logs([1, '99999999.00'])
    ]);

    const res = await simulate();

    expect(res.status).toBe(400);
    expect(db.conn.query).toHaveBeenCalledTimes(1);
  });

  it('generates a distinct reference for every payment', async () => {
    const refs = new Set();

    for (let i = 0; i < 20; i++) {
      asWorker();

      db.conn.query
        .mockResolvedValueOnce([logs([1, '1.00'])])
        .mockResolvedValueOnce([{ insertId: i + 1 }])
        .mockResolvedValueOnce([{}]);

      const res = await simulate();
      expect(res.status).toBe(201);
      refs.add(res.body.data.reference_no);
    }

    expect(refs.size).toBe(20);
  });
});

describe('GET /api/payments', () => {
  const row = {
    payment_id: 1,
    worker_id: 5,
    total_tons: '10.50',
    rate_per_ton: '600.00',
    amount: '6300.00',
    status: 'Simulated',
    log_count: 2
  };

  it('workers only see their own payments', async () => {
    db.query.mockResolvedValueOnce([[]]);

    await request(app)
      .get('/api/payments?worker_id=99')
      .set(worker);

    expect(db.query.mock.calls[0][1]).toEqual([5, 50, 0]);
    expect(db.query.mock.calls[0][0]).toMatch(/p\.worker_id = \?/);
  });

  it('staff see every payment by default', async () => {
    db.query.mockResolvedValueOnce([[row]]);

    const res = await request(app)
      .get('/api/payments')
      .set(sup);

    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][0]).not.toMatch(/WHERE p\./);
    expect(res.body).toMatchObject({
      count: 1,
      limit: 50,
      offset: 0
    });

    expect(res.body.data[0]).toMatchObject({
      total_tons: 10.5,
      rate_per_ton: 600,
      amount: 6300,
      log_count: 2
    });
  });

  it('Admin can filter by worker and status with paging', async () => {
    db.query.mockResolvedValueOnce([[]]);

    await request(app)
      .get('/api/payments?worker_id=8&status=Paid&limit=10&offset=20')
      .set(admin);

    expect(db.query.mock.calls[0][1]).toEqual([
      8,
      'Paid',
      10,
      20
    ]);
  });

  it.each([
    'worker_id=abc',
    'worker_id=0',
    'status=Cancelled',
    'limit=0',
    'limit=201',
    'limit=abc',
    'offset=-1',
    'offset=1.5'
  ])('rejects bad query %s', async (query) => {
    const res = await request(app)
      .get(`/api/payments?${query}`)
      .set(admin);

    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('forbids citizens', async () => {
    const res = await request(app)
      .get('/api/payments')
      .set(citizen);

    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('GET /api/payments/:id', () => {
  const row = {
    payment_id: 1,
    worker_id: 5,
    total_tons: '1.00',
    rate_per_ton: '2.00',
    amount: '2.00',
    log_count: 1
  };

  it('blocks a worker from another worker payment', async () => {
    db.query.mockResolvedValueOnce([
      [{ ...row, worker_id: 9 }]
    ]);

    const res = await request(app)
      .get('/api/payments/1')
      .set(worker);

    expect(res.status).toBe(403);
  });

  it('returns the worker own payment with numeric values', async () => {
    db.query.mockResolvedValueOnce([[row]]);

    const res = await request(app)
      .get('/api/payments/1')
      .set(worker);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      total_tons: 1,
      amount: 2,
      log_count: 1
    });
  });

  it.each([admin, sup])(
    'allows staff to read any payment',
    async (headers) => {
      db.query.mockResolvedValueOnce([
        [{ ...row, worker_id: 9 }]
      ]);

      const res = await request(app)
        .get('/api/payments/1')
        .set(headers);

      expect(res.status).toBe(200);
    }
  );

  it('returns 404 when missing', async () => {
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .get('/api/payments/1')
      .set(admin);

    expect(res.status).toBe(404);
  });

  it('returns 400 for a bad id', async () => {
    const res = await request(app)
      .get('/api/payments/abc')
      .set(admin);

    expect(res.status).toBe(400);
  });

  it('forbids citizens before querying the database', async () => {
    const res = await request(app)
      .get('/api/payments/1')
      .set(citizen);

    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/payments/:id/status', () => {
  const url = '/api/payments/3/status';

  it.each([sup, worker, citizen])(
    'only Admin may change status',
    async (headers) => {
      const res = await request(app)
        .patch(url)
        .set(headers)
        .send({ status: 'Paid' });

      expect(res.status).toBe(403);
      expect(db.getConnection).not.toHaveBeenCalled();
    }
  );

  it('requires a token', async () => {
    const res = await request(app)
      .patch(url)
      .send({ status: 'Paid' });

    expect(res.status).toBe(401);
  });

  it.each([
    { status: 'Simulated' },
    { status: 'Cancelled' },
    {},
    undefined
  ])('rejects invalid status body', async (body) => {
    const req = request(app)
      .patch(url)
      .set(admin);

    const res = await (body ? req.send(body) : req);

    expect(res.status).toBe(400);
  });

  it('returns 400 for a bad id', async () => {
    const res = await request(app)
      .patch('/api/payments/abc/status')
      .set(admin)
      .send({ status: 'Paid' });

    expect(res.status).toBe(400);
  });

  it('marks Simulated as Paid and records an audit event', async () => {
    const existing = {
      payment_id: 3,
      worker_id: 5,
      status: 'Simulated',
      amount: '600.00',
      reference_no: 'SIM-TEST'
    };

    const updated = {
      ...existing,
      status: 'Paid',
      total_tons: '1.00',
      rate_per_ton: '600.00',
      paid_at: '2026-11-18 10:00:00',
      log_count: 1
    };

    db.conn.query
      .mockResolvedValueOnce([[existing]]) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE
      .mockResolvedValueOnce([{ insertId: 1 }]) // audit_logs INSERT
      .mockResolvedValueOnce([[updated]]); // final SELECT

    const res = await request(app)
      .patch(url)
      .set(admin)
      .send({ status: 'Paid' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Paid');

    expect(db.conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(db.conn.commit).toHaveBeenCalledTimes(1);
    expect(db.conn.rollback).not.toHaveBeenCalled();
    expect(db.conn.release).toHaveBeenCalledTimes(1);

    expect(db.conn.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
    expect(db.conn.query.mock.calls[1][0]).toMatch(/status = 'Paid'/);

    const auditQuery = db.conn.query.mock.calls[2][0];
    expect(auditQuery).toMatch(/INSERT INTO audit_logs/);

    const auditValues = db.conn.query.mock.calls[2][1];
    expect(auditValues).toContain('PAYMENT_MARKED_PAID');
    expect(auditValues).toContain('Payment');
  });

  it('returns 409 when the payment is already Paid', async () => {
    db.conn.query.mockResolvedValueOnce([
      [{ payment_id: 3, status: 'Paid' }]
    ]);

    const res = await request(app)
      .patch(url)
      .set(admin)
      .send({ status: 'Paid' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already Paid/i);
    expect(db.conn.rollback).toHaveBeenCalled();
    expect(db.conn.commit).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown payment', async () => {
    db.conn.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .patch(url)
      .set(admin)
      .send({ status: 'Paid' });

    expect(res.status).toBe(404);
    expect(db.conn.rollback).toHaveBeenCalled();
  });

  it('rolls back the status update if audit insertion fails', async () => {
    db.conn.query
      .mockResolvedValueOnce([[
        {
          payment_id: 3,
          worker_id: 5,
          status: 'Simulated',
          amount: '600.00'
        }
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockRejectedValueOnce(new Error('audit insert failed'));

    const res = await request(app)
      .patch(url)
      .set(admin)
      .send({ status: 'Paid' });

    expect(res.status).toBe(500);
    expect(db.conn.rollback).toHaveBeenCalled();
    expect(db.conn.commit).not.toHaveBeenCalled();
    expect(db.conn.release).toHaveBeenCalled();
  });
});
