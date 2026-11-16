jest.mock('../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../src/middleware/authMiddleware', () => require('./helpers/mockAuth'));
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

const admin = { 'x-role': 'Admin' };
const sup = { 'x-role': 'Supervisor' };
const worker = { 'x-role': 'Worker', 'x-user-id': '5' };
const citizen = { 'x-role': 'Citizen' };
beforeEach(() => db.query.mockReset());

const dbError = () => Object.assign(new Error('secret sql detail'), { code: 'ER_LOCK_DEADLOCK' });
const dupError = () => Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });

describe('POST /api/disposal', () => {
  const body = { name: 'Mavallipura', location: 'North Bangalore', max_capacity_tons: 5000 };

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).post('/api/disposal').send(body)).status).toBe(401);
  });
  it.each([[sup], [worker], [citizen]])('rejects non-admin role %#', async (headers) => {
    expect((await request(app).post('/api/disposal').set(headers).send(body)).status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
  it.each([
    [{ ...body, name: '' }],
    [{ ...body, name: '   ' }],
    [{ ...body, name: 'x'.repeat(101) }],
    [{ ...body, location: undefined }],
    [{ ...body, location: 'x'.repeat(256) }],
    [{ ...body, max_capacity_tons: -5 }],
    [{ ...body, max_capacity_tons: 0 }],
    [{ ...body, max_capacity_tons: '100' }],
    [{ ...body, max_capacity_tons: 10.005 }],
    [{ ...body, max_capacity_tons: 1e9 }],
    [{ ...body, max_capacity_tons: null }],
  ])('returns 400 for invalid body %#', async (bad) => {
    const res = await request(app).post('/api/disposal').set(admin).send(bad);
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('returns 400 for an empty body', async () => {
    expect((await request(app).post('/api/disposal').set(admin)).status).toBe(400);
  });
  it('accepts the capacity boundaries 0.01 and 99999999.99', async () => {
    for (const cap of [0.01, 99999999.99]) {
      db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 1 }]);
      expect((await request(app).post('/api/disposal').set(admin).send({ ...body, max_capacity_tons: cap })).status).toBe(201);
    }
  });
  it('returns 409 for a duplicate name', async () => {
    db.query.mockResolvedValueOnce([[{ site_id: 1 }]]);
    expect((await request(app).post('/api/disposal').set(admin).send(body)).status).toBe(409);
  });
  it('returns 409 when a concurrent create wins the UNIQUE index', async () => {
    db.query.mockResolvedValueOnce([[]]).mockRejectedValueOnce(dupError());
    expect((await request(app).post('/api/disposal').set(admin).send(body)).status).toBe(409);
  });
  it('trims the stored name and location', async () => {
    db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 7 }]);
    await request(app).post('/api/disposal').set(admin).send({ ...body, name: '  Mavallipura ', location: ' North ' });
    expect(db.query.mock.calls[1][1]).toEqual(['Mavallipura', 'North', 5000]);
  });
  it('creates a site', async () => {
    db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 7 }]);
    const res = await request(app).post('/api/disposal').set(admin).send(body);
    expect(res.status).toBe(201);
    expect(res.body.site_id).toBe(7);
  });
  it('does not leak database errors', async () => {
    db.query.mockRejectedValueOnce(dbError());
    const res = await request(app).post('/api/disposal').set(admin).send(body);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
});

describe('GET /api/disposal', () => {
  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/api/disposal')).status).toBe(401);
  });
  it.each([[admin], [sup], [worker], [citizen]])('lists sites for role %#', async (headers) => {
    db.query.mockResolvedValueOnce([[{ site_id: 1, name: 'A', max_capacity_tons: '100.00', current_load_tons: '25.00', utilization_pct: '25.00' }]]);
    const res = await request(app).get('/api/disposal').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0]).toMatchObject({ max_capacity_tons: 100, current_load_tons: 25, utilization_pct: 25 });
  });
  it('returns an empty list', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = await request(app).get('/api/disposal').set(citizen);
    expect(res.body).toMatchObject({ count: 0, data: [] });
  });
});

