const { execSync } = require('child_process');
const { resolve } = require('path');
const { Pool } = require('pg');

async function run() {
  const testDbUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test';

  // Clean slate - drop schema to simulate empty DB FIRST
  console.log("Creating reset pool...");
  const resetPool = new Pool({ connectionString: testDbUrl, max: 5 });
  console.log("Running DROP SCHEMA...");
  await resetPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset done");
  await resetPool.end();
  console.log("Reset pool ended");

  // THEN create the pool (like the test does)
  console.log("Creating testPool...");
  const testPool = new Pool({ connectionString: testDbUrl, max: 5 });
  console.log("testPool created");

  // Run migrations using CLI (like beforeAll does)
  console.log("Running migrations via CLI...");
  const absoluteDir = resolve(process.cwd(), 'sql/migrations');
  const migrationsTable = 'pgmigrations';
  const cmd = `npx node-pg-migrate up --database-url "${testDbUrl}" --dir "${absoluteDir}" --migrations-dir "${absoluteDir}" --migrations-table "${migrationsTable}" --log=false`;
  try {
    const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
    console.log("CLI migrations done");
  } catch (err) {
    console.error("CLI Error:", err.message);
    if (err.stdout) console.log("stdout:", err.stdout);
    if (err.stderr) console.log("stderr:", err.stderr);
    process.exit(1);
  }

  // Check pgmigrations
  const m = await testPool.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("pgmigrations:", m.rows);

  // Check tables
  const t = await testPool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("tables:", t.rows.map(r=>r.table_name));

  // Check specific things from 0014
  const cityCol = await testPool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'city'");
  console.log("profiles.city:", cityCol.rows);

  const statusCheck = await testPool.query("SELECT constraint_name, check_clause FROM information_schema.check_constraints JOIN information_schema.table_constraints USING (constraint_name) WHERE table_name = 'subscriptions' AND constraint_name = 'subscriptions_status_check'");
  console.log("subscriptions_status_check:", statusCheck.rows);

  const reportsIdx = await testPool.query("SELECT indexname FROM pg_indexes WHERE tablename = 'reports' AND indexname = 'reports_open_unique'");
  console.log("reports_open_unique:", reportsIdx.rows);

  const idempTable = await testPool.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'idempotency_keys'");
  console.log("idempotency_keys table:", idempTable.rows);

  const idempCols = await testPool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'idempotency_keys' ORDER BY ordinal_position");
  console.log("idempotency_keys columns:", idempCols.rows.map(r=>r.column_name));

  await testPool.end();
}
run().catch(e=>{console.error(e); process.exit(1);});