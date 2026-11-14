const {Client} = require("pg");
const {Pool} = require("pg");

async function run() {
  const databaseUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test';

  // Simulate the testPool created at module load
  const testPool = new Pool({ connectionString: databaseUrl, max: 5 });

  // resetTestDatabase equivalent
  const resetPool = new Pool({ connectionString: databaseUrl, max: 5 });
  await resetPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset");
  await resetPool.end();

  // Run migrations
  const {runner} = require('node-pg-migrate');
  const { resolve } = require('path');
  const absoluteDir = resolve(process.cwd(), 'sql/migrations');
  const migrationsTable = 'pgmigrations';

  await runner({
    direction: 'up',
    databaseUrl,
    dir: absoluteDir,
    migrationsTable,
    log: () => {},
    noLock: true,
    singleTransaction: false
  });
  console.log("Migrations done");

  // Now use testPool (like the test does)
  // Check pgmigrations
  const m = await testPool.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("pgmigrations:", m.rows);

  // Check specific tables
  const cityCol = await testPool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'city'");
  console.log("profiles.city:", cityCol.rows);

  const statusCheck = await testPool.query("SELECT check_clause FROM information_schema.check_constraints JOIN information_schema.table_constraints USING (constraint_name) WHERE table_name = 'subscriptions' AND constraint_name = 'subscriptions_status_check'");
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