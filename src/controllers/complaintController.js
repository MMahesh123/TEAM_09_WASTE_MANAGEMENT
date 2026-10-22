const db = require('../config/db');
const { isNonEmptyString, parseId } = require('../utils/validate');

const TYPES = ['Uncollected Waste', 'Overflow', 'Other'];
const STATUSES = ['Open', 'In-Progress', 'Resolved'];
// Allowed status moves: Open -> In-Progress -> Resolved (Open may also go straight to Resolved).
const TRANSITIONS = { 'Open': ['In-Progress', 'Resolved'], 'In-Progress': ['Resolved'], 'Resolved': [] };

const bad = (res, message) => res.status(400).json({ code: 400, message });
const serverError = (res) => res.status(500).json({ code: 500, message: 'Server error' });
const isStaff = (user) => user.role === 'Admin' || user.role === 'Supervisor';

exports.createComplaint = async (req, res) => {
  try {
    const { type, description, location } = req.body;
    if (!TYPES.includes(type)) return bad(res, `type must be one of: ${TYPES.join(', ')}`);
    if (!isNonEmptyString(description, 1000)) return bad(res, 'description is required (max 1000 chars)');
    if (!isNonEmptyString(location, 255)) return bad(res, 'location is required (max 255 chars)');

    const [result] = await db.query(
      'INSERT INTO complaints (user_id, type, description, location) VALUES (?, ?, ?, ?)',
      [req.user.userId, type, description.trim(), location.trim()]
    );
    res.status(201).json({ code: 201, message: 'Complaint raised', complaint_id: result.insertId, status: 'Open' });
  } catch (err) {
    serverError(res);
  }
};

exports.listComplaints = async (req, res) => {
  try {
    const { status } = req.query;
    if (status !== undefined && !STATUSES.includes(status)) return bad(res, `status must be one of: ${STATUSES.join(', ')}`);

    const where = [];
    const params = [];
    if (!isStaff(req.user)) { where.push('user_id = ?'); params.push(req.user.userId); }
    if (status) { where.push('status = ?'); params.push(status); }
    const [rows] = await db.query(
      `SELECT * FROM complaints ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`,
      params
    );
    res.status(200).json({ code: 200, data: rows });
  } catch (err) {
    serverError(res);
  }
};

async function loadAuthorized(req, res) {
  const id = parseId(req.params.id);
  if (!id) { bad(res, 'Invalid complaint id'); return null; }
  const [rows] = await db.query('SELECT * FROM complaints WHERE complaint_id = ?', [id]);
  if (rows.length === 0) { res.status(404).json({ code: 404, message: 'Complaint not found' }); return null; }
  if (!isStaff(req.user) && rows[0].user_id !== req.user.userId) {
    res.status(403).json({ code: 403, message: 'Insufficient permissions' });
    return null;
  }
  return rows[0];
}

exports.getComplaint = async (req, res) => {
  try {
    const complaint = await loadAuthorized(req, res);
    if (complaint) res.status(200).json({ code: 200, data: complaint });
  } catch (err) {
    serverError(res);
  }
};

// Owner can edit details only while the complaint is still Open.
exports.updateComplaint = async (req, res) => {
  try {
    const complaint = await loadAuthorized(req, res);
    if (!complaint) return;
    if (complaint.status !== 'Open') return bad(res, 'Only Open complaints can be edited');

    const { type, description, location } = req.body;
    if (!TYPES.includes(type)) return bad(res, `type must be one of: ${TYPES.join(', ')}`);
    if (!isNonEmptyString(description, 1000)) return bad(res, 'description is required (max 1000 chars)');
    if (!isNonEmptyString(location, 255)) return bad(res, 'location is required (max 255 chars)');

    await db.query(
      'UPDATE complaints SET type = ?, description = ?, location = ? WHERE complaint_id = ?',
      [type, description.trim(), location.trim(), complaint.complaint_id]
    );
    res.status(200).json({ code: 200, message: 'Complaint updated' });
  } catch (err) {
    serverError(res);
  }
};

// Staff only (enforced in the route).
exports.updateStatus = async (req, res) => {
  try {
    const complaint = await loadAuthorized(req, res);
    if (!complaint) return;
    const { status } = req.body;
    if (!STATUSES.includes(status)) return bad(res, `status must be one of: ${STATUSES.join(', ')}`);
    if (!TRANSITIONS[complaint.status].includes(status)) {
      return bad(res, `Cannot change status from ${complaint.status} to ${status}`);
    }
    await db.query(
      'UPDATE complaints SET status = ?, resolved_at = ? WHERE complaint_id = ?',
      [status, status === 'Resolved' ? new Date() : null, complaint.complaint_id]
    );
    res.status(200).json({ code: 200, message: 'Status updated', status });
  } catch (err) {
    serverError(res);
  }
};

exports.deleteComplaint = async (req, res) => {
  try {
    const complaint = await loadAuthorized(req, res);
    if (!complaint) return;
    if (!isStaff(req.user) && complaint.status !== 'Open') return bad(res, 'Only Open complaints can be deleted');
    await db.query('DELETE FROM complaints WHERE complaint_id = ?', [complaint.complaint_id]);
    res.status(200).json({ code: 200, message: 'Complaint deleted' });
  } catch (err) {
    serverError(res);
  }
};
