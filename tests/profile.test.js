
process.env.JWT_SECRET = 'profile-test-secret';

jest.mock('../src/config/db', () => require('./helpers/mockDb').makeDb());

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { resetDb } = require('./helpers/mockDb');

const makeToken = (userId = 7, role = 'Citizen') =>
  jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

const auth = (userId = 7, role = 'Citizen') => ({
  Authorization: `Bearer ${makeToken(userId, role)}`
});

const profile = {
  user_id: 7,
  username: 'testuser',
  email: 'test@example.com',
  role: 'Citizen',
  created_at: '2026-11-18T10:00:00.000Z'
};

beforeEach(() => {
  resetDb(db);
});

describe('Profile API', () => {
  describe('GET /api/auth/profile', () => {
    test('returns the authenticated user profile', async () => {
      db.query.mockResolvedValueOnce([[profile]]);

      const response = await request(app)
        .get('/api/auth/profile')
        .set(auth());

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: 7,
        username: 'testuser',
        email: 'test@example.com',
        role: 'Citizen'
      });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = ?'),
        [7]
      );

      expect(response.body.data.password_hash).toBeUndefined();
    });

    test('rejects requests without authentication', async () => {
      const response = await request(app)
        .get('/api/auth/profile');

      expect(response.status).toBe(401);
      expect(db.query).not.toHaveBeenCalled();
    });

    test('returns 404 when profile does not exist', async () => {
      db.query.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .get('/api/auth/profile')
        .set(auth());

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/auth/profile', () => {
    test('updates username and email for the authenticated user', async () => {
      const updatedProfile = {
        ...profile,
        username: 'updateduser',
        email: 'updated@example.com'
      };

      db.query
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[updatedProfile]]);

      const response = await request(app)
        .put('/api/auth/profile')
        .set(auth())
        .send({
          username: 'updateduser',
          email: 'updated@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.username).toBe('updateduser');
      expect(response.body.data.email).toBe('updated@example.com');

      expect(db.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE users SET username'),
        ['updateduser', 'updated@example.com', 7]
      );
    });

    test('rejects an email already used by another account', async () => {
      db.query.mockResolvedValueOnce([[
        { user_id: 9 }
      ]]);

      const response = await request(app)
        .put('/api/auth/profile')
        .set(auth())
        .send({
          username: 'testuser',
          email: 'taken@example.com'
        });

      expect(response.status).toBe(409);
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('rejects invalid profile data', async () => {
      const response = await request(app)
        .put('/api/auth/profile')
        .set(auth())
        .send({
          username: '',
          email: 'invalid-email'
        });

      expect(response.status).toBe(400);
      expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects unauthenticated profile updates', async () => {
      const response = await request(app)
        .put('/api/auth/profile')
        .send({
          username: 'updateduser',
          email: 'updated@example.com'
        });

      expect(response.status).toBe(401);
      expect(db.query).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/auth/change-password', () => {
    test('changes password when current password is correct', async () => {
      const passwordHash = await bcrypt.hash('OldPassword123!', 10);

      db.query
        .mockResolvedValueOnce([[
          { password_hash: passwordHash }
        ]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const response = await request(app)
        .put('/api/auth/change-password')
        .set(auth())
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password changed successfully');

      const updateCall = db.query.mock.calls[1];
      const savedHash = updateCall[1][0];

      expect(
        await bcrypt.compare('NewPassword123!', savedHash)
      ).toBe(true);

      expect(updateCall[1][1]).toBe(7);
    });

    test('rejects an incorrect current password', async () => {
      const passwordHash = await bcrypt.hash('OldPassword123!', 10);

      db.query.mockResolvedValueOnce([[
        { password_hash: passwordHash }
      ]]);

      const response = await request(app)
        .put('/api/auth/change-password')
        .set(auth())
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        'Current password is incorrect'
      );

      expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('rejects a weak new password', async () => {
      const response = await request(app)
        .put('/api/auth/change-password')
        .set(auth())
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'short'
        });

      expect(response.status).toBe(400);
      expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects using the same current and new password', async () => {
      const response = await request(app)
        .put('/api/auth/change-password')
        .set(auth())
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'OldPassword123!'
        });

      expect(response.status).toBe(400);
      expect(db.query).not.toHaveBeenCalled();
    });

    test('rejects unauthenticated password changes', async () => {
      const response = await request(app)
        .put('/api/auth/change-password')
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!'
        });

      expect(response.status).toBe(401);
      expect(db.query).not.toHaveBeenCalled();
    });
  });
});
