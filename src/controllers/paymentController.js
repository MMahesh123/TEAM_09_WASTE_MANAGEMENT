
const crypto = require('crypto');
const db = require('../config/db');
const { isTons, isISODate, parseId, round2 } = require('../utils/validate');
const {
  bad,
  forbidden,
  notFound,
  conflict,
  send,
  serverError
} = require('../utils/respond');
const { recordAuditEvent } = require('../services/auditService');

// A payment period is an inclusive range of calendar dates, at most one year long.
const MAX_PERIOD_DAYS = 366;

// Largest amount that fits payments.amount DECIMAL(12,2).
const MAX_AMOUNT = 9999999999.99;

const STAFF_ROLES = ['Admin', 'Supervisor'];
const PAYMENT_VIEW_ROLES = [...STAFF_ROLES, 'Worker'];
const PAYMENT_STATUSES = ['Simulated', 'Paid'];

const calculateAmount = (totalTons, ratePerTon) =>
  round2(totalTons * ratePerTon);

const periodDays = (start, end) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;

const toPayment = (row) => ({
  ...row,
  total_tons: Number(row.total_tons),
  rate_per_ton: Number(row.rate_per_ton),
  amount: Number(row.amount),
  ...(row.log_count !== undefined && {
    log_count: Number(row.log_count)
  })
});

// The rate must be explicitly configured by the project team.
// No implicit fallback or request-body override is allowed.
function getConfiguredRate() {
  const raw = process.env.WAGE_RATE_PER_TON;

  if (raw === undefined || String(raw).trim() === '') {
    return {
      error: 'Payment rate is not configured. Set WAGE_RATE_PER_TON.'
    };
  }

  const rate = Number(raw);

  if (!isTons(rate)) {
    return {
      error: 'WAGE_RATE_PER_TON must be a positive number with at most 2 decimals.'
    };
  }

  return { rate };
}

// Validates request and confirms the worker exists.
async function parseRequest(body) {
  const {
    worker_id,
    period_start,
    period_end
  } = body || {};

  if (body && body.rate_per_ton !== undefined) {
    return {
      error: 'rate_per_ton is configured by the server and cannot be supplied in the request.'
    };
  }

  const workerId = parseId(worker_id);

  if (!workerId) {
    return {
      error: 'worker_id must be a positive integer'
    };
  }

  if (
    !isISODate(period_start) ||
    !isISODate(period_end)
  ) {
    return {
      error: 'period_start and period_end must be valid YYYY-MM-DD dates'
    };
  }

  if (period_start > period_end) {
    return {
      error: 'period_start must not be after period_end'
    };
  }

  if (periodDays(period_start, period_end) > MAX_PERIOD_DAYS) {
    return {
      error: `Payment period cannot be longer than ${MAX_PERIOD_DAYS} days`
    };
  }

  const configured = getConfiguredRate();

  if (configured.error) {
    return {
      error: configured.error,
      status: 503
    };
  }

  const [users] = await db.query(
    'SELECT role FROM users WHERE user_id = ?',
    [workerId]
  );

  if (users.length === 0) {
    return {
      error: 'worker_id does not match any user',
      status: 404
    };
  }

  if (users[0].role !== 'Worker') {
    return {
      error: 'worker_id must belong to a user with the Worker role'
    };
  }

  return {
    input: {
      workerId,
      period_start,
      period_end,
      rate: configured.rate
    }
  };
}

// Fetch only Supervisor-approved collection records.
// accepted_tons, not waste_tons, is the payable quantity.
async function fetchLogs(
  runner,
  { workerId, period_start, period_end },
  lock = false
) {
  const [rows] = await runner.query(
    `SELECT
       c.log_id,
       c.accepted_tons,
       (pi.log_id IS NOT NULL) AS paid
     FROM collection_logs c
     LEFT JOIN payment_items pi
       ON pi.log_id = c.log_id
     WHERE c.worker_id = ?
       AND c.collected_at BETWEEN ? AND ?
       AND c.verification_status = 'Approved'
       AND c.accepted_tons IS NOT NULL
       AND c.accepted_tons > 0
     ORDER BY c.log_id${lock ? ' FOR UPDATE' : ''}`,
    [workerId, period_start, period_end]
  );

  return rows;
}

