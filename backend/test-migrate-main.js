const {Client} = require("pg");
const {runner} = require('node-pg-migrate');
const { resolve } = require('path');

async function run() {
  const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test"});
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset for rishta_test");
  await c.end();

  const absoluteDir = resolve(process.cwd(), 'sql/migrations');
  const databaseUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test';
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
  const t2 = await c2.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("Tables after migrations:", t2.rows.map(r=>r.table_name));
  const m = await c2.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("Migrations:", m.rows);
  await c2.end();
}
run().catch(e=>{console.error(e); process.exit(1);});