describe('GET /api/disposal/:id', () => {
  it.each(['abc', '0', '-1', '1.5', '1e3'])('returns 400 for id "%s"', async (id) => {
    expect((await request(app).get(`/api/disposal/${id}`).set(citizen)).status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('returns 404 when the site is missing', async () => {
    db.query.mockResolvedValueOnce([[]]);
    expect((await request(app).get('/api/disposal/99').set(citizen)).status).toBe(404);
  });
  it('returns the site with numeric values', async () => {
    db.query.mockResolvedValueOnce([[{ site_id: 1, max_capacity_tons: '10.00', current_load_tons: '2.50', utilization_pct: '25.00' }]]);
    const res = await request(app).get('/api/disposal/1').set(worker);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ current_load_tons: 2.5, utilization_pct: 25 });
  });
});

describe('PUT /api/disposal/:id', () => {
  const body = { name: 'X', location: 'Y', max_capacity_tons: 100 };
  it.each([[sup], [worker], [citizen]])('rejects non-admin role %#', async (headers) => {
    expect((await request(app).put('/api/disposal/1').set(headers).send(body)).status).toBe(403);
  });
  it('returns 400 for an invalid id or body', async () => {
    expect((await request(app).put('/api/disposal/abc').set(admin).send(body)).status).toBe(400);
    expect((await request(app).put('/api/disposal/1').set(admin).send({ ...body, max_capacity_tons: -1 })).status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('applies the capacity-vs-load rule inside the UPDATE itself', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = await request(app).put('/api/disposal/1').set(admin).send(body);
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][0]).toMatch(/current_load_tons <= \?/);
    expect(db.query.mock.calls[0][1]).toEqual(['X', 'Y', 100, 1, 100]);
  });
  it('blocks lowering capacity below current load', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[{ site_id: 1 }]]);
    const res = await request(app).put('/api/disposal/1').set(admin).send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/current load/);
  });
  it('returns 404 when missing', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
    expect((await request(app).put('/api/disposal/1').set(admin).send(body)).status).toBe(404);
  });
  it('returns 409 when the new name belongs to another site', async () => {
    db.query.mockRejectedValueOnce(dupError());
    expect((await request(app).put('/api/disposal/1').set(admin).send(body)).status).toBe(409);
  });
});

describe('DELETE /api/disposal/:id', () => {
  it.each([[sup], [worker], [citizen]])('rejects non-admin role %#', async (headers) => {
    expect((await request(app).delete('/api/disposal/1').set(headers)).status).toBe(403);
  });
  it('returns 400 for an invalid id', async () => {
    expect((await request(app).delete('/api/disposal/abc').set(admin)).status).toBe(400);
  });
  it('deletes an empty site', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = await request(app).delete('/api/disposal/1').set(admin);
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][0]).toMatch(/current_load_tons = 0/);
  });
  it('refuses to delete a site that still holds waste', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[{ site_id: 1 }]]);
    expect((await request(app).delete('/api/disposal/1').set(admin)).status).toBe(409);
  });
  it('404 when the site does not exist', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
    expect((await request(app).delete('/api/disposal/1').set(admin)).status).toBe(404);
  });
  it('a repeated delete returns 404', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
    expect((await request(app).delete('/api/disposal/1').set(admin)).status).toBe(200);
    expect((await request(app).delete('/api/disposal/1').set(admin)).status).toBe(404);
  });
});

describe('POST /api/disposal/:id/load', () => {
  const url = '/api/disposal/1/load';
  it('rejects unauthenticated requests', async () => {
    expect((await request(app).post(url).send({ tons: 5, action: 'add' })).status).toBe(401);
  });
  it.each([[worker], [citizen]])('rejects role %#', async (headers) => {
    expect((await request(app).post(url).set(headers).send({ tons: 5, action: 'add' })).status).toBe(403);
  });
  it.each([
    [{ tons: 0, action: 'add' }],
    [{ tons: -5, action: 'add' }],
    [{ tons: '5', action: 'add' }],
    [{ tons: 1.005, action: 'add' }],
    [{ tons: 1e12, action: 'add' }],
    [{ action: 'add' }],
    [{ tons: 5, action: 'dump' }],
    [{ tons: 5 }],
    [{}],
  ])('validates tons and action %#', async (bad) => {
    expect((await request(app).post(url).set(sup).send(bad)).status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('returns 400 for an invalid site id', async () => {
    expect((await request(app).post('/api/disposal/abc/load').set(sup).send({ tons: 5, action: 'add' })).status).toBe(400);
  });
  it.each([[sup], [admin]])('adds load as role %#', async (headers) => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ site_id: 1, current_load_tons: '15.00', max_capacity_tons: '100.00', utilization_pct: '15.00' }]]);
    const res = await request(app).post(url).set(headers).send({ tons: 5, action: 'add' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ current_load_tons: 15, max_capacity_tons: 100, utilization_pct: 15 });
  });
  it('checks capacity inside the UPDATE (add)', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ current_load_tons: '1', max_capacity_tons: '9' }]]);
    await request(app).post(url).set(sup).send({ tons: 5, action: 'add' });
    expect(db.query.mock.calls[0][0]).toMatch(/current_load_tons \+ \? <= max_capacity_tons/);
  });
  it('checks the floor inside the UPDATE (remove)', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ current_load_tons: '1', max_capacity_tons: '9' }]]);
    await request(app).post(url).set(sup).send({ tons: 5, action: 'remove' });
    expect(db.query.mock.calls[0][0]).toMatch(/current_load_tons - \? >= 0/);
  });
  it('rejects load that exceeds capacity', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[{ site_id: 1 }]]);
    const res = await request(app).post(url).set(sup).send({ tons: 500, action: 'add' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/capacity/);
  });
  it('rejects removing more than present', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[{ site_id: 1 }]]);
    const res = await request(app).post(url).set(sup).send({ tons: 500, action: 'remove' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/current load/);
  });
  it('404 for unknown site', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
    expect((await request(app).post('/api/disposal/9/load').set(sup).send({ tons: 5, action: 'add' })).status).toBe(404);
  });
  it('does not leak DB errors', async () => {
    db.query.mockRejectedValueOnce(dbError());
    const res = await request(app).post(url).set(sup).send({ tons: 5, action: 'add' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
});
