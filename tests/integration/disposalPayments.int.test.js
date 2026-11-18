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
  // collection_logs rows must reference a real assignment (vehicle + ward + worker + shift), so build one per log.
  let seq = 0;
  const addLog = async (workerId, tons, date) => {
    seq += 1;
    const [v] = await db.query('INSERT INTO vehicles (registration_number, capacity_tons) VALUES (?, 20)', [`KA-TEST-${seq}`]);
    const [w] = await db.query('INSERT INTO wards (ward_number, ward_name, zone) VALUES (?, ?, ?)', [`W${seq}`, `Ward ${seq}`, 'Zone']);
    const [a] = await db.query(
      "INSERT INTO assignments (vehicle_id, worker_id, ward_id, shift_date, shift) VALUES (?, ?, ?, ?, 'Morning')",
      [v.insertId, workerId, w.insertId, date]);
    const [r] = await db.query(
      "INSERT INTO collection_logs (assignment_id, worker_id, waste_type, waste_tons, collected_at) VALUES (?, ?, 'Mixed', ?, ?)",
      [a.insertId, workerId, tons, date]);
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

    describe('cancelling a payment', () => {
      let w3;
      const sim = (body) => simulate({ worker_id: w3, period_start: '2026-08-01', period_end: '2026-08-31', rate_per_ton: 50, ...body });
      beforeAll(async () => {
        w3 = await newUser('worker3', 'Worker');
        await addLog(w3, 2, '2026-08-10');
        await addLog(w3, 3, '2026-08-20');
      });

      it('releases the logs so the same period can be paid again', async () => {
        const first = await sim();
        expect(first.status).toBe(201);
        expect((await sim()).status).toBe(409); // logs are locked by the first payment

        const cancelled = await request(app).post(`/api/payments/${first.body.data.payment_id}/cancel`).set(admin());
        expect(cancelled.status).toBe(200);
        expect(cancelled.body).toMatchObject({ released_log_count: 2, data: { status: 'Cancelled', log_count: 0 } });
        expect(cancelled.body.data.cancelled_at).toBeTruthy();

        const again = await sim();
        expect(again.status).toBe(201);
        expect(again.body.data).toMatchObject({ total_tons: 5, amount: 250, log_count: 2 });
        expect(again.body.data.payment_id).not.toBe(first.body.data.payment_id);
      });
      it('refuses to cancel a payment that is already cancelled or paid', async () => {
        const [[cancelledRow]] = await db.query("SELECT payment_id FROM payments WHERE worker_id = ? AND status = 'Cancelled'", [w3]);
        expect((await request(app).post(`/api/payments/${cancelledRow.payment_id}/cancel`).set(admin())).status).toBe(409);

        const [[live]] = await db.query("SELECT payment_id FROM payments WHERE worker_id = ? AND status = 'Simulated'", [w3]);
        expect((await request(app).patch(`/api/payments/${live.payment_id}/status`).set(admin()).send({ status: 'Paid' })).status).toBe(200);
        const res = await request(app).post(`/api/payments/${live.payment_id}/cancel`).set(admin());
        expect(res.status).toBe(409);
        const [items] = await db.query('SELECT COUNT(*) AS n FROM payment_items WHERE payment_id = ?', [live.payment_id]);
        expect(items[0].n).toBe(2); // a Paid payment keeps its logs
      });
      it('a Cancelled payment cannot be marked Paid, and 404 for an unknown payment', async () => {
        const [[cancelledRow]] = await db.query("SELECT payment_id FROM payments WHERE worker_id = ? AND status = 'Cancelled'", [w3]);
        expect((await request(app).patch(`/api/payments/${cancelledRow.payment_id}/status`).set(admin()).send({ status: 'Paid' })).status).toBe(409);
        expect((await request(app).post('/api/payments/999999/cancel').set(admin())).status).toBe(404);
      });
      it('lets only one of many simultaneous cancellations win', async () => {
        const w4 = await newUser('worker4', 'Worker');
        await addLog(w4, 1, '2026-07-05');
        const made = await simulate({ worker_id: w4, period_start: '2026-07-01', period_end: '2026-07-31' });
        const id = made.body.data.payment_id;
        const results = await Promise.all(Array.from({ length: 10 }, () => request(app).post(`/api/payments/${id}/cancel`).set(admin())));
        expect(results.filter((r) => r.status === 200)).toHaveLength(1);
        expect(results.filter((r) => r.status === 409)).toHaveLength(9);
        const [items] = await db.query('SELECT COUNT(*) AS n FROM payment_items WHERE payment_id = ?', [id]);
        expect(items[0].n).toBe(0);
      });
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
        const seen = new Set(all.body.data.map((p) => p.worker_id));
        expect(seen.has(w1) && seen.has(w2)).toBe(true);
        const one = await request(app).get(`/api/payments?worker_id=${w2}&limit=1`).set(admin());
        expect(one.body.data).toHaveLength(1);
        expect((await request(app).get(`/api/payments/${pay2}`).set(sup())).body.data).toMatchObject({ worker_id: w2, total_tons: 4 });
        expect((await request(app).get('/api/payments/999999').set(admin())).status).toBe(404);
      });
      it('summarises payments per status for reports', async () => {
        const all = await request(app).get('/api/payments/summary').set(sup());
        expect(all.status).toBe(200);
        const [[db_]] = await db.query("SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS a FROM payments WHERE status = 'Cancelled'");
        expect(all.body.data.by_status.Cancelled).toMatchObject({ payments: db_.n, amount: Number(db_.a) });
        const [[act]] = await db.query("SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS a FROM payments WHERE status <> 'Cancelled'");
        expect(all.body.data.active).toMatchObject({ payments: act.n, amount: Number(act.a) });

        const one = await request(app).get(`/api/payments/summary?worker_id=${w2}&from=2026-10-01&to=2026-10-31`).set(admin());
        expect(one.body.data.by_status.Simulated).toEqual({ payments: 1, total_tons: 4, amount: 40 });
        const none = await request(app).get('/api/payments/summary?from=2030-01-01&to=2030-12-31').set(admin());
        expect(none.body.data.active).toEqual({ payments: 0, total_tons: 0, amount: 0 });
        expect((await request(app).get('/api/payments/summary').set(workerHdr(w1))).status).toBe(403);
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