// Sum approved quantities using whole hundredths of a ton.
function summarise(
  rows,
  { workerId, period_start, period_end, rate }
) {
  const unpaid = rows.filter((row) => !Number(row.paid));

  const hundredths = unpaid.reduce(
    (sum, row) =>
      sum + Math.round(Number(row.accepted_tons) * 100),
    0
  );

  const totalTons = hundredths / 100;

  return {
    unpaid,
    data: {
      worker_id: workerId,
      period_start,
      period_end,
      log_count: unpaid.length,
      already_paid_log_count: rows.length - unpaid.length,
      total_tons: totalTons,
      rate_per_ton: rate,
      amount: calculateAmount(totalTons, rate)
    }
  };
}

const requestError = (res, { error, status }) =>
  send(res, status || 400, error);

// WMS-F-012: Calculate only. No database records are created.
exports.calculate = async (req, res) => {
  try {
    const parsed = await parseRequest(req.body);

    if (parsed.error) {
      return requestError(res, parsed);
    }

    const { data } = summarise(
      await fetchLogs(db, parsed.input),
      parsed.input
    );

    if (data.amount > MAX_AMOUNT) {
      return bad(res, 'Calculated amount is too large');
    }

    return res.status(200).json({
      code: 200,
      data
    });
  } catch (err) {
    return serverError(res, err);
  }
};

const isRetryable = (err) =>
  err &&
  (
    err.code === 'ER_LOCK_DEADLOCK' ||
    err.code === 'ER_LOCK_WAIT_TIMEOUT'
  );

// WMS-F-013: Simulate payment. No real money moves.
exports.simulate = async (req, res) => {
  let conn;

  try {
    const parsed = await parseRequest(req.body);

    if (parsed.error) {
      return requestError(res, parsed);
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    const rows = await fetchLogs(conn, parsed.input, true);

    if (rows.length === 0) {
      await conn.rollback();

      return bad(
        res,
        'No approved collection logs found for this worker and period'
      );
    }

    const { unpaid, data } = summarise(
      rows,
      parsed.input
    );

    if (unpaid.length === 0) {
      await conn.rollback();

      return conflict(
        res,
        'All approved collection logs in this period have already been paid'
      );
    }

    if (data.total_tons === 0) {
      await conn.rollback();

      return bad(
        res,
        'The approved collection logs contain no accepted waste to pay for'
      );
    }

    if (data.amount > MAX_AMOUNT) {
      await conn.rollback();

      return bad(res, 'Calculated amount is too large');
    }

    const reference =
      'SIM-' +
      crypto.randomBytes(8).toString('hex').toUpperCase();

    const [result] = await conn.query(
      `INSERT INTO payments (
         worker_id,
         period_start,
         period_end,
         total_tons,
         rate_per_ton,
         amount,
         status,
         reference_no
       )
       VALUES (?, ?, ?, ?, ?, ?, 'Simulated', ?)`,
      [
        data.worker_id,
        data.period_start,
        data.period_end,
        data.total_tons,
        data.rate_per_ton,
        data.amount,
        reference
      ]
    );

    await conn.query(
      'INSERT INTO payment_items (payment_id, log_id) VALUES ?',
      [unpaid.map((row) => [result.insertId, row.log_id])]
    );

    await conn.commit();

    return send(res, 201, 'Payment simulated', {
      data: {
        payment_id: result.insertId,
        reference_no: reference,
        status: 'Simulated',
        ...data
      }
    });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => {});
    }

    if (err.code === 'ER_DUP_ENTRY') {
      return conflict(
        res,
        'Some collection logs in this period have already been paid'
      );
    }

    if (isRetryable(err)) {
      return conflict(
        res,
        'Another payment for this worker is in progress; please retry'
      );
    }

    return serverError(res, err);
  } finally {
    if (conn) {
      conn.release();
    }
  }
};

const PAYMENT_SELECT = `
  SELECT p.*,
    (
      SELECT COUNT(*)
      FROM payment_items i
      WHERE i.payment_id = p.payment_id
    ) AS log_count
  FROM payments p
`;

