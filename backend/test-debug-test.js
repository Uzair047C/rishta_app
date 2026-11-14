const { execSync } = require('child_process');
const { resolve } = require('path');
const { Pool } = require('pg');

async function run() {
  const testDbUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test';

  // Clean slate - drop schema to simulate empty DB FIRST
  console.log("Creating reset pool...");
  const resetPool = new Pool({ connectionString: testDbUrl, max: 5 });
  console.log("Running DROP SCHEMA...");
  await resetPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset done");
  await resetPool.end();
  console.log("Reset pool ended");

  // Run migrations using CLI
  console.log("Running migrations via CLI...");
  const absoluteDir = resolve(process.cwd(), 'sql/migrations');
  const migrationsTable = 'pgmigrations';
  const cmd = `npx node-pg-migrate up --database-url "${testDbUrl}" --dir "${absoluteDir}" --migrations-dir "${absoluteDir}" --migrations-table "${migrationsTable}" --log=false`;
  try {
    const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
    console.log("CLI migrations done");
  } catch (err) {
    console.error("CLI Error:", err.message);
    if (err.stdout) console.log("stdout:", err.stdout);
    if (err.stderr) console.log("stderr:", err.stderr);
    process.exit(1);
  }

  // THEN create the pool (like the test does)
  console.log("Creating testPool...");
  const testPool = new Pool({ connectionString: testDbUrl, max: 5 });
  console.log("testPool created");

  // Check pgmigrations
  const m = await testPool.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("pgmigrations:", m.rows);

  // Now try running migrations AGAIN (like the test does in the it() block)
  console.log("Running migrations via runner function...");
  const {runner: migrateRunner} = await import('node-pg-migrate');
  try {
    await migrateRunner({
      direction: 'up',
      databaseUrl: testDbUrl,
      dir: absoluteDir,
      migrationsTable,
      log: () => {},
      noLock: true,
      singleTransaction: false
    });
    console.log("Second migration run done");
  } catch (err) {
    console.error("Second run error:", err.message);
  }

  const m2 = await testPool.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("pgmigrations after second run:", m2.rows);

  await testPool.end();
}
run().catch(e=>{console.error(e); process.exit(1);});