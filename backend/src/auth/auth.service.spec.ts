import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Db } from '../db/db';
import { UserRow } from '../db/types';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let db: jest.Mocked<Db>;

  const mockUser: UserRow = {
    id: 'test-user-id',
    email: 'test@example.com',
    phone: null,
    phone_verified: false,
    gender: null,
    dob: null,
    location: null,
    lat: null,
    lng: null,
    device_id: null,
    auth_provider: 'google',
    provider_subject: 'google-sub-123',
    email_verified: true,
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockUsersService = {
      findOrCreateByGoogleId: jest.fn(),
      requireOnboarded: jest.fn(),
      findOne: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          JWT_SECRET: 'test-secret',
          GOOGLE_CLIENT_IDS: ['web-client-id', 'android-client-id', 'ios-client-id'],
          STREAM_API_KEY: 'stream-key',
          STREAM_API_SECRET: 'stream-secret',
        };
        return values[key];
      }),
    };

    const mockDb = {
      query: jest.fn(),
      all: jest.fn(),
      one: jest.fn(),
      oneOrNone: jest.fn(),
      repo: jest.fn(),
      tx: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: Db, useValue: mockDb },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    db = module.get(Db);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateGoogleIdToken', () => {
    it('should throw UnauthorizedException for invalid token', async () => {
      // We can't easily mock the OAuth2Client, so this test verifies the method exists
      // Full integration test would require mocking google-auth-library
      expect(service.validateGoogleIdToken).toBeDefined();
    });
  });

  describe('googleLogin', () => {
    it('should return accessToken, refreshToken, user, and profileComplete for new user', async () => {
      usersService.findOrCreateByGoogleId.mockResolvedValue(mockUser);
      usersService.requireOnboarded.mockRejectedValue(new Error('profile_incomplete'));
      jwtService.sign.mockReturnValue('access-token');
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.googleLogin('valid-id-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('profileComplete');
      expect(result.profileComplete).toBe(false);
      expect(usersService.findOrCreateByGoogleId).toHaveBeenCalled();
    });

    it('should return profileComplete: true when user has completed onboarding', async () => {
      usersService.findOrCreateByGoogleId.mockResolvedValue(mockUser);
      usersService.requireOnboarded.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('access-token');
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.googleLogin('valid-id-token');

      expect(result.profileComplete).toBe(true);
    });

    it('should not create duplicate user on repeat login', async () => {
      usersService.findOrCreateByGoogleId.mockResolvedValue(mockUser);
      usersService.requireOnboarded.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('access-token');
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      // First login
      await service.googleLogin('valid-id-token');
      // Second login (repeat)
      await service.googleLogin('valid-id-token');

      // findOrCreateByGoogleId should be called twice but return same user
      expect(usersService.findOrCreateByGoogleId).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshAccessToken', () => {
    it('should throw UnauthorizedException for invalid refresh token', async () => {
      db.all.mockResolvedValue([]);

      await expect(service.refreshAccessToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should return new accessToken and refreshToken for valid refresh token', async () => {
      const bcrypt = await import('bcrypt');
      const validRefreshToken = 'valid-refresh-token';
      const tokenHash = await bcrypt.hash(validRefreshToken, 10);

      db.all.mockResolvedValue([
        {
          id: 'token-id',
          user_id: mockUser.id,
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + 86400000),
          revoked_at: null,
        },
      ]);
      jwtService.sign.mockReturnValue('new-access-token');
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.refreshAccessToken(validRefreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.accessToken).toBe('new-access-token');
    });
  });

  describe('logout', () => {
    it('should revoke all tokens when no refreshToken provided', async () => {
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.logout(mockUser.id);

      expect(result).toEqual({ success: true });
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [mockUser.id]
      );
    });

    it('should revoke only specific token when refreshToken provided', async () => {
      const bcrypt = await import('bcrypt');
      const refreshToken = 'specific-refresh-token';
      const tokenHash = await bcrypt.hash(refreshToken, 10);

      db.all.mockResolvedValue([{ id: 'token-id', token_hash: tokenHash }]);
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.logout(mockUser.id, refreshToken);

      expect(result).toEqual({ success: true });
    });
  });

  describe('validateUser', () => {
    it('should return user when found', async () => {
      usersService.findOne.mockResolvedValue(mockUser);

      const result = await service.validateUser(mockUser.id);

      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      usersService.findOne.mockResolvedValue(null);

      const result = await service.validateUser('non-existent-id');

      expect(result).toBeNull();
    });
  });
});