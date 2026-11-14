const {Client} = require("pg");
const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test"});
async function run() {
  await c.connect();

  // Check 0014 columns vs 0011/0012
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'outbox' ORDER BY ordinal_position");
  console.log("outbox columns:", cols.rows.map(r=>r.column_name));

  const rt = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'refresh_tokens' ORDER BY ordinal_position");
  console.log("refresh_tokens columns:", rt.rows.map(r=>r.column_name));

  await c.end();
}
run().catch(e=>{console.error(e); process.exit(1);});