exports.listPayments = async (req, res) => {
  try {
    if (!PAYMENT_VIEW_ROLES.includes(req.user.role)) {
      return forbidden(res);
    }

    const isStaff = STAFF_ROLES.includes(req.user.role);

    const {
      worker_id,
      status,
      limit = '50',
      offset = '0'
    } = req.query;

    const conditions = [];
    const params = [];

    if (!isStaff) {
      conditions.push('p.worker_id = ?');
      params.push(req.user.userId);
    } else if (worker_id !== undefined) {
      const id = parseId(worker_id);

      if (!id) {
        return bad(res, 'Invalid worker_id');
      }

      conditions.push('p.worker_id = ?');
      params.push(id);
    }

    if (status !== undefined) {
      if (!PAYMENT_STATUSES.includes(status)) {
        return bad(
          res,
          `status must be one of: ${PAYMENT_STATUSES.join(', ')}`
        );
      }

      conditions.push('p.status = ?');
      params.push(status);
    }

    const limitN = Number(limit);
    const offsetN = Number(offset);

    if (
      !Number.isInteger(limitN) ||
      limitN < 1 ||
      limitN > 200
    ) {
      return bad(
        res,
        'limit must be an integer between 1 and 200'
      );
    }

    if (
      !Number.isInteger(offsetN) ||
      offsetN < 0
    ) {
      return bad(
        res,
        'offset must be a non-negative integer'
      );
    }

    const where = conditions.length
      ? ` WHERE ${conditions.join(' AND ')}`
      : '';

    const [rows] = await db.query(
      `${PAYMENT_SELECT}${where}
       ORDER BY p.created_at DESC, p.payment_id DESC
       LIMIT ? OFFSET ?`,
      [...params, limitN, offsetN]
    );

    return res.status(200).json({
      code: 200,
      count: rows.length,
      limit: limitN,
      offset: offsetN,
      data: rows.map(toPayment)
    });
  } catch (err) {
    return serverError(res, err);
  }
};

exports.getPayment = async (req, res) => {
  try {
    if (!PAYMENT_VIEW_ROLES.includes(req.user.role)) {
      return forbidden(res);
    }

    const id = parseId(req.params.id);

    if (!id) {
      return bad(res, 'Invalid payment id');
    }

    const [rows] = await db.query(
      `${PAYMENT_SELECT} WHERE p.payment_id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return notFound(res, 'Payment not found');
    }

    if (
      !STAFF_ROLES.includes(req.user.role) &&
      Number(rows[0].worker_id) !== Number(req.user.userId)
    ) {
      return forbidden(res);
    }

    return res.status(200).json({
      code: 200,
      data: toPayment(rows[0])
    });
  } catch (err) {
    return serverError(res, err);
  }
};

// Simulated -> Paid is an administrative settlement marker.
// No real money is transferred. The audit entry and status update
// are committed together in one transaction.
exports.markPaid = async (req, res) => {
  let conn;

  try {
    const id = parseId(req.params.id);

    if (!id) {
      return bad(res, 'Invalid payment id');
    }

    if (!req.body || req.body.status !== 'Paid') {
      return bad(res, "status must be 'Paid'");
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [existing] = await conn.query(
      'SELECT * FROM payments WHERE payment_id = ? FOR UPDATE',
      [id]
    );

    if (existing.length === 0) {
      await conn.rollback();
      return notFound(res, 'Payment not found');
    }

    const payment = existing[0];

    if (payment.status !== 'Simulated') {
      await conn.rollback();
      return conflict(res, `Payment is already ${payment.status}`);
    }

    await conn.query(
      `UPDATE payments
       SET status = 'Paid', paid_at = NOW()
       WHERE payment_id = ?`,
      [id]
    );

    await recordAuditEvent({
      actor: req.user,
      action: 'PAYMENT_MARKED_PAID',
      entityType: 'Payment',
      entityId: id,
      oldValues: {
        status: 'Simulated'
      },
      newValues: {
        status: 'Paid'
      },
      metadata: {
        worker_id: payment.worker_id,
        amount: Number(payment.amount),
        reference_no: payment.reference_no,
        note: 'Settlement status recorded; no funds transferred by this system.'
      },
      executor: conn
    });

    const [updated] = await conn.query(
      `${PAYMENT_SELECT} WHERE p.payment_id = ?`,
      [id]
    );

    await conn.commit();

    return send(res, 200, 'Payment marked as paid', {
      data: toPayment(updated[0])
    });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => {});
    }

    return serverError(res, err);
  } finally {
    if (conn) {
      conn.release();
    }
  }
};

exports.calculateAmount = calculateAmount;
