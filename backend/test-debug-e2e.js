const {Client} = require("pg");

async function run() {
  const databaseUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test';
  const c = new Client({connectionString: databaseUrl});
  await c.connect();

  // Simulate what the test does
  const testPool = new (require('pg').Pool)({ connectionString: databaseUrl, max: 5 });

  // resetTestDatabase equivalent
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset");

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

  // Check pgmigrations
  const m = await c.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("pgmigrations:", m.rows);

  // Check tables
  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("tables:", t.rows.map(r=>r.table_name));

  await c.end();
  await testPool.end();
}
run().catch(e=>{console.error(e); process.exit(1);});