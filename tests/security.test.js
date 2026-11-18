process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => require('./helpers/mockDb').makeDb());

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { resetDb } = require('./helpers/mockDb');

beforeEach(() => resetDb(db));

const sign = (payload, secret = process.env.JWT_SECRET, options = { expiresIn: '1h' }) =>
  'Bearer ' + jwt.sign(payload, secret, options);
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

// Every endpoint added for disposal sites and payments, with a body where one is needed.
const rawEndpoints = [
  ['get', '/api/disposal'],
  ['get', '/api/disposal/summary'],
  ['get', '/api/disposal/1'],
  ['get', '/api/disposal/1/history'],
  ['post', '/api/disposal', { name: 'A', location: 'B', max_capacity_tons: 10 }],
  ['put', '/api/disposal/1', { name: 'A', location: 'B', max_capacity_tons: 10 }],
  ['delete', '/api/disposal/1'],
  ['post', '/api/disposal/1/load', { tons: 1, action: 'add' }],
  ['get', '/api/payments'],
  ['get', '/api/payments/summary'],
  ['get', '/api/payments/1'],
  ['post', '/api/payments/simulate', { worker_id: 1, period_start: '2026-10-01', period_end: '2026-10-31' }],
  ['patch', '/api/payments/1/status', { status: 'Paid' }],
  ['post', '/api/payments/1/cancel'],
];

// jest-each passes its `done` callback in place of a missing argument, so every row gets an explicit body.
const endpoints = rawEndpoints.map(([method, url, body = null]) => [method, url, body]);

const call = (method, url, body, auth) => {
  let r = request(app)[method](url);
  if (auth) r = r.set('Authorization', auth);
  return body ? r.send(body) : r;
};

describe('token tampering is rejected on every disposal and payment endpoint', () => {
  const adminPayload = { userId: 1, role: 'Admin' };
  const forgeries = {
    'no header': () => undefined,
    'wrong scheme': () => 'Basic ' + Buffer.from('admin:admin').toString('base64'),
    'empty bearer': () => 'Bearer ',
    'garbage': () => 'Bearer not.a.jwt',
    'signed with another secret': () => sign(adminPayload, 'attacker-secret'),
    'expired': () => sign(adminPayload, process.env.JWT_SECRET, { expiresIn: -10 }),
    'not valid yet': () => sign(adminPayload, process.env.JWT_SECRET, { notBefore: 3600, expiresIn: '2h' }),
    'alg none (unsigned)': () => `Bearer ${b64({ alg: 'none', typ: 'JWT' })}.${b64(adminPayload)}.`,
    'payload swapped after signing': () => {
      const [h, , s] = sign({ userId: 5, role: 'Worker' }).slice(7).split('.');
      return `Bearer ${h}.${b64(adminPayload)}.${s}`;
    },
  };

  describe.each(Object.keys(forgeries))('%s', (name) => {
    it.each(endpoints)('%s %s -> 401 and the database is never reached', async (method, url, body) => {
      const res = await call(method, url, body, forgeries[name]());
      expect(res.status).toBe(401);
      expect(db.query).not.toHaveBeenCalled();
      expect(db.getConnection).not.toHaveBeenCalled();
    });
  });
});

