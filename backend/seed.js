// seed.js — applies sql/seed.sql to the database.
// Refuses to run when NODE_ENV=production.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && m[1] && m[2]) process.env[m[1]] = m[2];
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('ERROR: db:seed refuses to run in production (NODE_ENV=production)');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not found — expected it in backend/.env');

  const client = new Client({ connectionString: url });
  await client.connect();

  const seedPath = path.join(__dirname, 'sql', 'seed.sql');
  if (fs.existsSync(seedPath)) {
    const seed = fs.readFileSync(seedPath, 'utf8');
    console.log(`Applying seed.sql (${seed.length} bytes) …`);
    await client.query(seed);
    console.log('seed.sql applied.');
  } else {
    console.log('No seed.sql found, skipping.');
  }

  await client.end();
}

main().catch((err) => {
  console.error('db:seed failed:', err.message);
  process.exit(1);
});