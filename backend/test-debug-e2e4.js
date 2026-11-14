const {Pool} = require("pg");

async function run() {
  // Exact same as the test
  const testDbUrl = process.env.DATABASE_URL_TEST ||
    (process.env.DATABASE_URL?.replace(/\/([^/]+)$/, '/$1_test')) ||
    'postgres://postgres:postgres@localhost:5432/rishta_test';

  console.log("Using URL:", testDbUrl.replace(/:([^:@/]+)@/, ':***@'));

  // Clean slate - drop schema to simulate empty DB FIRST
  const resetPool = new Pool({ connectionString: testDbUrl, max: 5 });
  await resetPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset");
  await resetPool.end();

  // THEN create the pool (like the test does)
  const testPool = new Pool({ connectionString: testDbUrl, max: 5 });

  // Run migrations
  const {runner} = require('node-pg-migrate');
  const { resolve } = require('path');
  const absoluteDir = resolve(process.cwd(), 'sql/migrations');
  const migrationsTable = 'pgmigrations';

  await runner({
    direction: 'up',
    databaseUrl: testDbUrl,
    dir: absoluteDir,
    migrationsTable,
    log: () => {},
    noLock: true,
    singleTransaction: false
  });
  console.log("Migrations done");

  // Now check from testPool
  const m = await testPool.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("pgmigrations from testPool:", m.rows);

  const cityCol = await testPool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'city'");
  console.log("profiles.city from testPool:", cityCol.rows);

  const statusCheck = await testPool.query("SELECT constraint_name, check_clause FROM information_schema.check_constraints JOIN information_schema.table_constraints USING (constraint_name) WHERE table_name = 'subscriptions' AND constraint_name = 'subscriptions_status_check'");
  console.log("subscriptions_status_check from testPool:", statusCheck.rows);

  const reportsIdx = await testPool.query("SELECT indexname FROM pg_indexes WHERE tablename = 'reports' AND indexname = 'reports_open_unique'");
  console.log("reports_open_unique from testPool:", reportsIdx.rows);

  const idempTable = await testPool.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'idempotency_keys'");
  console.log("idempotency_keys table from testPool:", idempTable.rows);

  const idempCols = await testPool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'idempotency_keys' ORDER BY ordinal_position");
  console.log("idempotency_keys columns from testPool:", idempCols.rows.map(r=>r.column_name));

  await testPool.end();
}
run().catch(e=>{console.error(e); process.exit(1);});