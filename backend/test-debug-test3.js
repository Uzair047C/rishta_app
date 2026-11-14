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

  // Run migrations using CLI FIRST
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

  // Check pgmigrations after first run
  const testPool1 = new Pool({ connectionString: testDbUrl, max: 5 });
  const m1 = await testPool1.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("pgmigrations after first run:", m1.rows);
  await testPool1.end();

  // NOW try running the SAME CLI command again (simulating what happens if runner is called twice)
  console.log("Running SAME CLI command again...");
  try {
    const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
    console.log("Second CLI run output:", output);
  } catch (err) {
    console.error("Second CLI run Error:", err.message);
    if (err.stdout) console.log("stdout:", err.stdout);
    if (err.stderr) console.log("stderr:", err.stderr);
  }

  const testPool2 = new Pool({ connectionString: testDbUrl, max: 5 });
  const m2 = await testPool2.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("pgmigrations after second run:", m2.rows);
  await testPool2.end();
}
run().catch(e=>{console.error(e); process.exit(1);});