const {Client} = require("pg");
const c = new Client({connectionString: "postgres://postgres:postgres@localhost:5432/rishta_test"});
async function run() {
  await c.connect();

  // First run migrations up to 0008
  const {runner} = require('node-pg-migrate');
  await runner({
    direction: 'up',
    databaseUrl: 'postgres://postgres:postgres@localhost:5432/rishta_test',
    dir: 'sql/migrations',
    migrationsDir: 'sql/migrations',
    migrationsTable: 'pgmigrations',
    log: console.log,
    noLock: true,
    singleTransaction: false,
    file: '0008_add_feed_indexes'
  });

  console.log('Up to 0008 done');

  // Now test the full DO block from 0009
  const testSql = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    CREATE EXTENSION IF NOT EXISTS postgis;

    -- Add geo column if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'geo'
    ) THEN
      ALTER TABLE users ADD COLUMN geo geography(Point, 4326);
    END IF;

    -- Create trigger function to populate geo from lat/lng
    CREATE OR REPLACE FUNCTION update_user_geo() RETURNS trigger AS $$
    BEGIN
      IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geo := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
      ELSE
        NEW.geo := NULL;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Drop existing trigger if any, then create new one
    DROP TRIGGER IF EXISTS users_geo_update ON users;
    CREATE TRIGGER users_geo_update
      BEFORE INSERT OR UPDATE OF lat, lng ON users
      FOR EACH ROW EXECUTE FUNCTION update_user_geo();

    -- Backfill existing rows
    UPDATE users
    SET geo = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    WHERE lat IS NOT NULL AND lng IS NOT NULL AND geo IS NULL;

    -- GiST index on geo for spatial queries
    CREATE INDEX IF NOT EXISTS users_geo_idx ON users USING GIST (geo);
  ELSE
    RAISE NOTICE 'PostGIS not available, skipping geo column and spatial indexes';
  END IF;
END $$;
`;

  console.log('=== Running full DO block ===');
  await c.query(testSql);
  console.log('Full DO block executed');

  await c.end();
}
run().catch(e=>{console.error(e); process.exit(1);});