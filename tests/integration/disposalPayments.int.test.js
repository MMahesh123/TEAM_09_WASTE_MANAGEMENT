
const { ENABLED, createSchema, dropSchema } = require('./dbSetup');
const d = ENABLED ? describe : describe.skip;

d('disposal and payments against a real database', () => {
  let app, db, request, jwt;
  let adminId, supervisorId;

  const token = (role, userId = 1) =>
    'Bearer ' + jwt.sign(
      { userId, role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

  const admin = () => ({
    Authorization: token('Admin', adminId)
  });

  const sup = () => ({
    Authorization: token('Supervisor', supervisorId)
  });

  const workerHdr = (id) => ({
    Authorization: token('Worker', id)
  });

  const newUser = async (name, role) => {
    const [result] = await db.query(
      `INSERT INTO users
       (username, email, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      [name, `${name}@example.com`, 'test-hash', role]
    );

    return result.insertId;
  };

  const newAssignment = async (workerId, suffix) => {
    const [vehicle] = await db.query(
      `INSERT INTO vehicles
       (registration_number, capacity_tons, status)
       VALUES (?, 10, 'Available')`,
      [`TEST-${suffix}`]
    );

    const [assignment] = await db.query(
      `INSERT INTO assignments
       (vehicle_id, worker_id, ward_id, shift_date, shift, status, created_by)
       VALUES (?, ?, 1, '2026-10-01', 'Morning', 'Scheduled', ?)`,
      [vehicle.insertId, workerId, supervisorId]
    );

    return assignment.insertId;
  };

  // Insert a collection record with its actual verification state.
  // Approved records use accepted_tons for payment calculations.
  const addLog = async ({
    workerId,
    assignmentId,
    tons,
    acceptedTons,
    date,
    status = 'Approved'
  }) => {
    const verifiedBy = status === 'Pending' ? null : supervisorId;
    const verifiedAt = status === 'Pending' ? null : new Date();

    const [result] = await db.query(
      `INSERT INTO collection_logs (
         assignment_id,
         worker_id,
         waste_type,
         waste_tons,
         collected_at,
         verification_status,
         accepted_tons,
         verified_by,
         verified_at
       )
       VALUES (?, ?, 'Wet', ?, ?, ?, ?, ?, ?)`,
      [
        assignmentId,
        workerId,
        tons,
        date,
        status,
        acceptedTons,
        verifiedBy,
        verifiedAt
      ]
    );

    return result.insertId;
  };

  const newSite = async (name, cap) => {
    const res = await request(app)
      .post('/api/disposal')
      .set(admin())
      .send({
        name,
        location: 'X',
        max_capacity_tons: cap
      });

    expect(res.status).toBe(201);
    return res.body.site_id;
  };

  beforeAll(async () => {
    await createSchema();

    // Test-only payment rate. This is not the team's approved production rate.
    process.env.WAGE_RATE_PER_TON = '100';

    jwt = require('jsonwebtoken');
    request = require('supertest');
    app = require('../../src/app');
    db = require('../../src/config/db');

    adminId = await newUser('integration-admin', 'Admin');
    supervisorId = await newUser('integration-supervisor', 'Supervisor');

    await db.query(
      `INSERT INTO wards (ward_number, ward_name, zone)
       VALUES ('TEST-1', 'Integration Ward', 'Test Zone')`
    );
  });

  afterAll(async () => {
    if (db) await db.end();
    await dropSchema();
  });

  describe('disposal sites', () => {
    it('supports the full CRUD life cycle', async () => {
      const id = await newSite('Lifecycle', 100);

      expect(id).toBeGreaterThan(0);

      let res = await request(app)
        .get(`/api/disposal/${id}`)
        .set(workerHdr(5));

      expect(res.body.data).toMatchObject({
        name: 'Lifecycle',
        max_capacity_tons: 100,
        current_load_tons: 0,
        utilization_pct: 0
      });

      res = await request(app)
        .put(`/api/disposal/${id}`)
        .set(admin())
        .send({
          name: 'Lifecycle2',
          location: 'Y',
          max_capacity_tons: 120.5
        });

      expect(res.status).toBe(200);

      // Saving identical values must still be a 200.
      res = await request(app)
        .put(`/api/disposal/${id}`)
        .set(admin())
        .send({
          name: 'Lifecycle2',
          location: 'Y',
          max_capacity_tons: 120.5
        });

      expect(res.status).toBe(200);

      res = await request(app)
        .delete(`/api/disposal/${id}`)
        .set(admin());

      expect(res.status).toBe(200);

      expect(
        (await request(app)
          .get(`/api/disposal/${id}`)
          .set(admin())).status
      ).toBe(404);

      expect(
        (await request(app)
          .delete(`/api/disposal/${id}`)
          .set(admin())).status
      ).toBe(404);
    });

    it('rejects duplicate names on create and update', async () => {
      await newSite('Dup-A', 10);
      const b = await newSite('Dup-B', 10);

      const res = await request(app)
        .post('/api/disposal')
        .set(admin())
        .send({
          name: 'dup-a',
          location: 'X',
          max_capacity_tons: 5
        });

      expect(res.status).toBe(409);

      const upd = await request(app)
        .put(`/api/disposal/${b}`)
        .set(admin())
        .send({
          name: 'Dup-A',
          location: 'X',
          max_capacity_tons: 10
        });

      expect(upd.status).toBe(409);
    });

    it('never exceeds capacity under concurrent additions', async () => {
      const id = await newSite('Concurrent-add', 10);

      const results = await Promise.all(
        Array.from({ length: 30 }, () =>
          request(app)
            .post(`/api/disposal/${id}/load`)
            .set(sup())
            .send({ tons: 1, action: 'add' })
        )
      );

      expect(results.filter((r) => r.status === 200)).toHaveLength(10);
      expect(results.filter((r) => r.status === 400)).toHaveLength(20);

      const site = (
        await request(app)
          .get(`/api/disposal/${id}`)
          .set(admin())
      ).body.data;

      expect(site.current_load_tons).toBe(10);
    });

    it('never goes negative under concurrent removals', async () => {
      const id = await newSite('Concurrent-remove', 100);

      await request(app)
        .post(`/api/disposal/${id}/load`)
        .set(sup())
        .send({ tons: 5, action: 'add' });

      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          request(app)
            .post(`/api/disposal/${id}/load`)
            .set(sup())
            .send({ tons: 1, action: 'remove' })
        )
      );

      expect(results.filter((r) => r.status === 200)).toHaveLength(5);

      const site = (
        await request(app)
          .get(`/api/disposal/${id}`)
          .set(admin())
      ).body.data;

      expect(site.current_load_tons).toBe(0);
    });

    it('keeps exact two-decimal arithmetic', async () => {
      const id = await newSite('Decimals', 1);

      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post(`/api/disposal/${id}/load`)
          .set(sup())
          .send({ tons: 0.1, action: 'add' });

        expect(res.status).toBe(200);
      }

      const overflow = await request(app)
        .post(`/api/disposal/${id}/load`)
        .set(sup())
        .send({ tons: 0.01, action: 'add' });

      expect(overflow.status).toBe(400);

      const site = (
        await request(app)
          .get(`/api/disposal/${id}`)
          .set(admin())
      ).body.data;

      expect(site.current_load_tons).toBe(1);
    });

    it('blocks shrinking capacity below load and deleting a loaded site', async () => {
      const id = await newSite('Loaded', 50);

      await request(app)
        .post(`/api/disposal/${id}/load`)
        .set(sup())
        .send({ tons: 20, action: 'add' });

      const shrink = await request(app)
        .put(`/api/disposal/${id}`)
        .set(admin())
        .send({
          name: 'Loaded',
          location: 'X',
          max_capacity_tons: 19.99
        });

      expect(shrink.status).toBe(400);

      const exact = await request(app)
        .put(`/api/disposal/${id}`)
        .set(admin())
        .send({
          name: 'Loaded',
          location: 'X',
          max_capacity_tons: 20
        });

      expect(exact.status).toBe(200);

      const deletion = await request(app)
        .delete(`/api/disposal/${id}`)
        .set(admin());

      expect(deletion.status).toBe(409);

      await request(app)
        .post(`/api/disposal/${id}/load`)
        .set(sup())
        .send({ tons: 20, action: 'remove' });

      expect(
        (await request(app)
          .delete(`/api/disposal/${id}`)
          .set(admin())).status
      ).toBe(200);
    });

    it('is protected by the real JWT middleware', async () => {
      expect(
        (await request(app).get('/api/disposal')).status
      ).toBe(401);

      expect(
        (await request(app)
          .post('/api/disposal')
          .set(workerHdr(5))
          .send({})).status
      ).toBe(403);
    });
  });

  describe('payments', () => {
    const period = {
      period_start: '2026-10-01',
      period_end: '2026-10-31'
    };

    let w1, w2, citizenId;
    let assignment1, assignment2;

    const simulate = (body, headers = admin()) =>
      request(app)
        .post('/api/payments/simulate')
        .set(headers)
        .send(body);

    beforeAll(async () => {
      w1 = await newUser('payment-worker-1', 'Worker');
      w2 = await newUser('payment-worker-2', 'Worker');
      citizenId = await newUser('payment-citizen', 'Citizen');

      assignment1 = await newAssignment(w1, 'W1');
      assignment2 = await newAssignment(w2, 'W2');

      // Worker 1: three approved logs within the period.
      await addLog({
        workerId: w1,
        assignmentId: assignment1,
        tons: 1.25,
        acceptedTons: 1.25,
        date: '2026-10-01'
      });

      await addLog({
        workerId: w1,
        assignmentId: assignment1,
        tons: 2.50,
        acceptedTons: 2.00,
        date: '2026-10-15'
      });

      await addLog({
        workerId: w1,
        assignmentId: assignment1,
        tons: 0.10,
        acceptedTons: 0.10,
        date: '2026-10-31'
      });

      // Outside the requested payment period.
      await addLog({
        workerId: w1,
        assignmentId: assignment1,
        tons: 9,
        acceptedTons: 9,
        date: '2026-09-30'
      });

      await addLog({
        workerId: w1,
        assignmentId: assignment1,
        tons: 9,
        acceptedTons: 9,
        date: '2026-11-01'
      });

      // These must not qualify for payment.
      await addLog({
        workerId: w1,
        assignmentId: assignment1,
        tons: 5,
        acceptedTons: null,
        date: '2026-10-18',
        status: 'Pending'
      });

      await addLog({
        workerId: w1,
        assignmentId: assignment1,
        tons: 4,
        acceptedTons: 0,
        date: '2026-10-19',
        status: 'Rejected'
      });

      // Worker 2 has one approved log for concurrency tests.
      await addLog({
        workerId: w2,
        assignmentId: assignment2,
        tons: 4,
        acceptedTons: 4,
        date: '2026-10-10'
      });
    });

    it('calculates only approved accepted quantities within inclusive dates', async () => {
      const res = await request(app)
        .post('/api/payments/calculate')
        .set(sup())
        .send({ worker_id: w1, ...period });

      expect(res.status).toBe(200);

      // 1.25 + 2.00 + 0.10 = 3.35 accepted tons.
      // Test-only rate is 100.
      expect(res.body.data).toMatchObject({
        log_count: 3,
        already_paid_log_count: 0,
        total_tons: 3.35,
        rate_per_ton: 100,
        amount: 335
      });
    });

    it('excludes Pending and Rejected collection records', async () => {
      const res = await request(app)
        .post('/api/payments/calculate')
        .set(admin())
        .send({ worker_id: w1, ...period });

      expect(res.status).toBe(200);
      expect(res.body.data.log_count).toBe(3);
      expect(res.body.data.total_tons).toBe(3.35);
    });

    it('rejects calculating for a non-Worker or missing user', async () => {
      const citizen = await request(app)
        .post('/api/payments/calculate')
        .set(sup())
        .send({ worker_id: citizenId, ...period });

      expect(citizen.status).toBe(400);

      const missing = await request(app)
        .post('/api/payments/calculate')
        .set(sup())
        .send({ worker_id: 99999, ...period });

      expect(missing.status).toBe(404);
    });

    it('rejects request-supplied payment rates', async () => {
      const res = await request(app)
        .post('/api/payments/calculate')
        .set(sup())
        .send({
          worker_id: w1,
          ...period,
          rate_per_ton: 999
        });

      expect(res.status).toBe(400);
    });

    it('rejects impossible dates and over-long periods', async () => {
      const impossible = await simulate({
        worker_id: w1,
        period_start: '2026-02-31',
        period_end: '2026-03-05'
      });

      expect(impossible.status).toBe(400);

      const long = await simulate({
        worker_id: w1,
        period_start: '2026-01-01',
        period_end: '2027-01-02'
      });

      expect(long.status).toBe(400);
    });

    it('returns 400 when the period has no eligible logs', async () => {
      const res = await simulate({
        worker_id: w2,
        period_start: '2025-01-01',
        period_end: '2025-01-31'
      });

      expect(res.status).toBe(400);
    });

    it('simulates payment and links only eligible collection logs', async () => {
      const res = await simulate({
        worker_id: w1,
        ...period
      });

      expect(res.status).toBe(201);

      expect(res.body.data).toMatchObject({
        status: 'Simulated',
        total_tons: 3.35,
        rate_per_ton: 100,
        amount: 335,
        log_count: 3
      });

      expect(res.body.data.reference_no).toMatch(
        /^SIM-[0-9A-F]{16}$/
      );

      const [items] = await db.query(
        `SELECT COUNT(*) AS n
         FROM payment_items
         WHERE payment_id = ?`,
        [res.body.data.payment_id]
      );

      expect(items[0].n).toBe(3);

      const [linked] = await db.query(
        `SELECT c.verification_status, c.accepted_tons
         FROM payment_items pi
         JOIN collection_logs c ON c.log_id = pi.log_id
         WHERE pi.payment_id = ?`,
        [res.body.data.payment_id]
      );

      expect(linked).toHaveLength(3);
      expect(linked.every(
        (row) => row.verification_status === 'Approved'
      )).toBe(true);
    });

    it('refuses a second payment for the same collection logs', async () => {
      const res = await simulate({
        worker_id: w1,
        ...period
      });

      expect(res.status).toBe(409);
    });

    it('pays only newly approved logs when late logs arrive', async () => {
      const lateLog = await addLog({
        workerId: w1,
        assignmentId: assignment1,
        tons: 2,
        acceptedTons: 1.50,
        date: '2026-10-20'
      });

      const calc = await request(app)
        .post('/api/payments/calculate')
        .set(admin())
        .send({ worker_id: w1, ...period });

      expect(calc.status).toBe(200);

      expect(calc.body.data).toMatchObject({
        log_count: 1,
        already_paid_log_count: 3,
        total_tons: 1.5,
        amount: 150
      });

      const res = await simulate({
        worker_id: w1,
        ...period
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        total_tons: 1.5,
        log_count: 1
      });

      const [items] = await db.query(
        `SELECT log_id
         FROM payment_items
         WHERE log_id = ?`,
        [lateLog]
      );

      expect(items).toHaveLength(1);
    });

    it('allows exactly one concurrent payment for the same logs', async () => {
      const results = await Promise.all(
        Array.from({ length: 15 }, () =>
          simulate({
            worker_id: w2,
            ...period
          })
        )
      );

      expect(
        results.filter((r) => r.status === 201)
      ).toHaveLength(1);

      expect(
        results.filter((r) => r.status === 409)
      ).toHaveLength(14);

      const [rows] = await db.query(
        `SELECT COUNT(*) AS n, SUM(total_tons) AS t
         FROM payments
         WHERE worker_id = ?`,
        [w2]
      );

      expect(rows[0].n).toBe(1);
      expect(Number(rows[0].t)).toBe(4);
    });

    it('enforces duplicate payment protection in the database', async () => {
      const [payments] = await db.query(
        'SELECT payment_id FROM payments WHERE worker_id = ? LIMIT 1',
        [w2]
      );

      const [[item]] = await db.query(
        'SELECT log_id FROM payment_items WHERE payment_id = ?',
        [payments[0].payment_id]
      );

      const [inserted] = await db.query(
        `INSERT INTO payments (
           worker_id,
           period_start,
           period_end,
           total_tons,
           rate_per_ton,
           amount,
           reference_no
         )
         VALUES (?, '2026-10-01', '2026-10-31', 1, 1, 1, 'SIM-RAW-1')`,
        [w2]
      );

      await expect(
        db.query(
          'INSERT INTO payment_items (payment_id, log_id) VALUES (?, ?)',
          [inserted.insertId, item.log_id]
        )
      ).rejects.toMatchObject({
        code: 'ER_DUP_ENTRY'
      });

      await db.query(
        'DELETE FROM payments WHERE payment_id = ?',
        [inserted.insertId]
      );
    });

    it('rejects invalid payment periods through database constraints', async () => {
      await expect(
        db.query(
          `INSERT INTO payments (
             worker_id,
             period_start,
             period_end,
             total_tons,
             rate_per_ton,
             amount,
             reference_no
           )
           VALUES (?, '2026-10-31', '2026-10-01', 1, 1, 1, 'SIM-RAW-2')`,
          [w2]
        )
      ).rejects.toBeDefined();
    });

    describe('visibility and settlement', () => {
      let pay1, pay2;

      beforeAll(async () => {
        const [p1] = await db.query(
          'SELECT payment_id FROM payments WHERE worker_id = ? ORDER BY payment_id LIMIT 1',
          [w1]
        );

        const [p2] = await db.query(
          'SELECT payment_id FROM payments WHERE worker_id = ? ORDER BY payment_id LIMIT 1',
          [w2]
        );

        pay1 = p1[0].payment_id;
        pay2 = p2[0].payment_id;
      });

      it('workers see only their own payments', async () => {
        const res = await request(app)
          .get(`/api/payments?worker_id=${w2}`)
          .set(workerHdr(w1));

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThan(0);

        expect(
          res.body.data.every((p) => p.worker_id === w1)
        ).toBe(true);
      });

      it('a worker cannot read another worker payment', async () => {
        expect(
          (await request(app)
            .get(`/api/payments/${pay2}`)
            .set(workerHdr(w1))).status
        ).toBe(403);

        expect(
          (await request(app)
            .get(`/api/payments/${pay1}`)
            .set(workerHdr(w1))).status
        ).toBe(200);
      });

      it('staff can list, filter and read payments', async () => {
        const all = await request(app)
          .get('/api/payments')
          .set(sup());

        expect(all.status).toBe(200);

        expect(
          new Set(all.body.data.map((p) => p.worker_id))
        ).toEqual(new Set([w1, w2]));

        const one = await request(app)
          .get(`/api/payments?worker_id=${w2}&limit=1`)
          .set(admin());

        expect(one.body.data).toHaveLength(1);

        const detail = await request(app)
          .get(`/api/payments/${pay2}`)
          .set(sup());

        expect(detail.body.data).toMatchObject({
          worker_id: w2,
          total_tons: 4
        });

        expect(
          (await request(app)
            .get('/api/payments/999999')
            .set(admin())).status
        ).toBe(404);
      });

      it('citizens are forbidden from payment records', async () => {
        const res = await request(app)
          .get('/api/payments')
          .set({
            Authorization: token('Citizen', citizenId)
          });

        expect(res.status).toBe(403);
      });

      it('only Admin can mark a payment Paid, and only once', async () => {
        const forbiddenRes = await request(app)
          .patch(`/api/payments/${pay1}/status`)
          .set(sup())
          .send({ status: 'Paid' });

        expect(forbiddenRes.status).toBe(403);

        const invalid = await request(app)
          .patch(`/api/payments/${pay1}/status`)
          .set(admin())
          .send({ status: 'Bogus' });

        expect(invalid.status).toBe(400);

        const ok = await request(app)
          .patch(`/api/payments/${pay1}/status`)
          .set(admin())
          .send({ status: 'Paid' });

        expect(ok.status).toBe(200);
        expect(ok.body.data.status).toBe('Paid');
        expect(ok.body.data.paid_at).toBeTruthy();

        const [audit] = await db.query(
          `SELECT *
           FROM audit_logs
           WHERE action = 'PAYMENT_MARKED_PAID'
             AND entity_type = 'Payment'
             AND entity_id = ?
           ORDER BY audit_id DESC`,
          [String(pay1)]
        );

        expect(audit).toHaveLength(1);
        expect(audit[0].actor_role).toBe('Admin');

        const repeated = await request(app)
          .patch(`/api/payments/${pay1}/status`)
          .set(admin())
          .send({ status: 'Paid' });

        expect(repeated.status).toBe(409);

        const missing = await request(app)
          .patch('/api/payments/999999/status')
          .set(admin())
          .send({ status: 'Paid' });

        expect(missing.status).toBe(404);

        const paid = await request(app)
          .get('/api/payments?status=Paid')
          .set(admin());

        expect(
          paid.body.data.map((p) => p.payment_id)
        ).toContain(pay1);
      });
    });
  });
});
