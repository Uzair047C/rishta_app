const {Client} = require("pg");
const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test_test"});
async function run() {
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("Schema reset for rishta_test_test");
  await c.end();
}
run().catch(e=>{console.error(e); process.exit(1);});