const {Client} = require("pg");
const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test_test"});
async function run() {
  await c.connect();
  const m = await c.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("migrations:", m.rows);
  await c.end();
}
run().catch(e=>{console.error(e); process.exit(1);});