jest.mock('../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../src/middleware/authMiddleware', () => require('./helpers/mockAuth'));
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

const admin = { 'x-role': 'Admin' };
const citizen = { 'x-role': 'Citizen' };
beforeEach(() => db.query.mockReset());

describe('POST /api/disposal', () => {
  const body = { name: 'Mavallipura', location: 'North Bangalore', max_capacity_tons: 5000 };

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).post('/api/disposal').send(body)).status).toBe(401);
  });
  it('rejects non-admins', async () => {
    expect((await request(app).post('/api/disposal').set(citizen).send(body)).status).toBe(403);
  });
  it.each([
    [{ ...body, name: '' }],
    [{ ...body, location: undefined }],
    [{ ...body, max_capacity_tons: -5 }],
    [{ ...body, max_capacity_tons: '100' }],
  ])('returns 400 for invalid body %#', async (bad) => {
    const res = await request(app).post('/api/disposal').set(admin).send(bad);
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('returns 409 for a duplicate name', async () => {
    db.query.mockResolvedValueOnce([[{ site_id: 1 }]]);
    expect((await request(app).post('/api/disposal').set(admin).send(body)).status).toBe(409);
  });
  it('creates a site', async () => {
    db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 7 }]);
    const res = await request(app).post('/api/disposal').set(admin).send(body);
    expect(res.status).toBe(201);
    expect(res.body.site_id).toBe(7);
  });
});

describe('GET /api/disposal', () => {
  it('lists sites for any logged-in user', async () => {
    db.query.mockResolvedValueOnce([[{ site_id: 1, name: 'A' }]]);
    const res = await request(app).get('/api/disposal').set(citizen);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
  it('returns 400 for a non-numeric id', async () => {
    expect((await request(app).get('/api/disposal/abc').set(citizen)).status).toBe(400);
  });
  it('returns 404 when the site is missing', async () => {
    db.query.mockResolvedValueOnce([[]]);
    expect((await request(app).get('/api/disposal/99').set(citizen)).status).toBe(404);
  });
});

describe('PUT /api/disposal/:id', () => {
  const body = { name: 'X', location: 'Y', max_capacity_tons: 100 };
  it('blocks lowering capacity below current load', async () => {
    db.query.mockResolvedValueOnce([[{ current_load_tons: '150.00' }]]);
    const res = await request(app).put('/api/disposal/1').set(admin).send(body);
    expect(res.status).toBe(400);
  });
  it('updates a site', async () => {
    db.query.mockResolvedValueOnce([[{ current_load_tons: '10.00' }]]).mockResolvedValueOnce([{}]);
    expect((await request(app).put('/api/disposal/1').set(admin).send(body)).status).toBe(200);
  });
  it('returns 404 when missing', async () => {
    db.query.mockResolvedValueOnce([[]]);
    expect((await request(app).put('/api/disposal/1').set(admin).send(body)).status).toBe(404);
  });
});

describe('DELETE /api/disposal/:id', () => {
  it('deletes', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    expect((await request(app).delete('/api/disposal/1').set(admin)).status).toBe(200);
  });
  it('404 when nothing deleted', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    expect((await request(app).delete('/api/disposal/1').set(admin)).status).toBe(404);
  });
});

describe('POST /api/disposal/:id/load', () => {
  const sup = { 'x-role': 'Supervisor' };
  it('rejects citizens', async () => {
    expect((await request(app).post('/api/disposal/1/load').set(citizen).send({ tons: 5, action: 'add' })).status).toBe(403);
  });
  it('validates tons and action', async () => {
    expect((await request(app).post('/api/disposal/1/load').set(sup).send({ tons: 0, action: 'add' })).status).toBe(400);
    expect((await request(app).post('/api/disposal/1/load').set(sup).send({ tons: 5, action: 'dump' })).status).toBe(400);
  });
  it('adds load', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ current_load_tons: '15.00', max_capacity_tons: '100.00' }]]);
    const res = await request(app).post('/api/disposal/1/load').set(sup).send({ tons: 5, action: 'add' });
    expect(res.status).toBe(200);
    expect(res.body.data.current_load_tons).toBe('15.00');
  });
  it('rejects load that exceeds capacity', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[{ site_id: 1 }]]);
    const res = await request(app).post('/api/disposal/1/load').set(sup).send({ tons: 500, action: 'add' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/capacity/);
  });
  it('rejects removing more than present', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[{ site_id: 1 }]]);
    expect((await request(app).post('/api/disposal/1/load').set(sup).send({ tons: 500, action: 'remove' })).status).toBe(400);
  });
  it('404 for unknown site', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
    expect((await request(app).post('/api/disposal/9/load').set(sup).send({ tons: 5, action: 'add' })).status).toBe(404);
  });
  it('does not leak DB errors', async () => {
    db.query.mockRejectedValueOnce(new Error('secret sql detail'));
    const res = await request(app).post('/api/disposal/1/load').set(sup).send({ tons: 5, action: 'add' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
});
