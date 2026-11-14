const {Client} = require("pg");
const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test_test"});
async function run() {
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset");

  // Now use node-pg-migrate programmatically
  const {runner} = require('node-pg-migrate');
  await runner({
    direction: 'up',
    databaseUrl: 'postgres://postgres:postgres@localhost:5432/rishta_test_test',
    dir: 'sql/migrations',
    migrationsDir: 'sql/migrations',
    migrationsTable: 'pgmigrations',
    log: console.log,
    noLock: true,
    singleTransaction: false
  });
  console.log('Migrations completed');

  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("tables:", t.rows.map(r=>r.table_name));

  await c.end();
}
run().catch(e=>{console.error(e); process.exit(1);});