const crypto = require('crypto');
const db = require('../config/db');
const { isPositiveNumber, isISODate, parseId, round2 } = require('../utils/validate');

const DEFAULT_RATE_PER_TON = Number(process.env.WAGE_RATE_PER_TON) || 500;

const bad = (res, message) => res.status(400).json({ code: 400, message });
const serverError = (res) => res.status(500).json({ code: 500, message: 'Server error' });

// Pure calculation, exported for unit testing.
const calculateAmount = (totalTons, ratePerTon) => round2(totalTons * ratePerTon);

async function buildCalculation(body) {
  const { worker_id, period_start, period_end } = body;
  const rate = body.rate_per_ton === undefined ? DEFAULT_RATE_PER_TON : body.rate_per_ton;
  const workerId = parseId(worker_id);

  if (!workerId) return { error: 'worker_id must be a positive integer' };
  if (!isISODate(period_start) || !isISODate(period_end)) return { error: 'period_start and period_end must be YYYY-MM-DD' };
  if (period_start > period_end) return { error: 'period_start must not be after period_end' };
  if (!isPositiveNumber(rate)) return { error: 'rate_per_ton must be a positive number' };

  const [rows] = await db.query(
    `SELECT COALESCE(SUM(waste_tons), 0) AS total_tons, COUNT(*) AS log_count
     FROM collection_logs WHERE worker_id = ? AND collected_at BETWEEN ? AND ?`,
    [workerId, period_start, period_end]
  );
  const totalTons = Number(rows[0].total_tons);
  return {
    data: {
      worker_id: workerId, period_start, period_end,
      log_count: Number(rows[0].log_count),
      total_tons: totalTons,
      rate_per_ton: rate,
      amount: calculateAmount(totalTons, rate)
    }
  };
}

// WMS-F-012: calculate only, nothing is stored.
exports.calculate = async (req, res) => {
  try {
    const { error, data } = await buildCalculation(req.body);
    if (error) return bad(res, error);
    res.status(200).json({ code: 200, data });
  } catch (err) {
    serverError(res);
  }
};

// WMS-F-013: calculate and record a simulated payment (no real money moves).
exports.simulate = async (req, res) => {
  try {
    const { error, data } = await buildCalculation(req.body);
    if (error) return bad(res, error);
    if (data.total_tons === 0) return bad(res, 'No collection logs found for this worker and period');

    const reference = 'SIM-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const [result] = await db.query(
      `INSERT INTO payments (worker_id, period_start, period_end, total_tons, rate_per_ton, amount, status, reference_no)
       VALUES (?, ?, ?, ?, ?, ?, 'Simulated', ?)`,
      [data.worker_id, data.period_start, data.period_end, data.total_tons, data.rate_per_ton, data.amount, reference]
    );
    res.status(201).json({
      code: 201, message: 'Payment simulated',
      data: { payment_id: result.insertId, reference_no: reference, status: 'Simulated', ...data }
    });
  } catch (err) {
    serverError(res);
  }
};

exports.listPayments = async (req, res) => {
  try {
    const isStaff = req.user.role === 'Admin' || req.user.role === 'Supervisor';
    let workerId = null;
    if (isStaff && req.query.worker_id !== undefined) {
      workerId = parseId(req.query.worker_id);
      if (!workerId) return bad(res, 'Invalid worker_id');
    } else if (!isStaff) {
      workerId = req.user.userId; // non-staff only see their own payments
    }
    const [rows] = workerId
      ? await db.query('SELECT * FROM payments WHERE worker_id = ? ORDER BY created_at DESC', [workerId])
      : await db.query('SELECT * FROM payments ORDER BY created_at DESC');
    res.status(200).json({ code: 200, data: rows });
  } catch (err) {
    serverError(res);
  }
};

exports.getPayment = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return bad(res, 'Invalid payment id');
    const [rows] = await db.query('SELECT * FROM payments WHERE payment_id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ code: 404, message: 'Payment not found' });
    const isStaff = req.user.role === 'Admin' || req.user.role === 'Supervisor';
    if (!isStaff && rows[0].worker_id !== req.user.userId) {
      return res.status(403).json({ code: 403, message: 'Insufficient permissions' });
    }
    res.status(200).json({ code: 200, data: rows[0] });
  } catch (err) {
    serverError(res);
  }
};

exports.calculateAmount = calculateAmount;
