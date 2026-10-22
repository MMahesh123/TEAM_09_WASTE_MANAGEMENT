const jwt = require('jsonwebtoken');

jest.mock('../src/config/db', () => ({
  query: jest.fn()
}));

const db = require('../src/config/db');
const authController = require('../src/controllers/authController');
const { verifyToken, verifyRole } = require('../src/middleware/authMiddleware');

function mockResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

describe('Authentication security', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  test('registration always assigns Citizen, ignoring a submitted Admin role', async () => {
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 1 }]);

    const req = {
      body: {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        role: 'Admin'
      }
    };
    const res = mockResponse();

    await authController.register(req, res);

    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO users'),
      ['testuser', 'test@example.com', expect.any(String), 'Citizen']
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('login refuses to issue a token when JWT_SECRET is missing', async () => {
    delete process.env.JWT_SECRET;

    const req = {
      body: {
        email: 'test@example.com',
        password: 'Password123!'
      }
    };
    const res = mockResponse();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      code: 500,
      message: 'Server configuration error'
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  test('middleware rejects a request without a bearer token', () => {
    process.env.JWT_SECRET = 'test-secret';

    const req = { headers: {} };
    const res = mockResponse();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('middleware rejects requests when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;

    const req = {
      headers: { authorization: 'Bearer some-token' }
    };
    const res = mockResponse();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      code: 500,
      message: 'Server configuration error'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('middleware rejects an invalid token', () => {
    process.env.JWT_SECRET = 'test-secret';

    const req = {
      headers: { authorization: 'Bearer invalid-token' }
    };
    const res = mockResponse();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('middleware calls next when the token is valid', () => {
    process.env.JWT_SECRET = 'test-secret';

    const token = jwt.sign(
      { userId: 1, role: 'Citizen' },
      process.env.JWT_SECRET
    );
    const req = {
      headers: { authorization: `Bearer ${token}` }
    };
    const res = mockResponse();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(req.user.userId).toBe(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('role middleware rejects a Citizen from a Supervisor-only route', () => {
    process.env.JWT_SECRET = 'test-secret';

    const token = jwt.sign(
      { userId: 1, role: 'Citizen' },
      process.env.JWT_SECRET
    );
    const req = {
      headers: { authorization: `Bearer ${token}` }
    };
    const res = mockResponse();
    const next = jest.fn();

    verifyRole(['Supervisor'])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('role middleware allows Admin to access a Supervisor-only route', () => {
    process.env.JWT_SECRET = 'test-secret';

    const token = jwt.sign(
      { userId: 1, role: 'Admin' },
      process.env.JWT_SECRET
    );
    const req = {
      headers: { authorization: `Bearer ${token}` }
    };
    const res = mockResponse();
    const next = jest.fn();

    verifyRole(['Supervisor'])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
