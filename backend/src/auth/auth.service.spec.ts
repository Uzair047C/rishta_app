import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Db, ExtendedQueryable } from '../db/db';
import { UserRow } from '../db/types';

// Mock firebase-admin modules
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  cert: jest.fn(),
  App: jest.fn(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: 'firebase-uid-123',
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
    }),
  })),
}));

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
    auth_provider: 'firebase',
    provider_subject: 'firebase-uid-123',
    email_verified: true,
    firebase_uid: 'firebase-uid-123',
    status: 'active',
    is_admin: false,
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockUsersService = {
      findOrCreateByFirebaseUid: jest.fn(),
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
          FIREBASE_PROJECT_ID: 'test-project',
          FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk@test-project.iam.gserviceaccount.com',
          FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
          STREAM_API_KEY: 'stream-key',
          STREAM_API_SECRET: 'stream-secret',
          JWT_ISSUER: 'rishta-api',
          JWT_AUDIENCE: 'rishta-app',
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

  describe('validateFirebaseIdToken', () => {
    it('should be defined', () => {
      expect(service.validateFirebaseIdToken).toBeDefined();
    });
  });

  describe('firebaseLogin', () => {
    it('should return accessToken, refreshToken, user, and profileComplete for new user', async () => {
      usersService.findOrCreateByFirebaseUid.mockResolvedValue(mockUser);
      usersService.requireOnboarded.mockRejectedValue(new Error('profile_incomplete'));
      jwtService.sign.mockReturnValue('access-token');
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.firebaseLogin('valid-id-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('profileComplete');
      expect(result.profileComplete).toBe(false);
      expect(usersService.findOrCreateByFirebaseUid).toHaveBeenCalledWith(
        'firebase-uid-123',
        'test@example.com',
        'Test User',
        true
      );
    });

    it('should return profileComplete: true when user has completed onboarding', async () => {
      usersService.findOrCreateByFirebaseUid.mockResolvedValue(mockUser);
      usersService.requireOnboarded.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('access-token');
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.firebaseLogin('valid-id-token');

      expect(result.profileComplete).toBe(true);
    });

    it('should not create duplicate user on repeat login', async () => {
      usersService.findOrCreateByFirebaseUid.mockResolvedValue(mockUser);
      usersService.requireOnboarded.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('access-token');
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      // First login
      await service.firebaseLogin('valid-id-token');
      // Second login (repeat)
      await service.firebaseLogin('valid-id-token');

      // findOrCreateByFirebaseUid should be called twice but return same user
      expect(usersService.findOrCreateByFirebaseUid).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshAccessToken', () => {
    it('should throw UnauthorizedException for invalid refresh token', async () => {
      const mockTxDb: ExtendedQueryable = {
        query: jest.fn(),
        oneOrNone: jest.fn().mockResolvedValue(null),
        one: jest.fn(),
        all: jest.fn(),
      };
      db.tx.mockImplementation(async (fn) => fn(mockTxDb));

      await expect(service.refreshAccessToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for revoked token (reuse detection)', async () => {
      const mockTxDb: ExtendedQueryable = {
        query: jest.fn(),
        oneOrNone: jest.fn().mockResolvedValue({
          id: 'token-id',
          user_id: mockUser.id,
          token_hash: 'hash',
          expires_at: new Date(Date.now() + 86400000),
          revoked_at: new Date(), // Already revoked
          family_id: 'family-123',
          replaced_by: 'new-token-id',
        }),
        one: jest.fn(),
        all: jest.fn(),
      };
      db.tx.mockImplementation(async (fn) => fn(mockTxDb));

      await expect(service.refreshAccessToken('revoked-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for expired token', async () => {
      const mockTxDb: ExtendedQueryable = {
        query: jest.fn(),
        oneOrNone: jest.fn().mockResolvedValue({
          id: 'token-id',
          user_id: mockUser.id,
          token_hash: 'hash',
          expires_at: new Date(Date.now() - 86400000), // Expired
          revoked_at: null,
          family_id: 'family-123',
          replaced_by: null,
        }),
        one: jest.fn(),
        all: jest.fn(),
      };
      db.tx.mockImplementation(async (fn) => fn(mockTxDb));

      await expect(service.refreshAccessToken('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should return new accessToken and refreshToken for valid refresh token', async () => {
      const mockTxDb: ExtendedQueryable = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
        oneOrNone: jest.fn().mockResolvedValue({
          id: 'token-id',
          user_id: mockUser.id,
          token_hash: 'hash',
          expires_at: new Date(Date.now() + 86400000),
          revoked_at: null,
          family_id: 'family-123',
          replaced_by: null,
        }),
        one: jest.fn().mockResolvedValue({ id: 'new-token-id' }),
        all: jest.fn(),
      };
      db.tx.mockImplementation(async (fn) => fn(mockTxDb));
      jwtService.sign.mockReturnValue('new-access-token');

      const result = await service.refreshAccessToken('valid-refresh-token');

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

    it('should revoke token family when refreshToken provided', async () => {
      db.oneOrNone.mockResolvedValue({ id: 'token-id', family_id: 'family-123' });
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.logout(mockUser.id, 'some-refresh-token');

      expect(result).toEqual({ success: true });
      expect(db.oneOrNone).toHaveBeenCalled();
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
        ['family-123']
      );
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