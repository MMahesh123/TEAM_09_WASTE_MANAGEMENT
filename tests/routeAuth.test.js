// Uses the REAL authMiddleware (only the database is mocked) to prove the routes are protected.
process.env.JWT_SECRET = 'test-secret';
jest.mock('../src/config/db', () => ({ query: jest.fn() }));
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

const token = (role, userId = 1) => 'Bearer ' + jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
const protectedRoutes = [
  ['post', '/api/disposal', { name: 'A', location: 'B', max_capacity_tons: 10 }],
  ['put', '/api/disposal/1', { name: 'A', location: 'B', max_capacity_tons: 10 }],
  ['delete', '/api/disposal/1'],
  ['post', '/api/disposal/1/load', { tons: 1, action: 'add' }],
  ['post', '/api/payments/calculate', {}],
  ['post', '/api/payments/simulate', {}],
  ['get', '/api/payments'],
  ['get', '/api/payments/1'],
  ['get', '/api/disposal'],
];
beforeEach(() => db.query.mockReset());

describe.each(protectedRoutes)('%s %s', (method, url, body) => {
  const send = (auth) => {
    let r = request(app)[method](url);
    if (auth) r = r.set('Authorization', auth);
    return body ? r.send(body) : r;
  };
  it('returns 401 without a token', async () => {
    expect((await send()).status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('returns 403 for a forged or expired token', async () => {
    const forged = 'Bearer ' + jwt.sign({ userId: 1, role: 'Admin' }, 'wrong-secret');
    expect((await send(forged)).status).toBe(403);
    const expired = 'Bearer ' + jwt.sign({ userId: 1, role: 'Admin' }, process.env.JWT_SECRET, { expiresIn: -10 });
    expect((await send(expired)).status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('role enforcement with real tokens', () => {
  it('Citizen cannot create, update, delete or load a disposal site', async () => {
    const t = token('Citizen');
    expect((await request(app).post('/api/disposal').set('Authorization', t).send({})).status).toBe(403);
    expect((await request(app).put('/api/disposal/1').set('Authorization', t).send({})).status).toBe(403);
    expect((await request(app).delete('/api/disposal/1').set('Authorization', t)).status).toBe(403);
    expect((await request(app).post('/api/disposal/1/load').set('Authorization', t).send({})).status).toBe(403);
  });
  it('Worker cannot create a site or run payments', async () => {
    const t = token('Worker', 5);
    expect((await request(app).post('/api/disposal').set('Authorization', t).send({})).status).toBe(403);
    expect((await request(app).post('/api/payments/calculate').set('Authorization', t).send({})).status).toBe(403);
    expect((await request(app).post('/api/payments/simulate').set('Authorization', t).send({})).status).toBe(403);
  });
  it('Supervisor can load a site but cannot delete one', async () => {
    const t = token('Supervisor');
    expect((await request(app).delete('/api/disposal/1').set('Authorization', t)).status).toBe(403);
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ current_load_tons: '1', max_capacity_tons: '9' }]]);
    expect((await request(app).post('/api/disposal/1/load').set('Authorization', t).send({ tons: 1, action: 'add' })).status).toBe(200);
  });
  it('Admin can create a site', async () => {
    db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 3 }]);
    const res = await request(app).post('/api/disposal').set('Authorization', token('Admin'))
      .send({ name: 'Site', location: 'North', max_capacity_tons: 100 });
    expect(res.status).toBe(201);
  });
  it('any logged-in role can list disposal sites', async () => {
    db.query.mockResolvedValueOnce([[]]);
    expect((await request(app).get('/api/disposal').set('Authorization', token('Citizen'))).status).toBe(200);
  });
});

describe('payment viewing roles with real tokens', () => {
  it('Citizen is forbidden from listing or reading payments', async () => {
    const t = token('Citizen', 9);
    expect((await request(app).get('/api/payments').set('Authorization', t)).status).toBe(403);
    expect((await request(app).get('/api/payments/1').set('Authorization', t)).status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('an unknown role is forbidden', async () => {
    expect((await request(app).get('/api/payments').set('Authorization', token('Guest'))).status).toBe(403);
  });
  it('Worker only sees their own payments', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await request(app).get('/api/payments?worker_id=99').set('Authorization', token('Worker', 5));
    expect(db.query.mock.calls[0][1]).toEqual([5]);
  });
  it('Worker cannot read another worker’s payment', async () => {
    db.query.mockResolvedValueOnce([[{ payment_id: 1, worker_id: 9 }]]);
    expect((await request(app).get('/api/payments/1').set('Authorization', token('Worker', 5))).status).toBe(403);
  });
  it('Admin can filter by worker', async () => {
    db.query.mockResolvedValueOnce([[]]);
    expect((await request(app).get('/api/payments?worker_id=8').set('Authorization', token('Admin'))).status).toBe(200);
    expect(db.query.mock.calls[0][1]).toEqual([8]);
  });
});
