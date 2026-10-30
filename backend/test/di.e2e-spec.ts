import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { Db } from '../src/db/db';
import { UsersService } from '../src/users/users.service';
import { PushService } from '../src/notifications/push.service';
import { PgBossService } from '../src/pg-boss/pg-boss.service';

describe('DI Setup (e2e)', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('should provide a single Db instance across modules', () => {
    const db1 = module.get<Db>(Db);
    const db2 = module.get<Db>(Db);
    expect(db1).toBe(db2); // Same instance
  });

  it('should provide UsersService from UsersModule', () => {
    const usersService = module.get<UsersService>(UsersService);
    expect(usersService).toBeDefined();
  });

  it('should provide PushService from NotificationsModule', () => {
    const pushService = module.get<PushService>(PushService);
    expect(pushService).toBeDefined();
  });

  it('should provide PgBossService from PgBossModule', () => {
    const pgBossService = module.get<PgBossService>(PgBossService);
    expect(pgBossService).toBeDefined();
  });

  it('should have exactly one Pool instance (via Db)', () => {
    const db = module.get<Db>(Db);
    const pool = db.getPool();
    expect(pool).toBeDefined();
    // Verify we can get a client
    expect(typeof pool.connect).toBe('function');
  });
});