describe('role claims', () => {
  it.each([[undefined], [null], [''], ['Root'], [42], [['Admin']], [{ role: 'Admin' }]])('unsupported role claim %j -> 403', async (role) => {
    const res = await call('post', '/api/disposal/1/load', { tons: 1, action: 'add' }, sign({ userId: 1, role }));
    expect(res.status).toBe(403);
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it('role aliases are normalised, not trusted verbatim', async () => {
    // "administrator" is an accepted alias of Admin; "superuser" is not an alias of anything.
    db.query.mockResolvedValueOnce([[]]);
    expect((await call('get', '/api/payments/summary', null, sign({ userId: 1, role: ' Administrator ' }))).status).toBe(200);
    expect((await call('get', '/api/payments/summary', null, sign({ userId: 1, role: 'superuser' }))).status).toBe(403);
  });

  it('a Worker alias such as "driver" gets worker permissions only', async () => {
    const t = sign({ userId: 9, role: 'driver' });
    expect((await call('post', '/api/payments/simulate', { worker_id: 9 }, t)).status).toBe(403);
    expect((await call('post', '/api/payments/1/cancel', null, t)).status).toBe(403);
    expect((await call('get', '/api/payments/summary', null, t)).status).toBe(403);
    expect((await call('get', '/api/disposal/1/history', null, t)).status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('a Citizen cannot read payments at all', async () => {
    const t = sign({ userId: 3, role: 'Citizen' });
    expect((await call('get', '/api/payments', null, t)).status).toBe(403);
    expect((await call('get', '/api/payments/1', null, t)).status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('a Supervisor cannot mark payments paid, cancel them or delete sites', async () => {
    const t = sign({ userId: 2, role: 'Supervisor' });
    expect((await call('patch', '/api/payments/1/status', { status: 'Paid' }, t)).status).toBe(403);
    expect((await call('post', '/api/payments/1/cancel', null, t)).status).toBe(403);
    expect((await call('delete', '/api/disposal/1', null, t)).status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('hostile input never reaches SQL text', () => {
  const admin = sign({ userId: 1, role: 'Admin' });
  const evil = ["1; DROP TABLE payments", "1 OR 1=1", "' OR '1'='1", '1 UNION SELECT * FROM users'];

  it.each(evil)('path id %j is rejected with 400', async (id) => {
    for (const [method, prefix, suffix] of [
      ['get', '/api/disposal/', ''], ['get', '/api/disposal/', '/history'], ['delete', '/api/disposal/', ''],
      ['get', '/api/payments/', ''], ['post', '/api/payments/', '/cancel'], ['patch', '/api/payments/', '/status'],
    ]) {
      const res = await call(method, `${prefix}${encodeURIComponent(id)}${suffix}`, method === 'get' || method === 'delete' ? null : { status: 'Paid' }, admin);
      expect(res.status).toBe(400);
    }
    expect(db.query).not.toHaveBeenCalled();
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  it.each(evil)('query value %j is bound as a parameter or rejected', async (value) => {
    db.query.mockResolvedValue([[]]);
    for (const url of ['/api/disposal?search=', '/api/payments?worker_id=', '/api/payments?status=', '/api/payments/summary?worker_id=']) {
      await call('get', url + encodeURIComponent(value), null, admin);
    }
    for (const [sql, params] of db.query.mock.calls) {
      expect(sql).not.toContain(value);
      expect(Array.isArray(params) || params === undefined).toBe(true);
    }
  });

  it('JSON bodies with injection strings or wrong types fail validation', async () => {
    const bodies = [
      { name: "x'); DROP TABLE disposal_sites;--", location: 'B', max_capacity_tons: '10; DROP TABLE x' },
      { name: { $ne: null }, location: ['a'], max_capacity_tons: { a: 1 } },
      { name: 'A', location: 'B', max_capacity_tons: Infinity },
      { name: 'A', location: 'B', max_capacity_tons: -1 },
    ];
    for (const body of bodies) {
      expect((await call('post', '/api/disposal', body, admin)).status).toBe(400);
    }
    expect(db.query).not.toHaveBeenCalled();
  });

  it('malformed JSON gets a clean error, not a stack trace', async () => {
    const res = await request(app).post('/api/disposal').set('Authorization', admin)
      .set('Content-Type', 'application/json').send('{"name": ');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|at .*\.js/);
  });
});

describe('error responses stay generic', () => {
  it('a database failure never exposes SQL, hostnames or stack traces', async () => {
    const t = sign({ userId: 1, role: 'Admin' });
    db.query.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:3306 password='hunter2'"), { code: 'ECONNREFUSED' }));
    db.getConnection.mockRejectedValue(new Error("Access denied for user 'root'@'10.0.0.5'"));
    for (const [method, url, body] of endpoints) {
      const res = await call(method, url, body, t);
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/hunter2|ECONNREFUSED|10\.0\.0\.5|Access denied|stack|\.js:/i);
    }
  });
});
