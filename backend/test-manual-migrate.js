const {Client} = require("pg");
const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test"});
async function run() {
  await c.connect();

  // Try to run migration 0001_init manually
  await c.query('BEGIN');
  await c.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await c.query(`CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text,
    phone text,
    phone_verified boolean NOT NULL DEFAULT false,
    gender text CHECK (gender IN ('male', 'female', 'other')),
    dob date,
    location text,
    lat double precision,
    lng double precision,
    device_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((gender IS NULL) = (dob IS NULL))
  )`);
  await c.query('COMMIT');
  console.log('0001_init applied manually');

  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("tables:", t.rows.map(r=>r.table_name));

  // Now try migration 0002
  await c.query('BEGIN');
  await c.query(`ALTER TABLE users ADD COLUMN firebase_uid text UNIQUE`);
  await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_lower ON users (lower(email)) WHERE email IS NOT NULL`);
  await c.query('COMMIT');
  console.log('0002 applied manually');

  const t2 = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("tables:", t2.rows.map(r=>r.table_name));

  await c.end();
}
run().catch(e=>{console.error(e.code, e.message.split('\n')[0]); process.exit(1);});