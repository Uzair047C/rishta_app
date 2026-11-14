const {Client} = require("pg");
const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test"});
async function run() {
  await c.connect();

  // Check what tables exist
  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("tables:", t.rows.map(r=>r.table_name));

  await c.end();
}
run().catch(e=>{console.error(e); process.exit(1);});