const db = require('../config/db');
const { isTons, isNonEmptyString, parseId } = require('../utils/validate');
const { bad, notFound, conflict, send, serverError } = require('../utils/respond');

const SITE_COLUMNS = `site_id, name, location, max_capacity_tons, current_load_tons,
  ROUND(current_load_tons / max_capacity_tons * 100, 2) AS utilization_pct`;

// mysql2 returns DECIMAL columns as strings; the API exposes numbers.
const toSite = (row) => ({
  ...row,
  max_capacity_tons: Number(row.max_capacity_tons),
  current_load_tons: Number(row.current_load_tons),
  ...(row.utilization_pct !== undefined && { utilization_pct: Number(row.utilization_pct) })
});

// Shared by create and update.
function validateSiteBody(body) {
  const { name, location, max_capacity_tons } = body || {};
  if (!isNonEmptyString(name, 100)) return 'name is required (max 100 chars)';
  if (!isNonEmptyString(location, 255)) return 'location is required (max 255 chars)';
  if (!isTons(max_capacity_tons)) {
    return 'max_capacity_tons must be a positive number with at most 2 decimals (max 99999999.99)';
  }
  return null;
}

exports.createSite = async (req, res) => {
  try {
    const error = validateSiteBody(req.body);
    if (error) return bad(res, error);
    const { name, location, max_capacity_tons } = req.body;

    const [dup] = await db.query('SELECT site_id FROM disposal_sites WHERE name = ?', [name.trim()]);
    if (dup.length > 0) return conflict(res, 'Disposal site already exists');

    const [result] = await db.query(
      'INSERT INTO disposal_sites (name, location, max_capacity_tons) VALUES (?, ?, ?)',
      [name.trim(), location.trim(), max_capacity_tons]
    );
    send(res, 201, 'Disposal site created', { site_id: result.insertId });
  } catch (err) {
    // Two simultaneous creates can both pass the duplicate check; the UNIQUE index decides.
    if (err.code === 'ER_DUP_ENTRY') return conflict(res, 'Disposal site already exists');
    serverError(res, err);
  }
};

exports.listSites = async (req, res) => {
  try {
    const [sites] = await db.query(`SELECT ${SITE_COLUMNS} FROM disposal_sites ORDER BY name`);
    res.status(200).json({ code: 200, count: sites.length, data: sites.map(toSite) });
  } catch (err) {
    serverError(res, err);
  }
};

exports.getSite = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return bad(res, 'Invalid site id');
    const [rows] = await db.query(`SELECT ${SITE_COLUMNS} FROM disposal_sites WHERE site_id = ?`, [id]);
    if (rows.length === 0) return notFound(res, 'Disposal site not found');
    res.status(200).json({ code: 200, data: toSite(rows[0]) });
  } catch (err) {
    serverError(res, err);
  }
};

exports.updateSite = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return bad(res, 'Invalid site id');
    const error = validateSiteBody(req.body);
    if (error) return bad(res, error);
    const { name, location, max_capacity_tons } = req.body;

    // The "capacity must not drop below the current load" rule lives in the WHERE clause, so it is
    // checked and applied in one statement even if a load update lands at the same moment.
    const [result] = await db.query(
      `UPDATE disposal_sites SET name = ?, location = ?, max_capacity_tons = ?
       WHERE site_id = ? AND current_load_tons <= ?`,
      [name.trim(), location.trim(), max_capacity_tons, id, max_capacity_tons]
    );
    if (result.affectedRows === 0) {
      const [rows] = await db.query('SELECT site_id FROM disposal_sites WHERE site_id = ?', [id]);
      if (rows.length === 0) return notFound(res, 'Disposal site not found');
      return bad(res, 'max_capacity_tons cannot be lower than the current load');
    }
    send(res, 200, 'Disposal site updated');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return conflict(res, 'Disposal site name already in use');
    serverError(res, err);
  }
};

