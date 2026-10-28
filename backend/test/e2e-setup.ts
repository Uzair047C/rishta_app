import { Pool } from 'pg';

// Global test setup for e2e tests
// This runs once before all e2e tests

// Use a test database - either from DATABASE_URL_TEST or a suffix on DATABASE_URL
const testDbUrl = process.env.DATABASE_URL_TEST ||
  (process.env.DATABASE_URL?.replace(/\/([^/]+)$/, '/$1_test'));

// Global pool for test database
export const testPool = new Pool({
  connectionString: testDbUrl,
  max: 5,
});

// Clean up after all tests
afterAll(async () => {
  await testPool.end();
});

// Helper to run queries in tests
export async function query(sql: string, params?: unknown[]) {
  return testPool.query(sql, params);
}

// Helper to truncate all tables (for test isolation)
export async function truncateAll() {
  const tables = [
    'refresh_tokens', 'webhook_events', 'moderation_flags', 'reports',
    'verification_events', 'subscriptions', 'messages', 'matches',
    'blocks', 'passes', 'likes', 'user_languages', 'user_interests',
    'profile_photos', 'profiles', 'device_tokens', 'notification_preferences',
    'users', 'interests', 'languages'
  ];
  for (const table of tables) {
    try {
      await testPool.query(`TRUNCATE TABLE ${table} CASCADE`);
    } catch (err) {
      // Table might not exist, ignore
    }
  }
}