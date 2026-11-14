const {Client} = require("pg");
const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test"});
async function run() {
  await c.connect();
  const m = await c.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("migrations:", m.rows);
  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("tables:", t.rows.map(r=>r.table_name));
  await c.end();
}
run().catch(e=>{console.error(e); process.exit(1);});