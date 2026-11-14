const {Client} = require("pg");
const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test"});
async function run() {
  await c.connect();

  // First run migrations up to 0008
  const {runner} = require('node-pg-migrate');
  await runner({
    direction: 'up',
    databaseUrl: 'postgres://postgres:postgres@localhost:5432/rishta_test',
    dir: 'sql/migrations',
    migrationsDir: 'sql/migrations',
    migrationsTable: 'pgmigrations',
    log: console.log,
    noLock: true,
    singleTransaction: false,
    file: '0008_add_feed_indexes'
  });

  console.log('Up to 0008 done');

  // Now run 0009 manually
  const sql = require('fs').readFileSync('sql/migrations/0009_add_integrity_and_indexes.sql', 'utf8');
  console.log('=== Running 0009 manually ===');

  await c.query(sql);
  console.log('0009 applied manually');

  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("tables:", t.rows.map(r=>r.table_name));

  await c.end();
}
run().catch(e=>{console.error(e); process.exit(1);});