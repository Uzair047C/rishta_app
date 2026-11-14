const {Client} = require("pg");
const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test"});
async function run() {
  await c.connect();

  // Set search_path like the runner does
  await c.query('SET search_path TO "public"');

  // Run the actual runner
  const {runner} = require('node-pg-migrate');
  await runner({
    direction: 'up',
    databaseUrl: 'postgres://postgres:postgres@localhost:5432/rishta_test',
    dir: 'sql/migrations',
    migrationsDir: 'sql/migrations',
    migrationsTable: 'pgmigrations',
    log: console.log,
    noLock: true,
    singleTransaction: false
  });

  console.log('Runner completed successfully');
  await c.end();
}
run().catch(e=>{console.error(e); process.exit(1);});