// A site that still holds waste cannot be deleted: the tonnage would silently disappear from the records.
exports.deleteSite = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return bad(res, 'Invalid site id');
    const [result] = await db.query(
      'DELETE FROM disposal_sites WHERE site_id = ? AND current_load_tons = 0', [id]
    );
    if (result.affectedRows === 0) {
      const [rows] = await db.query('SELECT site_id FROM disposal_sites WHERE site_id = ?', [id]);
      if (rows.length === 0) return notFound(res, 'Disposal site not found');
      return conflict(res, 'Cannot delete a site that still holds waste; remove its load first');
    }
    send(res, 200, 'Disposal site deleted');
  } catch (err) {
    serverError(res, err);
  }
};

// Validates ?limit and ?offset; returns { limit, offset } or { error }.
const parsePaging = (query, defaultLimit = 50) => {
  const limit = Number(query.limit === undefined ? defaultLimit : query.limit);
  const offset = Number(query.offset === undefined ? 0 : query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return { error: 'limit must be an integer between 1 and 200' };
  if (!Number.isInteger(offset) || offset < 0) return { error: 'offset must be a non-negative integer' };
  return { limit, offset };
};

// Adds or removes load. The capacity check, the update and the history row share one transaction,
// so a change is never recorded without being applied (or applied without being recorded).
exports.updateLoad = async (req, res) => {
  let conn;
  try {
    const id = parseId(req.params.id);
    if (!id) return bad(res, 'Invalid site id');
    const { tons, action } = req.body || {};
    if (!isTons(tons)) return bad(res, 'tons must be a positive number with at most 2 decimals (max 99999999.99)');
    if (!['add', 'remove'].includes(action)) return bad(res, "action must be 'add' or 'remove'");

    // Conditional UPDATE keeps the capacity check atomic under concurrent requests:
    // InnoDB locks the row, so two requests can never both pass the check against the same load.
    const sql = action === 'add'
      ? 'UPDATE disposal_sites SET current_load_tons = current_load_tons + ? WHERE site_id = ? AND current_load_tons + ? <= max_capacity_tons'
      : 'UPDATE disposal_sites SET current_load_tons = current_load_tons - ? WHERE site_id = ? AND current_load_tons - ? >= 0';

    conn = await db.getConnection();
    await conn.beginTransaction();
    const [result] = await conn.query(sql, [tons, id, tons]);

    if (result.affectedRows === 0) {
      const [rows] = await conn.query('SELECT site_id FROM disposal_sites WHERE site_id = ?', [id]);
      await conn.rollback();
      if (rows.length === 0) return notFound(res, 'Disposal site not found');
      return bad(res, action === 'add' ? 'Load would exceed site capacity' : 'Cannot remove more than the current load');
    }
    const [rows] = await conn.query(`SELECT ${SITE_COLUMNS} FROM disposal_sites WHERE site_id = ?`, [id]);
    await conn.query(
      'INSERT INTO disposal_log (site_id, action, tons, load_after, user_id) VALUES (?, ?, ?, ?, ?)',
      [id, action, tons, rows[0].current_load_tons, req.user && req.user.userId ? req.user.userId : null]
    );
    await conn.commit();
    send(res, 200, 'Load updated', { data: toSite(rows[0]) });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    serverError(res, err);
  } finally {
    if (conn) conn.release();
  }
};

// Load history of one site, newest first (Admin/Supervisor).
exports.getHistory = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return bad(res, 'Invalid site id');
    const paging = parsePaging(req.query);
    if (paging.error) return bad(res, paging.error);

    const [sites] = await db.query('SELECT site_id FROM disposal_sites WHERE site_id = ?', [id]);
    if (sites.length === 0) return notFound(res, 'Disposal site not found');

    const [rows] = await db.query(
      `SELECT log_id, site_id, action, tons, load_after, user_id, created_at
       FROM disposal_log WHERE site_id = ? ORDER BY log_id DESC LIMIT ? OFFSET ?`,
      [id, paging.limit, paging.offset]
    );
    const data = rows.map((r) => ({ ...r, tons: Number(r.tons), load_after: Number(r.load_after) }));
    res.status(200).json({ code: 200, count: data.length, limit: paging.limit, offset: paging.offset, data });
  } catch (err) {
    serverError(res, err);
  }
};
