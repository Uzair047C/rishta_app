const { execSync } = require('child_process');
const { resolve } = require('path');
const { Pool } = require('pg');

async function run() {
  const testDbUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test';

  // Clean slate - drop schema to simulate empty DB FIRST
  const resetPool = new Pool({ connectionString: testDbUrl, max: 5 });
  await resetPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset");
  await resetPool.end();

  // Run migrations using CLI FIRST
  const absoluteDir = resolve(process.cwd(), 'sql/migrations');
  const migrationsTable = 'pgmigrations';
  const cmd = `npx node-pg-migrate up --database-url "${testDbUrl}" --dir "${absoluteDir}" --migrations-dir "${absoluteDir}" --migrations-table "${migrationsTable}" --log=false`;
  console.log("Running CLI:", cmd);
  try {
    const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
    console.log("CLI output:", output);
  } catch (err) {
    console.error("CLI Error:", err.message);
    if (err.stdout) console.log("stdout:", err.stdout);
    if (err.stderr) console.log("stderr:", err.stderr);
    process.exit(1);
  }

  // THEN create the pool (like the test does)
  const testPool = new Pool({ connectionString: testDbUrl, max: 5 });
  console.log("Pool created after migrations");

  // Check pgmigrations
  const m = await testPool.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("pgmigrations:", m.rows);

  await testPool.end();
}
run().catch(e=>{console.error(e); process.exit(1);});