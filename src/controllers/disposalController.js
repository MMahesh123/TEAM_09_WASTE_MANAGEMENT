const db = require('../config/db');
const { isPositiveNumber, isNonEmptyString, parseId } = require('../utils/validate');

const bad = (res, message) => res.status(400).json({ code: 400, message });
const serverError = (res) => res.status(500).json({ code: 500, message: 'Server error' });

exports.createSite = async (req, res) => {
  try {
    const { name, location, max_capacity_tons } = req.body;
    if (!isNonEmptyString(name, 100)) return bad(res, 'name is required (max 100 chars)');
    if (!isNonEmptyString(location, 255)) return bad(res, 'location is required (max 255 chars)');
    if (!isPositiveNumber(max_capacity_tons)) return bad(res, 'max_capacity_tons must be a positive number');

    const [dup] = await db.query('SELECT site_id FROM disposal_sites WHERE name = ?', [name.trim()]);
    if (dup.length > 0) return res.status(409).json({ code: 409, message: 'Disposal site already exists' });

    const [result] = await db.query(
      'INSERT INTO disposal_sites (name, location, max_capacity_tons) VALUES (?, ?, ?)',
      [name.trim(), location.trim(), max_capacity_tons]
    );
    res.status(201).json({ code: 201, message: 'Disposal site created', site_id: result.insertId });
  } catch (err) {
    serverError(res);
  }
};

exports.listSites = async (req, res) => {
  try {
    const [sites] = await db.query(
      `SELECT site_id, name, location, max_capacity_tons, current_load_tons,
              ROUND(current_load_tons / max_capacity_tons * 100, 2) AS utilization_pct
       FROM disposal_sites ORDER BY name`
    );
    res.status(200).json({ code: 200, data: sites });
  } catch (err) {
    serverError(res);
  }
};

exports.getSite = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return bad(res, 'Invalid site id');
    const [rows] = await db.query(
      `SELECT site_id, name, location, max_capacity_tons, current_load_tons,
              ROUND(current_load_tons / max_capacity_tons * 100, 2) AS utilization_pct
       FROM disposal_sites WHERE site_id = ?`, [id]
    );
    if (rows.length === 0) return res.status(404).json({ code: 404, message: 'Disposal site not found' });
    res.status(200).json({ code: 200, data: rows[0] });
  } catch (err) {
    serverError(res);
  }
};

exports.updateSite = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return bad(res, 'Invalid site id');
    const { name, location, max_capacity_tons } = req.body;
    if (!isNonEmptyString(name, 100)) return bad(res, 'name is required (max 100 chars)');
    if (!isNonEmptyString(location, 255)) return bad(res, 'location is required (max 255 chars)');
    if (!isPositiveNumber(max_capacity_tons)) return bad(res, 'max_capacity_tons must be a positive number');

    const [rows] = await db.query('SELECT current_load_tons FROM disposal_sites WHERE site_id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ code: 404, message: 'Disposal site not found' });
    if (max_capacity_tons < Number(rows[0].current_load_tons)) {
      return bad(res, 'max_capacity_tons cannot be lower than the current load');
    }
    await db.query(
      'UPDATE disposal_sites SET name = ?, location = ?, max_capacity_tons = ? WHERE site_id = ?',
      [name.trim(), location.trim(), max_capacity_tons, id]
    );
    res.status(200).json({ code: 200, message: 'Disposal site updated' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ code: 409, message: 'Disposal site name already in use' });
    serverError(res);
  }
};

exports.deleteSite = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return bad(res, 'Invalid site id');
    const [result] = await db.query('DELETE FROM disposal_sites WHERE site_id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ code: 404, message: 'Disposal site not found' });
    res.status(200).json({ code: 200, message: 'Disposal site deleted' });
  } catch (err) {
    serverError(res);
  }
};

// WMS-F-011: record waste dumped at (action "add") or removed from (action "remove") a site.
exports.updateLoad = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return bad(res, 'Invalid site id');
    const { tons, action } = req.body;
    if (!isPositiveNumber(tons)) return bad(res, 'tons must be a positive number');
    if (!['add', 'remove'].includes(action)) return bad(res, "action must be 'add' or 'remove'");

    // Conditional UPDATE keeps the capacity check atomic under concurrent requests.
    const sql = action === 'add'
      ? 'UPDATE disposal_sites SET current_load_tons = current_load_tons + ? WHERE site_id = ? AND current_load_tons + ? <= max_capacity_tons'
      : 'UPDATE disposal_sites SET current_load_tons = current_load_tons - ? WHERE site_id = ? AND current_load_tons - ? >= 0';
    const [result] = await db.query(sql, [tons, id, tons]);

    if (result.affectedRows === 0) {
      const [rows] = await db.query('SELECT site_id FROM disposal_sites WHERE site_id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ code: 404, message: 'Disposal site not found' });
      return bad(res, action === 'add' ? 'Load would exceed site capacity' : 'Cannot remove more than the current load');
    }
    const [rows] = await db.query('SELECT current_load_tons, max_capacity_tons FROM disposal_sites WHERE site_id = ?', [id]);
    res.status(200).json({ code: 200, message: 'Load updated', data: rows[0] });
  } catch (err) {
    serverError(res);
  }
};
