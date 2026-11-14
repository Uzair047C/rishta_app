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

  // Now test the DO block from 0009
  const testSql = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    RAISE NOTICE 'PostGIS available';
  ELSE
    RAISE NOTICE 'PostGIS not available, skipping geo column and spatial indexes';
  END IF;
END $$;
`;

  console.log('=== Running DO block ===');
  await c.query(testSql);
  console.log('DO block executed');

  await c.end();
}
run().catch(e=>{console.error(e); process.exit(1);});