import { query, truncateAll } from './e2e-setup';

describe('Database migrations (e2e)', () => {
  beforeAll(async () => {
    // Ensure we have a clean test database
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
  });

  it('should have applied all migrations including 0009', async () => {
    const { rows } = await query(`
      SELECT version FROM migrations ORDER BY version
    `);
    const versions = rows.map(r => r.version);
    // Should have at least 11 migrations (0001 through 0011)
    expect(versions.length).toBeGreaterThanOrEqual(11);
    expect(versions).toContain('0009');
  });

  it('should have users table with geo column and index', async () => {
    const { rows } = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'geo'
    `);
    expect(rows.length).toBe(1);
    expect(rows[0].data_type).toBe('USER-DEFINED'); // geography type

    // Check GiST index exists
    const { rows: indexes } = await query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'users' AND indexname = 'users_geo_idx'
    `);
    expect(indexes.length).toBe(1);
  });

  it('should have matches table with unmatched_by column', async () => {
    const { rows } = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'matches' AND column_name = 'unmatched_by'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have subscriptions with CHECK constraint on likes_remaining_today', async () => {
    const { rows } = await query(`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'subscriptions'
      AND constraint_name = 'subscriptions_likes_remaining_today_nonneg'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have likes index on (to_user_id, created_at DESC)', async () => {
    const { rows } = await query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'likes' AND indexname = 'likes_to_user_created_idx'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have refresh_tokens with family_id and proper indexes', async () => {
    const { rows } = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'refresh_tokens' AND column_name = 'family_id'
    `);
    expect(rows.length).toBe(1);

    const { rows: indexes } = await query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'refresh_tokens'
      AND indexname IN ('refresh_tokens_token_hash_key', 'refresh_tokens_user_active_idx', 'refresh_tokens_family_idx')
    `);
    expect(indexes.length).toBe(3);
  });

  it('should have webhook_events table', async () => {
    const { rows } = await query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'webhook_events'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have messages table (retained for account export)', async () => {
    const { rows } = await query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'messages'
    `);
    expect(rows.length).toBe(1);
  });

  it('should have trigger on users for geo update', async () => {
    const { rows } = await query(`
      SELECT trigger_name FROM information_schema.triggers
      WHERE event_object_table = 'users' AND trigger_name = 'users_geo_update'
    `);
    expect(rows.length).toBe(1);
  });
});