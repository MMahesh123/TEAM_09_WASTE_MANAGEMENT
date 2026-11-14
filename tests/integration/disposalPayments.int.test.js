const { ENABLED, createSchema, dropSchema } = require('./dbSetup');
const d = ENABLED ? describe : describe.skip;

d('disposal and payments against a real database', () => {
  let app, db, request, jwt;
  const token = (role, userId = 1) => 'Bearer ' + jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const admin = () => ({ Authorization: token('Admin', 1) });
  const sup = () => ({ Authorization: token('Supervisor', 2) });
  const workerHdr = (id) => ({ Authorization: token('Worker', id) });

  const newUser = async (name, role) => {
    const [r] = await db.query('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, `${name}@example.com`, 'x', role]);
    return r.insertId;
  };
  const addLog = async (workerId, tons, date) => {
    const [r] = await db.query('INSERT INTO collection_logs (worker_id, waste_tons, collected_at) VALUES (?, ?, ?)', [workerId, tons, date]);
    return r.insertId;
  };
  const newSite = async (name, cap) => {
    const res = await request(app).post('/api/disposal').set(admin()).send({ name, location: 'X', max_capacity_tons: cap });
    return res.body.site_id;
  };

  beforeAll(async () => {
    await createSchema();
    jwt = require('jsonwebtoken');
    request = require('supertest');
    app = require('../../src/app');
    db = require('../../src/config/db');
  });
  afterAll(async () => {
    if (db) await db.end();
    await dropSchema();
  });

  describe('disposal sites', () => {
    it('supports the full CRUD life cycle', async () => {
      const id = await newSite('Lifecycle', 100);
      expect(id).toBeGreaterThan(0);
      let res = await request(app).get(`/api/disposal/${id}`).set(workerHdr(5));
      expect(res.body.data).toMatchObject({ name: 'Lifecycle', max_capacity_tons: 100, current_load_tons: 0, utilization_pct: 0 });
      res = await request(app).put(`/api/disposal/${id}`).set(admin()).send({ name: 'Lifecycle2', location: 'Y', max_capacity_tons: 120.5 });
      expect(res.status).toBe(200);
      // saving identical values must still be a 200 (not a "not found")
      res = await request(app).put(`/api/disposal/${id}`).set(admin()).send({ name: 'Lifecycle2', location: 'Y', max_capacity_tons: 120.5 });
      expect(res.status).toBe(200);
      res = await request(app).delete(`/api/disposal/${id}`).set(admin());
      expect(res.status).toBe(200);
      expect((await request(app).get(`/api/disposal/${id}`).set(admin())).status).toBe(404);
      expect((await request(app).delete(`/api/disposal/${id}`).set(admin())).status).toBe(404);
    });

    it('rejects duplicate names on create and update', async () => {
      await newSite('Dup-A', 10);
      const b = await newSite('Dup-B', 10);
      const res = await request(app).post('/api/disposal').set(admin()).send({ name: 'dup-a', location: 'X', max_capacity_tons: 5 });
      expect(res.status).toBe(409);
      const upd = await request(app).put(`/api/disposal/${b}`).set(admin()).send({ name: 'Dup-A', location: 'X', max_capacity_tons: 10 });
      expect(upd.status).toBe(409);
    });

    it('never exceeds capacity under concurrent additions', async () => {
      const id = await newSite('Concurrent-add', 10);
      const results = await Promise.all(Array.from({ length: 30 }, () =>
        request(app).post(`/api/disposal/${id}/load`).set(sup()).send({ tons: 1, action: 'add' })));
      expect(results.filter((r) => r.status === 200)).toHaveLength(10);
      expect(results.filter((r) => r.status === 400)).toHaveLength(20);
      const site = (await request(app).get(`/api/disposal/${id}`).set(admin())).body.data;
      expect(site.current_load_tons).toBe(10);
    });

    it('never goes negative under concurrent removals', async () => {
      const id = await newSite('Concurrent-remove', 100);
      await request(app).post(`/api/disposal/${id}/load`).set(sup()).send({ tons: 5, action: 'add' });
      const results = await Promise.all(Array.from({ length: 20 }, () =>
        request(app).post(`/api/disposal/${id}/load`).set(sup()).send({ tons: 1, action: 'remove' })));
      expect(results.filter((r) => r.status === 200)).toHaveLength(5);
      expect((await request(app).get(`/api/disposal/${id}`).set(admin())).body.data.current_load_tons).toBe(0);
    });

    it('keeps exact two-decimal arithmetic', async () => {
      const id = await newSite('Decimals', 1);
      for (let i = 0; i < 10; i++) {
        expect((await request(app).post(`/api/disposal/${id}/load`).set(sup()).send({ tons: 0.1, action: 'add' })).status).toBe(200);
      }
      expect((await request(app).post(`/api/disposal/${id}/load`).set(sup()).send({ tons: 0.01, action: 'add' })).status).toBe(400);
      expect((await request(app).get(`/api/disposal/${id}`).set(admin())).body.data.current_load_tons).toBe(1);
    });

    it('blocks shrinking capacity below the load and deleting a loaded site', async () => {
      const id = await newSite('Loaded', 50);
      await request(app).post(`/api/disposal/${id}/load`).set(sup()).send({ tons: 20, action: 'add' });
      const shrink = await request(app).put(`/api/disposal/${id}`).set(admin()).send({ name: 'Loaded', location: 'X', max_capacity_tons: 19.99 });
      expect(shrink.status).toBe(400);
      expect((await request(app).put(`/api/disposal/${id}`).set(admin()).send({ name: 'Loaded', location: 'X', max_capacity_tons: 20 })).status).toBe(200);
      expect((await request(app).delete(`/api/disposal/${id}`).set(admin())).status).toBe(409);
      await request(app).post(`/api/disposal/${id}/load`).set(sup()).send({ tons: 20, action: 'remove' });
      expect((await request(app).delete(`/api/disposal/${id}`).set(admin())).status).toBe(200);
    });

    it('is protected by the real JWT middleware', async () => {
      expect((await request(app).get('/api/disposal')).status).toBe(401);
      expect((await request(app).post('/api/disposal').set(workerHdr(5)).send({})).status).toBe(403);
    });
  });

  describe('payments', () => {
    const period = { period_start: '2026-10-01', period_end: '2026-10-31' };
    let w1, w2, citizenId;
    beforeAll(async () => {
      w1 = await newUser('worker1', 'Worker');
      w2 = await newUser('worker2', 'Worker');
      citizenId = await newUser('citizen1', 'Citizen');
      await addLog(w1, 1.25, '2026-10-01'); // first day of the period (inclusive)
      await addLog(w1, 2.5, '2026-10-15');
      await addLog(w1, 0.1, '2026-10-31'); // last day (inclusive)
      await addLog(w1, 9, '2026-09-30'); // outside
      await addLog(w1, 9, '2026-11-01'); // outside
      await addLog(w2, 4, '2026-10-10');
    });
    const simulate = (body, headers = admin()) => request(app).post('/api/payments/simulate').set(headers).send(body);

    it('calculates from the real logs, inclusive of both period ends', async () => {
      const res = await request(app).post('/api/payments/calculate').set(sup()).send({ worker_id: w1, ...period, rate_per_ton: 100 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ log_count: 3, already_paid_log_count: 0, total_tons: 3.85, amount: 385 });
    });

    it('rejects calculating for a non-Worker or missing user', async () => {
      expect((await simulate({ worker_id: citizenId, ...period })).status).toBe(400);
      expect((await simulate({ worker_id: 99999, ...period })).status).toBe(404);
    });

    it('rejects impossible dates and over-long periods', async () => {
      expect((await simulate({ worker_id: w1, period_start: '2026-02-31', period_end: '2026-03-05' })).status).toBe(400);
      expect((await simulate({ worker_id: w1, period_start: '2026-01-01', period_end: '2027-01-02' })).status).toBe(400);
    });

    it('returns 400 when the period has no logs', async () => {
      const res = await simulate({ worker_id: w2, period_start: '2025-01-01', period_end: '2025-01-31' });
      expect(res.status).toBe(400);
    });

    it('simulates a payment, stores it and links the logs', async () => {
      const res = await simulate({ worker_id: w1, ...period, rate_per_ton: 100 });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ status: 'Simulated', total_tons: 3.85, amount: 385, log_count: 3 });
      expect(res.body.data.reference_no).toMatch(/^SIM-[0-9A-F]{16}$/);
      const [items] = await db.query('SELECT COUNT(*) AS n FROM payment_items WHERE payment_id = ?', [res.body.data.payment_id]);
      expect(items[0].n).toBe(3);
    });

    it('refuses a second payment for the same period (409)', async () => {
      const res = await simulate({ worker_id: w1, ...period });
      expect(res.status).toBe(409);
    });

    it('refuses an overlapping period whose logs are already paid', async () => {
      const res = await simulate({ worker_id: w1, period_start: '2026-10-10', period_end: '2026-10-20' });
      expect(res.status).toBe(409);
    });

    it('pays only the new logs when late logs arrive (no double payment)', async () => {
      await addLog(w1, 2, '2026-10-20');
      const calc = await request(app).post('/api/payments/calculate').set(admin()).send({ worker_id: w1, ...period, rate_per_ton: 100 });
      expect(calc.body.data).toMatchObject({ log_count: 1, already_paid_log_count: 3, total_tons: 2, amount: 200 });
      const res = await simulate({ worker_id: w1, ...period, rate_per_ton: 100 });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ total_tons: 2, log_count: 1 });
    });

    it('lets exactly one of many simultaneous requests pay the same logs', async () => {
      const results = await Promise.all(Array.from({ length: 15 }, () => simulate({ worker_id: w2, ...period, rate_per_ton: 10 })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(14);
      const [rows] = await db.query('SELECT COUNT(*) AS n, SUM(total_tons) AS t FROM payments WHERE worker_id = ?', [w2]);
      expect(rows[0].n).toBe(1);
      expect(Number(rows[0].t)).toBe(4);
    });

    it('enforces the duplicate rule in the database itself', async () => {
      const [p] = await db.query('SELECT payment_id FROM payments WHERE worker_id = ? LIMIT 1', [w2]);
      const [[item]] = await db.query('SELECT log_id FROM payment_items WHERE payment_id = ?', [p[0].payment_id]);
      const [ins] = await db.query(
        "INSERT INTO payments (worker_id, period_start, period_end, total_tons, rate_per_ton, amount, reference_no) VALUES (?, '2026-10-01', '2026-10-31', 1, 1, 1, 'SIM-RAW-1')", [w2]);
      await expect(db.query('INSERT INTO payment_items (payment_id, log_id) VALUES (?, ?)', [ins.insertId, item.log_id]))
        .rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
      await db.query('DELETE FROM payments WHERE payment_id = ?', [ins.insertId]);
    });

    it('rejects invalid rows through CHECK constraints', async () => {
      await expect(db.query(
        "INSERT INTO payments (worker_id, period_start, period_end, total_tons, rate_per_ton, amount, reference_no) VALUES (?, '2026-10-31', '2026-10-01', 1, 1, 1, 'SIM-RAW-2')", [w2]))
        .rejects.toBeDefined();
    });

    describe('visibility and status', () => {
      let pay1, pay2;
      beforeAll(async () => {
        pay1 = (await db.query('SELECT payment_id FROM payments WHERE worker_id = ? ORDER BY payment_id LIMIT 1', [w1]))[0][0].payment_id;
        pay2 = (await db.query('SELECT payment_id FROM payments WHERE worker_id = ? ORDER BY payment_id LIMIT 1', [w2]))[0][0].payment_id;
      });

      it('workers see only their own payments, even when they ask for another worker', async () => {
        const res = await request(app).get(`/api/payments?worker_id=${w2}`).set(workerHdr(w1));
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThan(0);
        expect(res.body.data.every((p) => p.worker_id === w1)).toBe(true);
      });
      it('a worker cannot read another worker’s payment', async () => {
        expect((await request(app).get(`/api/payments/${pay2}`).set(workerHdr(w1))).status).toBe(403);
        expect((await request(app).get(`/api/payments/${pay1}`).set(workerHdr(w1))).status).toBe(200);
      });
      it('staff can list, filter and read any payment', async () => {
        const all = await request(app).get('/api/payments').set(sup());
        expect(new Set(all.body.data.map((p) => p.worker_id))).toEqual(new Set([w1, w2]));
        const one = await request(app).get(`/api/payments?worker_id=${w2}&limit=1`).set(admin());
        expect(one.body.data).toHaveLength(1);
        expect((await request(app).get(`/api/payments/${pay2}`).set(sup())).body.data).toMatchObject({ worker_id: w2, total_tons: 4 });
        expect((await request(app).get('/api/payments/999999').set(admin())).status).toBe(404);
      });
      it('citizens are forbidden', async () => {
        expect((await request(app).get('/api/payments').set({ Authorization: token('Citizen', citizenId) })).status).toBe(403);
      });
      it('only Admin can mark a payment Paid, and only once', async () => {
        expect((await request(app).patch(`/api/payments/${pay1}/status`).set(sup()).send({ status: 'Paid' })).status).toBe(403);
        expect((await request(app).patch(`/api/payments/${pay1}/status`).set(admin()).send({ status: 'Bogus' })).status).toBe(400);
        const ok = await request(app).patch(`/api/payments/${pay1}/status`).set(admin()).send({ status: 'Paid' });
        expect(ok.status).toBe(200);
        expect(ok.body.data.status).toBe('Paid');
        expect(ok.body.data.paid_at).toBeTruthy();
        expect((await request(app).patch(`/api/payments/${pay1}/status`).set(admin()).send({ status: 'Paid' })).status).toBe(409);
        expect((await request(app).patch('/api/payments/999999/status').set(admin()).send({ status: 'Paid' })).status).toBe(404);
        const paid = await request(app).get('/api/payments?status=Paid').set(admin());
        expect(paid.body.data.map((p) => p.payment_id)).toContain(pay1);
      });
    });
  });
});
