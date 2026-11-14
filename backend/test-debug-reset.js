const { execSync } = require('child_process');
const { resolve } = require('path');
const { Pool } = require('pg');

async function run() {
  const testDbUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test';

  // Reset test database (exact same as resetTestDatabase)
  console.log("Creating reset pool...");
  const resetPool = new Pool({ connectionString: testDbUrl, max: 5 });
  console.log("Running DROP SCHEMA...");
  await resetPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset done");

  // Verify schema is empty immediately
  const t1 = await resetPool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("Tables immediately after reset:", t1.rows.map(r=>r.table_name));
  await resetPool.end();
  console.log("Reset pool ended");

  // Small delay
  await new Promise(r => setTimeout(r, 1000));

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
}
run().catch(e=>{console.error(e); process.exit(1);});