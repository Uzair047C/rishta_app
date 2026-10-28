import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Db } from '../db/db';
import { IS_PUBLIC_KEY } from './public.decorator';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let jwtService: { verify: jest.Mock };
  let configService: { get: jest.Mock };
  let db: { oneOrNone: jest.Mock };

  const mockRequest = (headers: Record<string, string>) => ({
    headers,
    user: undefined,
  });

  const mockContext = (request: ReturnType<typeof mockRequest>) => ({
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  });

  beforeEach(async () => {
    jwtService = { verify: jest.fn() };
    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          JWT_SECRET: 'test-secret-that-is-at-least-32-chars-long',
          JWT_ISSUER: 'rishta-api',
          JWT_AUDIENCE: 'rishta-app',
        };
        return values[key];
      }),
    };
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    db = { oneOrNone: jest.fn().mockResolvedValue({ id: 'test-user-id', status: 'active' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: Reflector, useValue: reflector },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: Db, useValue: db },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should allow access when route is @Public()', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const ctx = mockContext(mockRequest({}));

    const result = await guard.canActivate(ctx as any);

    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
  });

  it('should throw UnauthorizedException when no authorization header', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const ctx = mockContext(mockRequest({}));

    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when authorization header is not Bearer', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const ctx = mockContext(mockRequest({ authorization: 'Basic abc123' }));

    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw error when JWT_SECRET not configured at construction', async () => {
    // The guard constructor validates JWT_SECRET and throws if not configured
    expect(() => {
      new JwtAuthGuard(
        { verify: jest.fn() } as any,
        { get: jest.fn().mockReturnValue(undefined) } as any,
        reflector,
        db as any
      );
    }).toThrow('JWT_SECRET is not configured');
  });

  it('should attach user to request and return true for valid token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verify.mockReturnValue({ userId: 'test-user-id' });
    db.oneOrNone.mockResolvedValue({ id: 'test-user-id', status: 'active', is_admin: false });
    const request = mockRequest({ authorization: 'Bearer valid-token' });
    const ctx = mockContext(request);

    const result = await guard.canActivate(ctx as any);

    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 'test-user-id', status: 'active', is_admin: false });
    expect(jwtService.verify).toHaveBeenCalledWith('valid-token', {
      secret: 'test-secret-that-is-at-least-32-chars-long',
      issuer: 'rishta-api',
      audience: 'rishta-app',
    });
    expect(db.oneOrNone).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', ['test-user-id']);
  });

  it('should throw UnauthorizedException for invalid/expired token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verify.mockImplementation(() => { throw new Error('invalid token'); });
    const ctx = mockContext(mockRequest({ authorization: 'Bearer invalid-token' }));

    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });
});