const {Client} = require("pg");
const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test"});
async function run() {
  await c.connect();
  
  const schema = "public";
  const migrationsTable = "pgmigrations";
  const fullTableName = '"' + schema + '"."' + migrationsTable + '"';
  const nameColumn = "name";
  const runOnColumn = "run_on";
  const idColumn = "id";
  
  const query = "SELECT " + nameColumn + " FROM " + fullTableName + " ORDER BY " + runOnColumn + ", " + idColumn;
  console.log("query:", query);
  
  const r = await c.query(query);
  console.log("runNames:", r.rows.map(r=>r.name));
  
  await c.end();
}
run().catch(e=>{console.error(e); process.exit(1);});
