import { Pool } from 'pg';

// Global test setup for e2e tests
// This runs once before all e2e tests

// Set required env vars for config validation before importing AppModule
// Use rishta_test for main e2e tests; repo-allowlist tests use rishta_test_test
const testDbBase = 'postgres://postgres:postgres@localhost:5432/rishta';
process.env.DATABASE_URL = testDbBase;
process.env.DATABASE_URL_TEST = testDbBase + '_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret';
process.env.JWT_ISSUER = 'rishta-api';
process.env.JWT_AUDIENCE = 'rishta-app';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk@test-project.iam.gserviceaccount.com';
// Use a simple test private key with literal \n escape sequences
// The auth.service.ts will replace \\n with actual newlines
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDc7wLZ3zZ3zZ3z\\nZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3z\\nAgMBAAECggEBAK4BQ1A7wLZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3zZ3\\n-----END PRIVATE KEY-----';
process.env.STREAM_API_KEY = 'test-key';
process.env.STREAM_API_SECRET = 'test-secret';
process.env.REVENUECAT_WEBHOOK_SECRET = 'test-secret';
process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = ''; // Disable Redis for tests - factory returns null

// Use a test database
const testDbUrl = process.env.DATABASE_URL_TEST ||
  (process.env.DATABASE_URL?.replace(/\/([^/]+)$/, '/$1_test')) ||
  'postgres://postgres:postgres@localhost:5432/rishta_test';

// Global pool for test database - LAZY creation to avoid stale connections after schema reset
let _testPool: Pool | null = null;
function getTestPool(): Pool {
  if (!_testPool) {
    _testPool = new Pool({ connectionString: testDbUrl, max: 5 });
  }
  return _testPool;
}

// Clean up after all tests
afterAll(async () => {
  if (_testPool) {
    await _testPool.end();
    _testPool = null;
  }
});

// Helper to run queries in tests
export async function query(sql: string, params?: unknown[]) {
  return getTestPool().query(sql, params);
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
  const pool = getTestPool();
  for (const table of tables) {
    try {
      await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
    } catch (err) {
      // Table might not exist, ignore
    }
  }
}

// Helper to completely reset a test database (drop schema, recreate, run migrations)
export async function resetTestDatabase(dbUrl: string) {
  // First, close the global test pool if it exists (it might have stale connections)
  if (_testPool) {
    await _testPool.end();
    _testPool = null;
  }

  const resetPool = new Pool({ connectionString: dbUrl, max: 5 });
  try {
    // Drop all tables explicitly (more reliable than DROP SCHEMA)
    const tables = await resetPool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    );
    for (const table of tables.rows) {
      try {
        await resetPool.query(`DROP TABLE IF EXISTS "${table.table_name}" CASCADE`);
      } catch (err) {
        // Ignore
      }
    }
    // Also drop pgmigrations if it exists
    try {
      await resetPool.query('DROP TABLE IF EXISTS pgmigrations CASCADE');
    } catch (err) {
      // Ignore
    }
  } finally {
    await resetPool.end();
  }
  // Small delay to ensure schema changes are visible to new connections
  await new Promise(r => setTimeout(r, 500));
}