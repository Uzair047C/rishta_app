const { execSync } = require('child_process');
const { resolve } = require('path');

const absoluteDir = resolve(process.cwd(), 'sql/migrations');
const databaseUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test_test';
const migrationsTable = 'pgmigrations';

const cmd = `npx node-pg-migrate up --database-url "${databaseUrl}" --dir "${absoluteDir}" --migrations-dir "${absoluteDir}" --migrations-table "${migrationsTable}" --log=false`;
console.log("Running:", cmd);
try {
  const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
  console.log("Output:", output);
} catch (err) {
  console.error("Error:", err.message);
  if (err.stdout) console.log("stdout:", err.stdout);
  if (err.stderr) console.log("stderr:", err.stderr);
}