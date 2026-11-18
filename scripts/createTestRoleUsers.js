require('dotenv').config();

const readline = require('readline');
const bcrypt = require('bcrypt');
const db = require('../src/config/db');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function createTestUser(username, email, role) {
  const [existing] = await db.query(
    'SELECT user_id, username, role FROM users WHERE email = ?',
    [email]
  );

  if (existing.length > 0) {
    if (existing[0].role === role) {
      console.log(`${role} test account already exists. Skipping.`);
      return;
    }

    throw new Error(
      `Email ${email} already belongs to another role. No changes made.`
    );
  }

  const password = await ask(`Enter temporary password for ${role}: `);

  if (password.length < 8) {
    throw new Error('Password must contain at least 8 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES (?, ?, ?, ?)`,
    [username, email, passwordHash, role]
  );

  console.log(`${role} test account created successfully.`);
}

async function main() {
  try {
    await createTestUser(
      'WMS Supervisor Test',
      'wms-supervisor-test@example.com',
      'Supervisor'
    );

    await createTestUser(
      'WMS Worker Test',
      'wms-worker-test@example.com',
      'Worker'
    );

    console.log('\nTest account setup completed.');
  } catch (error) {
    console.error('\nSetup failed:', error.message);
  } finally {
    rl.close();
    await db.end();
  }
}

main();
