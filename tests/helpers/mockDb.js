// A fake mysql2 pool: pool.query for plain queries, pool.getConnection() for transactions.
// `conn` is the single transaction connection handed out, so tests can inspect every call.
const makeDb = () => {
  const conn = {
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn()
  };
  return { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(conn), conn };
};
const resetDb = (db) => {
  db.query.mockReset();
  db.getConnection.mockClear();
  Object.values(db.conn).forEach((fn) => fn.mockClear());
  db.conn.query.mockReset();
};
module.exports = { makeDb, resetDb };
