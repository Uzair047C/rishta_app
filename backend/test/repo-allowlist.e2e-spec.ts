import { testPool, truncateAll, query } from './e2e-setup';
import { Db } from '../src/db/db';
import { ConfigService } from '@nestjs/config';

// Mock ConfigService for Db
const mockConfig = {
  get: (key: string) => {
    const config: Record<string, string> = {
      DATABASE_URL: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL?.replace(/\/([^/]+)$/, '/$1_test') || '',
      DATABASE_SSL: 'false',
      DB_POOL_MAX: '5',
      NODE_ENV: 'test',
    };
    return config[key];
  },
} as unknown as ConfigService;

describe('Repo column allowlist (e2e)', () => {
  let db: Db;

  beforeAll(async () => {
    await truncateAll();
    db = new Db(mockConfig);
  });

  afterAll(async () => {
    await db.onModuleDestroy();
    await truncateAll();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it('should insert and retrieve with allowed columns', async () => {
    const repo = db.repo<{ id: string; email: string; phone: string }>('users', db, ['email', 'phone']);
    const user = await repo.insert({ email: 'test@example.com', phone: '+1234567890' });
    expect(user.email).toBe('test@example.com');
    expect(user.phone).toBe('+1234567890');
  });

  it('should reject unknown columns on insert', async () => {
    const repo = db.repo<{ id: string; email: string }>('users', db, ['email']);
    await expect(repo.insert({ email: 'test@example.com', unknown_field: 'hack' }))
      .rejects.toThrow('Unknown column: unknown_field for table users');
  });

  it('should reject unknown columns on set/update', async () => {
    const repo = db.repo<{ id: string; email: string }>('users', db, ['email']);
    const user = await repo.insert({ email: 'test@example.com' });
    await expect(repo.set(user.id, { email: 'new@example.com', unknown_field: 'hack' }))
      .rejects.toThrow('Unknown column: unknown_field for table users');
  });

  it('should allow any column when allowlist not provided', async () => {
    const repo = db.repo<{ id: string; email: string; custom: string }>('users', db);
    const user = await repo.insert({ email: 'test@example.com', custom: 'anything' });
    expect(user.custom).toBe('anything');
  });
});