// db-init.js — applies sql/*.sql to the database named in DATABASE_URL.
//
// Replaces the old `psql "$DATABASE_URL"` script: that required the PostgreSQL
// client tools on PATH AND $DATABASE_URL to be expanded by the shell. On Windows
// npm runs scripts through cmd, which expands neither. This uses the already-
// installed `pg` dependency instead, so no client tools and no shell quoting.
const fs = require('fs');
const path = require('path');

// Load .env manually. dotenv exists only as a transitive dep of @nestjs/config,
// so a 5-line parser keeps this script self-contained instead of depending on a
// package that is not in our own package.json.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && m[1] && m[2]) process.env[m[1]] = m[2];
  }
}

const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not found — expected it in backend/.env');

  const client = new Client({ connectionString: url });
  await client.connect();
  const base = __dirname;
  const schema = fs.readFileSync(path.join(base, 'sql', 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(base, 'sql', 'seed.sql'), 'utf8');

  console.log(`Connected. Applying schema.sql (${schema.length} bytes) …`);
  await client.query(schema);
  console.log('schema.sql applied.');

  console.log(`Applying seed.sql (${seed.length} bytes) …`);
  await client.query(seed);
  console.log('seed.sql applied. Done.');

  await client.end();
}

main().catch((err) => {
  const detail = err && err.message;
  console.error('db:init failed:', detail);
  if (typeof detail === 'string' && /does not exist/i.test(detail) && /database/i.test(detail)) {
    console.error('Hint: the target database does not exist yet. Create it first, e.g.:');
    console.error('  "C:/Program Files/PostgreSQL/17/bin/createdb" -U postgres rishta');
  }
  process.exit(1);
});