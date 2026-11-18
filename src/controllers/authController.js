
const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Register a new Citizen account.
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (
      typeof username !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !username.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        code: 400,
        message: 'Username, email, and password are required'
      });
    }

    if (!isValidEmail(email.trim())) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid email format'
      });
    }

    if (username.trim().length > 100) {
      return res.status(400).json({
        code: 400,
        message: 'Username must not exceed 100 characters'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        code: 400,
        message: 'Password must be at least 8 characters long'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim();

    const [existing] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        code: 409,
        message: 'User already exists'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [normalizedUsername, normalizedEmail, passwordHash, 'Citizen']
    );

    return res.status(201).json({
      code: 201,
      message: 'User registered successfully'
    });
  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: 'Server error'
    });
  }
};

// Login.
exports.login = async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        code: 500,
        message: 'Server configuration error'
      });
    }

    const { email, password } = req.body || {};

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        code: 400,
        message: 'Email and password are required'
      });
    }

    if (!isValidEmail(email.trim())) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid email format'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [users] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (
      users.length === 0 ||
      !(await bcrypt.compare(password, users[0].password_hash))
    ) {
      return res.status(401).json({
        code: 401,
        message: 'Invalid credentials'
      });
    }

    const user = users[0];

    const token = jwt.sign(
      {
        userId: user.user_id,
        role: user.role,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      code: 200,
      message: 'Login successful',
      token,
      user: {
        id: user.user_id,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: 'Server error'
    });
  }
};

// Get the authenticated user's profile.
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [users] = await db.query(
      `SELECT user_id, username, email, role, created_at
       FROM users
       WHERE user_id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'User profile not found'
      });
    }

    const user = users[0];

    return res.status(200).json({
      code: 200,
      message: 'Profile retrieved successfully',
      data: {
        id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at
      }
    });
  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: 'Server error'
    });
  }
};

// Update the authenticated user's username and email.
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { username, email } = req.body || {};

    if (
      typeof username !== 'string' ||
      typeof email !== 'string' ||
      !username.trim() ||
      !email.trim()
    ) {
      return res.status(400).json({
        code: 400,
        message: 'Username and email are required'
      });
    }

    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedUsername.length > 100) {
      return res.status(400).json({
        code: 400,
        message: 'Username must not exceed 100 characters'
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid email format'
      });
    }

    const [existing] = await db.query(
      'SELECT user_id FROM users WHERE email = ? AND user_id != ?',
      [normalizedEmail, userId]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        code: 409,
        message: 'Email is already being used by another account'
      });
    }

    await db.query(
      'UPDATE users SET username = ?, email = ? WHERE user_id = ?',
      [normalizedUsername, normalizedEmail, userId]
    );

    const [updatedUsers] = await db.query(
      `SELECT user_id, username, email, role, created_at
       FROM users
       WHERE user_id = ?`,
      [userId]
    );

    if (updatedUsers.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'User profile not found'
      });
    }

    const user = updatedUsers[0];

    return res.status(200).json({
      code: 200,
      message: 'Profile updated successfully',
      data: {
        id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        code: 409,
        message: 'Email is already being used by another account'
      });
    }

    return res.status(500).json({
      code: 500,
      message: 'Server error'
    });
  }
};

// Change the authenticated user's password.
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body || {};

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      !currentPassword ||
      !newPassword
    ) {
      return res.status(400).json({
        code: 400,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        code: 400,
        message: 'New password must be at least 8 characters long'
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        code: 400,
        message: 'New password must be different from the current password'
      });
    }

    const [users] = await db.query(
      'SELECT password_hash FROM users WHERE user_id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'User account not found'
      });
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      users[0].password_hash
    );

    if (!passwordMatches) {
      return res.status(400).json({
        code: 400,
        message: 'Current password is incorrect'
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await db.query(
      'UPDATE users SET password_hash = ? WHERE user_id = ?',
      [newPasswordHash, userId]
    );

    return res.status(200).json({
      code: 200,
      message: 'Password changed successfully'
    });
  } catch (err) {
    return res.status(500).json({
      code: 500,
      message: 'Server error'
    });
  }
};
