const {Client} = require("pg");
const {runner} = require('node-pg-migrate');
const { resolve } = require('path');

async function run() {
  const databaseUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test';
  const c = new Client({connectionString: databaseUrl});
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset for rishta_test");
  await c.end();

  const absoluteDir = resolve(process.cwd(), 'sql/migrations');
  const migrationsTable = 'pgmigrations';

  await runner({
    direction: 'up',
    databaseUrl,
    dir: absoluteDir,
    migrationsTable,
    log: console.log,
    noLock: true,
    singleTransaction: false
  });
  console.log("SUCCESS");

  const c2 = new Client({connectionString: databaseUrl});
  await c2.connect();

  // Check specific things from 0014
  const cityCol = await c2.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'city'");
  console.log("profiles.city:", cityCol.rows);

  const statusCheck = await c2.query("SELECT check_clause FROM information_schema.check_constraints JOIN information_schema.table_constraints USING (constraint_name) WHERE table_name = 'subscriptions' AND constraint_name = 'subscriptions_status_check'");
  console.log("subscriptions_status_check:", statusCheck.rows);

  const reportsIdx = await c2.query("SELECT indexname FROM pg_indexes WHERE tablename = 'reports' AND indexname = 'reports_open_unique'");
  console.log("reports_open_unique:", reportsIdx.rows);

  const idempTable = await c2.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'idempotency_keys'");
  console.log("idempotency_keys table:", idempTable.rows);

  const idempCols = await c2.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'idempotency_keys' ORDER BY ordinal_position");
  console.log("idempotency_keys columns:", idempCols.rows.map(r=>r.column_name));

  await c2.end();
}
run().catch(e=>{console.error(e); process.exit(1);});