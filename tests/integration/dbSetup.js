
// Real-database integration test harness.
//
// Integration tests run only when RUN_DB_TESTS=1.
// They use a separate scratch database and never touch the application database.
//
// Required environment:
// DB_HOST, DB_USER, DB_PASSWORD
//
// Optional:
// TEST_DB_NAME (defaults to wms_test_louis)

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

// Load MySQL credentials before opening any database connection.
require('dotenv').config({
  path: path.join(root, '.env')
});

const ENABLED = process.env.RUN_DB_TESTS === '1';
const TEST_DB = process.env.TEST_DB_NAME || 'wms_test_louis';

// Safety: this harness is allowed to use ONLY its dedicated scratch DB.
if (TEST_DB !== 'wms_test_louis') {
  throw new Error(
    `Unsafe integration test database name: ${TEST_DB}. Only wms_test_louis is allowed.`
  );
}

if (ENABLED) {
  const missing = ['DB_HOST', 'DB_USER', 'DB_PASSWORD']
    .filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing MySQL configuration in .env: ${missing.join(', ')}`
    );
  }

  process.env.DB_NAME = TEST_DB;
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'integration-secret';
}

const sqlFile = (relativePath) => {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
    .replace(/^\s*CREATE DATABASE IF NOT EXISTS\s+[^;]+;/gim, '')
    .replace(/^\s*USE\s+[^;]+;/gim, '');
};

async function createSchema() {
  if (!ENABLED) {
    throw new Error('Database integration tests are not enabled');
  }

  const admin = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
  });

  try {
    await admin.query(
      `DROP DATABASE IF EXISTS \`${TEST_DB}\`;
       CREATE DATABASE \`${TEST_DB}\`;
       USE \`${TEST_DB}\`;`
    );

    await admin.query(sqlFile('database/schema.sql'));
    await admin.query(sqlFile('database/modules/assignments.sql'));
    await admin.query(sqlFile('database/modules/collection.sql'));
    await admin.query(sqlFile('database/modules/disposal.sql'));

    await admin.query(
      sqlFile('database/migrations/20261117_create_disposal_logs.sql')
    );

    await admin.query(sqlFile('database/modules/payments.sql'));

    await admin.query(
      sqlFile('database/migrations/20261117_create_audit_logs.sql')
    );

    console.log(`Integration test schema created: ${TEST_DB}`);
  } finally {
    await admin.end();
  }
}

async function dropSchema() {
  if (!ENABLED) return;

  const admin = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });

  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    console.log(`Integration test schema dropped: ${TEST_DB}`);
  } finally {
    await admin.end();
  }
}

module.exports = {
  ENABLED,
  createSchema,
  dropSchema
};
