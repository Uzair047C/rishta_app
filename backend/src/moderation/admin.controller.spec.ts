import { ForbiddenException } from '@nestjs/common';
import { AdminController, AdminGuard } from './admin.controller';

const adminId = '11111111-1111-1111-1111-111111111111';

function makeDb() {
  const conn = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: 'x', status: 'active' }] }) };
  return {
    conn,
    all: jest.fn().mockResolvedValue([]),
    tx: jest.fn(async (fn: (c: typeof conn) => Promise<unknown>) => fn(conn)),
  };
}

describe('AdminController', () => {
  it('resolveFlag updates the flag and writes an audit row in one tx', async () => {
    const db = makeDb();
    const c = new AdminController(db as any);
    const out = await c.resolveFlag('22222222-2222-2222-2222-222222222222', { status: 'actioned', note: 'nude' }, adminId);

    expect(out).toEqual({ id: '22222222-2222-2222-2222-222222222222', status: 'actioned' });
    expect(db.conn.query).toHaveBeenCalledTimes(2);
    expect(db.conn.query.mock.calls[0][0]).toContain('UPDATE moderation_flags');
    expect(db.conn.query.mock.calls[1][0]).toContain('admin_audit_log');
  });

  it('resolveReport updates the report and writes an audit row', async () => {
    const db = makeDb();
    const c = new AdminController(db as any);
    const out = await c.resolveReport('33333333-3333-3333-3333-333333333333', { status: 'dismissed' }, adminId);

    expect(out.status).toBe('dismissed');
    expect(db.conn.query.mock.calls[0][0]).toContain('UPDATE reports');
    expect(db.conn.query.mock.calls[1][0]).toContain('admin_audit_log');
  });

  it('setUserStatus rejects unknown users without writing an audit row', async () => {
    const db = makeDb();
    db.conn.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const c = new AdminController(db as any);
    await expect(
      c.setUserStatus('44444444-4444-4444-4444-444444444444', { status: 'banned' }, adminId),
    ).rejects.toThrow('user_not_found');
    expect(db.conn.query).toHaveBeenCalledTimes(1); // update only, no audit insert
  });
});

describe('AdminGuard', () => {
  const mk = (adminUserIds = '', adminToken: string | null = null) =>
    new AdminGuard({} as any, { get: (k: string) => ({ ADMIN_USER_IDS: adminUserIds, ADMIN_TOKEN: adminToken }[k] ?? '') } as any);

  const ctx = (user: unknown, adminTokenHeader?: string) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user, headers: adminTokenHeader ? { 'x-admin-token': adminTokenHeader } : {} }),
    }),
  });

  it('allows a user id listed in ADMIN_USER_IDS', async () => {
    const g = mk(adminId);
    await expect(g.canActivate(ctx({ id: adminId }) as any)).resolves.toBe(true);
  });

  it('rejects a non-admin user with no token', async () => {
    const g = mk(adminId);
    await expect(g.canActivate(ctx({ id: '99999999-9999-9999-9999-999999999999' }) as any)).rejects.toThrow(ForbiddenException);
  });

  it('rejects when ADMIN_TOKEN is unset even if a header is sent', async () => {
    const g = mk('');
    await expect(g.canActivate(ctx({ id: '99999999-9999-9999-9999-999999999999' }, 'guess') as any)).rejects.toThrow(ForbiddenException);
  });

  it('accepts a matching x-admin-token via timing-safe path', async () => {
    const g = mk('', 'secret-token');
    await expect(g.canActivate(ctx(null, 'secret-token') as any)).resolves.toBe(true);
  });

  it('rejects a wrong-length token without throwing from timingSafeEqual', async () => {
    const g = mk('', 'secret-token');
    await expect(g.canActivate(ctx(null, 'short') as any)).rejects.toThrow(ForbiddenException);
  });
});
