const { execSync } = require('child_process');
const { resolve } = require('path');
const { Pool } = require('pg');

async function run() {
  const testDbUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test';

  // Try dropping all tables directly instead of dropping schema
  console.log("Creating pool...");
  const pool = new Pool({ connectionString: testDbUrl, max: 5 });

  console.log("Getting all tables...");
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("Tables:", tables.rows.map(r=>r.table_name));

  console.log("Dropping all tables...");
  for (const table of tables.rows) {
    try {
      await pool.query(`DROP TABLE IF EXISTS "${table.table_name}" CASCADE`);
      console.log(`Dropped ${table.table_name}`);
    } catch (err) {
      console.log(`Failed to drop ${table.table_name}:`, err.message);
    }
  }

  // Also drop pgmigrations if it exists
  try {
    await pool.query('DROP TABLE IF EXISTS pgmigrations CASCADE');
  } catch (err) {
    console.log("pgmigrations drop:", err.message);
  }

  console.log("Tables after drop:");
  const t2 = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log(t2.rows.map(r=>r.table_name));

  await pool.end();

  // Now run migrations using CLI
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