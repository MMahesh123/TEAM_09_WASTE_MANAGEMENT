const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    // Validate input before querying the database or hashing the password.
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

    // Public registrations always receive the Citizen role.
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
    // Avoid exposing database or internal error details.
    return res.status(500).json({
      code: 500,
      message: 'Server error'
    });
  }
};

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
