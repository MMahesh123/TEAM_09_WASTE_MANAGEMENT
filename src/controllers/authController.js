const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ code: 409, message: 'User already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, role || 'Citizen']
    );
    res.status(201).json({ code: 201, message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ code: 500, message: 'Server error', details: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0 || !(await bcrypt.compare(password, users[0].password_hash))) {
      return res.status(401).json({ code: 401, message: 'Invalid credentials' });
    }
    const user = users[0];
    const token = jwt.sign(
      { userId: user.user_id, role: user.role, email: user.email },
      process.env.JWT_SECRET || 'secret_key_demo',
      { expiresIn: '24h' }
    );
    res.status(200).json({
      code: 200,
      message: 'Login successful',
      token,
      user: { id: user.user_id, username: user.username, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: 'Server error', details: err.message });
  }
};