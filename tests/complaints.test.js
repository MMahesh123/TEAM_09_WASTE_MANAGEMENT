jest.mock('../src/config/db', () => ({ query: jest.fn() }));
jest.mock('../src/middleware/authMiddleware', () => require('./helpers/mockAuth'));
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

const citizen = { 'x-role': 'Citizen', 'x-user-id': '3' };
const other = { 'x-role': 'Citizen', 'x-user-id': '4' };
const admin = { 'x-role': 'Admin', 'x-user-id': '1' };
const valid = { type: 'Overflow', description: 'Bin overflowing for 3 days', location: 'Indiranagar 12th Main' };
const row = (over = {}) => ({ complaint_id: 1, user_id: 3, status: 'Open', ...over });
beforeEach(() => db.query.mockReset());

describe('POST /api/complaints', () => {
  it('requires login', async () => {
    expect((await request(app).post('/api/complaints').send(valid)).status).toBe(401);
  });
  it.each([
    [{ ...valid, type: 'Noise' }],
    [{ ...valid, description: '   ' }],
    [{ ...valid, location: undefined }],
    [{ ...valid, description: 'x'.repeat(1001) }],
  ])('returns 400 for invalid body %#', async (bad) => {
    expect((await request(app).post('/api/complaints').set(citizen).send(bad)).status).toBe(400);
  });
  it('creates an Open complaint owned by the caller', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 42 }]);
    const res = await request(app).post('/api/complaints').set(citizen).send(valid);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ complaint_id: 42, status: 'Open' });
    expect(db.query.mock.calls[0][1][0]).toBe(3);
  });
  it('ignores a user_id supplied in the body', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 1 }]);
    await request(app).post('/api/complaints').set(citizen).send({ ...valid, user_id: 999 });
    expect(db.query.mock.calls[0][1][0]).toBe(3);
  });
});

describe('GET /api/complaints', () => {
  it('citizens are scoped to their own', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await request(app).get('/api/complaints').set(citizen);
    expect(db.query.mock.calls[0][0]).toMatch(/user_id = \?/);
    expect(db.query.mock.calls[0][1]).toEqual([3]);
  });
  it('admins see all and can filter by status', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await request(app).get('/api/complaints?status=Resolved').set(admin);
    expect(db.query.mock.calls[0][1]).toEqual(['Resolved']);
  });
  it('rejects an invalid status filter', async () => {
    expect((await request(app).get('/api/complaints?status=Nope').set(admin)).status).toBe(400);
  });
});

describe('GET /api/complaints/:id', () => {
  it('owner can read', async () => {
    db.query.mockResolvedValueOnce([[row()]]);
    expect((await request(app).get('/api/complaints/1').set(citizen)).status).toBe(200);
  });
  it('another citizen is forbidden', async () => {
    db.query.mockResolvedValueOnce([[row()]]);
    expect((await request(app).get('/api/complaints/1').set(other)).status).toBe(403);
  });
  it('admin can read any', async () => {
    db.query.mockResolvedValueOnce([[row()]]);
    expect((await request(app).get('/api/complaints/1').set(admin)).status).toBe(200);
  });
  it('404 when missing, 400 on bad id', async () => {
    db.query.mockResolvedValueOnce([[]]);
    expect((await request(app).get('/api/complaints/1').set(citizen)).status).toBe(404);
    expect((await request(app).get('/api/complaints/abc').set(citizen)).status).toBe(400);
  });
});

describe('PUT /api/complaints/:id', () => {
  it('owner can edit an Open complaint', async () => {
    db.query.mockResolvedValueOnce([[row()]]).mockResolvedValueOnce([{}]);
    expect((await request(app).put('/api/complaints/1').set(citizen).send(valid)).status).toBe(200);
  });
  it('cannot edit once In-Progress', async () => {
    db.query.mockResolvedValueOnce([[row({ status: 'In-Progress' })]]);
    expect((await request(app).put('/api/complaints/1').set(citizen).send(valid)).status).toBe(400);
  });
  it('cannot edit someone else’s', async () => {
    db.query.mockResolvedValueOnce([[row()]]);
    expect((await request(app).put('/api/complaints/1').set(other).send(valid)).status).toBe(403);
  });
  it('validates the body', async () => {
    db.query.mockResolvedValueOnce([[row()]]);
    expect((await request(app).put('/api/complaints/1').set(citizen).send({ ...valid, type: 'x' })).status).toBe(400);
  });
});

describe('PATCH /api/complaints/:id/status', () => {
  it('citizens cannot change status', async () => {
    expect((await request(app).patch('/api/complaints/1/status').set(citizen).send({ status: 'Resolved' })).status).toBe(403);
  });
  it('Open -> In-Progress', async () => {
    db.query.mockResolvedValueOnce([[row()]]).mockResolvedValueOnce([{}]);
    const res = await request(app).patch('/api/complaints/1/status').set(admin).send({ status: 'In-Progress' });
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[1][1][1]).toBeNull();
  });
  it('In-Progress -> Resolved sets resolved_at', async () => {
    db.query.mockResolvedValueOnce([[row({ status: 'In-Progress' })]]).mockResolvedValueOnce([{}]);
    await request(app).patch('/api/complaints/1/status').set(admin).send({ status: 'Resolved' });
    expect(db.query.mock.calls[1][1][1]).toBeInstanceOf(Date);
  });
  it('rejects moving backwards', async () => {
    db.query.mockResolvedValueOnce([[row({ status: 'Resolved' })]]);
    expect((await request(app).patch('/api/complaints/1/status').set(admin).send({ status: 'Open' })).status).toBe(400);
  });
  it('rejects an unknown status', async () => {
    db.query.mockResolvedValueOnce([[row()]]);
    expect((await request(app).patch('/api/complaints/1/status').set(admin).send({ status: 'Closed' })).status).toBe(400);
  });
});

describe('DELETE /api/complaints/:id', () => {
  it('owner can delete an Open complaint', async () => {
    db.query.mockResolvedValueOnce([[row()]]).mockResolvedValueOnce([{}]);
    expect((await request(app).delete('/api/complaints/1').set(citizen)).status).toBe(200);
  });
  it('owner cannot delete once In-Progress', async () => {
    db.query.mockResolvedValueOnce([[row({ status: 'In-Progress' })]]);
    expect((await request(app).delete('/api/complaints/1').set(citizen)).status).toBe(400);
  });
  it('admin can delete any', async () => {
    db.query.mockResolvedValueOnce([[row({ status: 'Resolved' })]]).mockResolvedValueOnce([{}]);
    expect((await request(app).delete('/api/complaints/1').set(admin)).status).toBe(200);
  });
  it('non-owner is forbidden', async () => {
    db.query.mockResolvedValueOnce([[row()]]);
    expect((await request(app).delete('/api/complaints/1').set(other)).status).toBe(403);
  });
});
