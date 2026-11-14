const {Client} = require("pg");
const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test"});
async function run() {
  await c.connect();
  const m = await c.query("SELECT * FROM pgmigrations ORDER BY id");
  console.log("migrations:", m.rows);

  const t = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions' ORDER BY ordinal_position");
  console.log("subscriptions columns:", t.rows.map(r=>r.column_name));

  const t2 = await c.query("SELECT indexname FROM pg_indexes WHERE tablename = 'reports'");
  console.log("reports indexes:", t2.rows.map(r=>r.indexname));

  const t3 = await c.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'idempotency_keys'");
  console.log("idempotency_keys table:", t3.rows);

  await c.end();
}
run().catch(e=>{console.error(e); process.exit(1);});