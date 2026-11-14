const {runner} = require('node-pg-migrate');
const { resolve } = require('path');

async function testRunner() {
  const testDbUrl = 'postgres://postgres:postgres@localhost:5432/rishta_test';

  // First run
  console.log("=== FIRST RUN ===");
  await runner({
    direction: 'up',
    databaseUrl: testDbUrl,
    dir: resolve(process.cwd(), 'sql/migrations'),
    migrationsTable: 'pgmigrations',
    log: () => {},
    noLock: true,
    singleTransaction: false
  });
  console.log("First run done");

  // Second run (what the test does)
  console.log("=== SECOND RUN ===");
  await runner({
    direction: 'up',
    databaseUrl: testDbUrl,
    dir: resolve(process.cwd(), 'sql/migrations'),
    migrationsTable: 'pgmigrations',
    log: () => {},
    noLock: true,
    singleTransaction: false
  });
  console.log("Second run done");
}
testRunner().catch(e=>{console.error(e); process.exit(1);});