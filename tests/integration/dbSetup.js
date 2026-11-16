// Real-database test harness. Integration tests only run when RUN_DB_TESTS=1 (see README), so
// `npm test` still passes on machines and CI runners without MySQL.
//
// Required environment: DB_HOST, DB_USER, DB_PASSWORD (same as the app). The tests build their own
// scratch database (DB_NAME defaults to wms_test_louis) and never touch TEAM_09_WASTE_MANAGEMENT.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ENABLED = process.env.RUN_DB_TESTS === '1';
const TEST_DB = process.env.TEST_DB_NAME || 'wms_test_louis';

// Must run before ../src/config/db is first required so the app's pool points at the scratch database.
if (ENABLED) {
  process.env.DB_NAME = TEST_DB;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret';
}

const root = path.join(__dirname, '..', '..');
const sqlFile = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/^\s*USE\s+[^;]+;/gim, '');

// users: the real table from schema.sql. collection_logs: the shared contract from the pending
// placeholder (sql/sprint2_schema.sql); swap in database/modules/collection.sql once it is merged.
const usersTable = () => {
  const m = sqlFile('database/schema.sql').match(/CREATE TABLE IF NOT EXISTS users \([\s\S]*?\n\);/);
  return m[0];
};

async function createSchema() {
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', multipleStatements: true
  });
  await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\`; CREATE DATABASE \`${TEST_DB}\`; USE \`${TEST_DB}\`;`);
  await admin.query(usersTable());
  await admin.query(sqlFile('sql/sprint2_schema.sql'));
  await admin.query(sqlFile('database/modules/disposal.sql'));
  await admin.query(sqlFile('database/modules/payments.sql'));
  await admin.end();
}

async function dropSchema() {
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || ''
  });
  await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await admin.end();
}

module.exports = { ENABLED, createSchema, dropSchema };
