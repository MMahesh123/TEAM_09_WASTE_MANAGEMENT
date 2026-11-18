// Runs the real-database integration tests (tests/integration) on any OS:
//   npm run test:db
// Needs a reachable MySQL/MariaDB; DB_HOST, DB_USER and DB_PASSWORD come from .env or the shell.
// The tests build and drop their own scratch database (wms_test_louis), never the project database.
require('dotenv').config({ quiet: true });
const { spawnSync } = require('child_process');
const path = require('path');

const jest = require.resolve('jest/bin/jest');
const result = spawnSync(
  process.execPath,
  [jest, '--runInBand', path.join('tests', 'integration'), ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, RUN_DB_TESTS: '1', NODE_ENV: 'test' } }
);
process.exit(result.status === null ? 1 : result.status);
