
const db = require('../config/db')

// GET /api/workers
exports.getAllWorkers = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT user_id, username, email
       FROM users
       WHERE role = 'Worker'
       ORDER BY username ASC`
    )

    res.status(200).json(rows)
  } catch (error) {
    next(error)
  }
}
