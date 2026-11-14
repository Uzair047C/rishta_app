const {Client} = require("pg");
const { execSync } = require('child_process');
const { resolve } = require('path');

async function run() {
  // Reset first
  const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test_test"});
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset for rishta_test_test");

  // Check tables immediately after
  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("Tables after reset:", t.rows.map(r=>r.table_name));
  await c.end();

  // Wait a moment for the DB to fully process
  await new Promise(r => setTimeout(r, 500));

  // Now run the runner
  const absoluteDir = resolve(process.cwd(), 'sql/migrations');
  const databaseUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test_test';
  const migrationsTable = 'pgmigrations';

  // Use node-pg-migrate API directly
  const {runner} = require('node-pg-migrate');
  await runner({
    direction: 'up',
    databaseUrl,
    dir: absoluteDir,
    migrationsDir: absoluteDir,
    migrationsTable,
    log: console.log,
    noLock: true,
    singleTransaction: false
  });
  console.log("SUCCESS");

  // Check tables after
  const c2 = new Client({connectionString: databaseUrl});
  await c2.connect();
  const t2 = await c2.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("Tables after migrations:", t2.rows.map(r=>r.table_name));
  const m = await c2.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("Migrations:", m.rows);
  await c2.end();
}
run().catch(e=>{console.error(e); process.exit(1);});