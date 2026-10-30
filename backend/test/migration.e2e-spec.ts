import { Pool } from 'pg';
import { query, truncateAll } from './e2e-setup';

// node-pg-migrate is CommonJS, use require
const migrate = require('node-pg-migrate').default;

describe('Database migrations (e2e)', () => {
  let testPool: Pool;

  beforeAll(async () => {
    // Create a fresh test database connection
    const testDbUrl = process.env.DATABASE_URL_TEST ||
      (process.env.DATABASE_URL?.replace(/\/([^/]+)$/, '/$1_test'));
    testPool = new Pool({ connectionString: testDbUrl, max: 5 });

    // Clean slate - drop all tables to simulate empty DB
    await truncateAll();

    // Also drop migration tracking table to force re-run
    try {
      await testPool.query(`DROP TABLE IF EXISTS pgmigrations CASCADE`);
    } catch (err) {
      // Ignore
    }
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('should apply all migrations from empty database', async () => {
    // Run migrations using node-pg-migrate programmatically
    await migrate({
      direction: 'up',
      databaseUrl: process.env.DATABASE_URL_TEST ||
        (process.env.DATABASE_URL?.replace(/\/([^/]+)$/, '/$1_test')),
      migrationsDir: 'sql/migrations',
      migrationsTable: 'pgmigrations',
      driver: 'pg',
      log: () => {}, // silence logs
    });

    // Check that all 14 migrations were applied
    const { rows } = await testPool.query(`
      SELECT name FROM pgmigrations ORDER BY name
    `);
    const versions = rows.map(r => r.name);
    expect(versions.length).toBe(14);
    expect(versions).toEqual([
      '0001_init',
      '0002_add_firebase_uid_and_email_index',
      '0003_add_user_status',
      '0004_add_admin_and_review_columns',
      '0005_add_admin_audit_log',
      '0006_add_webhook_events',
      '0007_add_profile_photos',
      '0008_add_feed_indexes',
      '0009_add_integrity_and_indexes',
      '0010_add_auth_columns',
      '0011_refresh_tokens',
      '0012_add_outbox',
      '0013_add_seeking_column',
      '0014_fixes',
    ]);
  });

  it('should have users table with geo column and index', async () => {
    const { rows } = await testPool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'geo'
    `);
    expect(rows.length).toBe(1);
    expect(rows[0].data_type).toBe('USER-DEFINED'); // geography type

    // Check GiST index exists
    const { rows: indexes } = await testPool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'users' AND indexname = 'users_geo_idx'
    `);
    expect(indexes.length).toBe(1);
  });

  it('should have matches table with unmatched_by column', async () => {
    const { rows } = await testPool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'matches' AND column_name = 'unmatched_by'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have subscriptions with CHECK constraint on likes_remaining_today', async () => {
    const { rows } = await testPool.query(`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'subscriptions'
      AND constraint_name = 'subscriptions_likes_remaining_today_nonneg'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have likes index on (to_user_id, created_at DESC)', async () => {
    const { rows } = await testPool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'likes' AND indexname = 'likes_to_user_created_idx'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have refresh_tokens with family_id and proper indexes', async () => {
    const { rows } = await testPool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'refresh_tokens' AND column_name = 'family_id'
    `);
    expect(rows.length).toBe(1);

    const { rows: indexes } = await testPool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'refresh_tokens'
      AND indexname IN ('refresh_tokens_token_hash_key', 'refresh_tokens_user_active_idx', 'refresh_tokens_family_idx')
    `);
    expect(indexes.length).toBe(3);
  });

  it('should have webhook_events table', async () => {
    const { rows } = await testPool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'webhook_events'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have messages table (retained for account export)', async () => {
    const { rows } = await testPool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'messages'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have trigger on users for geo update', async () => {
    const { rows } = await testPool.query(`
      SELECT trigger_name FROM information_schema.triggers
      WHERE event_object_table = 'users' AND trigger_name = 'users_geo_update'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have outbox table with next_attempt_at and dead_at', async () => {
    const { rows } = await testPool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'outbox' AND column_name IN ('next_attempt_at', 'dead_at')
    `);
    expect(rows.length).toBe(2);

    // Check index on next_attempt_at
    const { rows: indexes } = await testPool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'outbox' AND indexname = 'outbox_pending_idx'
    `);
    expect(indexes.length).toBe(1);
  });

  // 0014_fixes tests
  it('should have profiles.city column', async () => {
    const { rows } = await testPool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'profiles' AND column_name = 'city'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have subscriptions status CHECK with paused', async () => {
    const { rows } = await testPool.query(`
      SELECT constraint_name, check_clause FROM information_schema.check_constraints
      JOIN information_schema.table_constraints USING (constraint_name)
      WHERE table_name = 'subscriptions' AND constraint_name = 'subscriptions_status_check'
    `);
    expect(rows.length).toBe(1);
    expect(rows[0].check_clause).toContain('paused');
  });

  it('should have reports partial unique index', async () => {
    const { rows } = await testPool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'reports' AND indexname = 'reports_open_unique'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have idempotency_keys table with correct schema', async () => {
    const { rows } = await testPool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'idempotency_keys' AND column_name IN ('user_id', 'key', 'route', 'response', 'created_at')
    `);
    expect(rows.length).toBe(5);

    const { rows: pk } = await testPool.query(`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'idempotency_keys' AND constraint_type = 'PRIMARY KEY'
    `);
    expect(pk.length).toBe(1);
  });
});