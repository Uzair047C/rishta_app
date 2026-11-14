const { execSync } = require('child_process');
const { resolve } = require('path');
const { Pool } = require('pg');

async function run() {
  const testDbUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test';

  // Reset test database (exact same as resetTestDatabase)
  console.log("=== resetTestDatabase ===");
  const resetPool = new Pool({ connectionString: testDbUrl, max: 5 });
  console.log("Getting all tables...");
  const tables = await resetPool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("Tables before drop:", tables.rows.map(r=>r.table_name));

  for (const table of tables.rows) {
    try {
      await resetPool.query(`DROP TABLE IF EXISTS "${table.table_name}" CASCADE`);
      console.log(`Dropped ${table.table_name}`);
    } catch (err) {
      console.log(`Failed to drop ${table.table_name}:`, err.message);
    }
  }

  try {
    await resetPool.query('DROP TABLE IF EXISTS pgmigrations CASCADE');
  } catch (err) {
    console.log("pgmigrations drop:", err.message);
  }

  console.log("Tables after drop:");
  const t2 = await resetPool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log(t2.rows.map(r=>r.table_name));

  await resetPool.end();
  console.log("Reset pool ended");

  // Small delay
  await new Promise(r => setTimeout(r, 500));

  // Now, simulate the test: create the testPool FIRST (like e2e-setup does at module load)
  console.log("=== Creating testPool (like e2e-setup) ===");
  const testPool = new Pool({ connectionString: testDbUrl, max: 5 });
  console.log("testPool created");

  // Check if tables exist now (they shouldn't)
  const t3 = await testPool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("Tables after testPool created:", t3.rows.map(r=>r.table_name));

  // Close it
  await testPool.end();
  console.log("testPool ended");

  // Small delay
  await new Promise(r => setTimeout(r, 500));

  // Run migrations using CLI
  console.log("=== Running migrations via CLI ===");
  const absoluteDir = resolve(process.cwd(), 'sql/migrations');
  const migrationsTable = 'pgmigrations';
  const cmd = `npx node-pg-migrate up --database-url "${testDbUrl}" --dir "${absoluteDir}" --migrations-dir "${absoluteDir}" --migrations-table "${migrationsTable}" --log=false`;
  console.log("Command:", cmd);
  try {
    const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
    console.log("CLI migrations done");
  } catch (err) {
    console.error("CLI Error:", err.message);
    if (err.stdout) console.log("stdout:", err.stdout);
    if (err.stderr) console.log("stderr:", err.stderr);
    process.exit(1);
  }

  // Check pgmigrations
  const testPool2 = new Pool({ connectionString: testDbUrl, max: 5 });
  const m = await testPool2.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("pgmigrations:", m.rows);

  await testPool2.end();
}
run().catch(e=>{console.error(e); process.exit(1);});