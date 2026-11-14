const {Client} = require("pg");
const { execSync } = require('child_process');
const { resolve } = require('path');

async function run() {
  // Reset first
  const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test_test"});
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset for rishta_test_test");

  // Check tables immediately after
  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("Tables after reset:", t.rows.map(r=>r.table_name));
  await c.end();

  // Now run the runner
  const absoluteDir = resolve(process.cwd(), 'sql/migrations');
  const databaseUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test_test';
  const migrationsTable = 'pgmigrations';

  const cmd = `npx node-pg-migrate up --database-url "${databaseUrl}" --dir "${absoluteDir}" --migrations-dir "${absoluteDir}" --migrations-table "${migrationsTable}" --log=false`;
  console.log("Running:", cmd);
  try {
    const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
    console.log("SUCCESS");
  } catch (err) {
    console.error("Error:", err.message);
    if (err.stdout) console.log("stdout:", err.stdout);
    if (err.stderr) console.log("stderr:", err.stderr);
    process.exit(1);
  }
}
run().catch(e=>{console.error(e); process.exit(1);});