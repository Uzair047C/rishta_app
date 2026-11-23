import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Db, ExtendedQueryable } from '../db/db';
import { UserRow } from '../db/types';
import { StreamService } from '../chat/stream.service';

// Mock firebase-admin modules. verifyIdToken is a single shared mock so tests
// can override per-call (getAuth() must return the same jest.fn every time).
const mockVerifyIdToken = jest.fn();
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  cert: jest.fn(),
  App: jest.fn(),
}), { virtual: true });

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}), { virtual: true });

// Mock google-auth-library: one shared verifyIdToken mock for /auth/google.
const mockGoogleVerify = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockGoogleVerify })),
}), { virtual: true });

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
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-123',
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
    });
    mockGoogleVerify.mockReset();
    mockGoogleVerify.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-123',
        email: 'test@example.com',
        email_verified: true,
        name: 'Test User',
      }),
    });

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
          GOOGLE_CLIENT_IDS: 'web-id.apps.googleusercontent.com,android-id.apps.googleusercontent.com',
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
        { provide: StreamService, useValue: { issueToken: jest.fn() } },
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

    it('should route phone-auth tokens to findOrCreateByPhone', async () => {
      // Phone-auth ID tokens carry a phone_number claim and no email.
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: 'phone-uid-1',
        email: null,
        email_verified: false,
        phone_number: '+15551234567',
      });

      const phoneUser: UserRow = { ...mockUser, email: null, phone: '+15551234567', phone_verified: true };
      db.oneOrNone.mockResolvedValue(null); // no existing user by uid or phone
      db.one.mockResolvedValue(phoneUser); // INSERT ... RETURNING
      usersService.requireOnboarded.mockRejectedValue(new Error('profile_incomplete'));
      jwtService.sign.mockReturnValue('access-token');
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.firebaseLogin('phone-id-token');

      expect(usersService.findOrCreateByFirebaseUid).not.toHaveBeenCalled();
      expect(db.oneOrNone).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE firebase_uid = $1',
        ['phone-uid-1'],
      );
      expect(result.user.phone).toBe('+15551234567');
      expect(result.user.phone_verified).toBe(true);
      expect(result.profileComplete).toBe(false);
    });

    it('should link a Firebase UID to an existing verified phone account', async () => {
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: 'phone-uid-2',
        email: null,
        email_verified: false,
        phone_number: '+15550009999',
      });

      const existing: UserRow = { ...mockUser, email: null, phone: '+15550009999', phone_verified: true, firebase_uid: null };
      db.oneOrNone
        .mockResolvedValueOnce(null) // by firebase_uid: not found
        .mockResolvedValueOnce(existing); // by verified phone: found
      usersService.requireOnboarded.mockResolvedValue(existing);
      jwtService.sign.mockReturnValue('access-token');
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.firebaseLogin('phone-id-token');

      expect(result.user.id).toBe(existing.id);
      expect(result.profileComplete).toBe(true);
    });
  });

  describe('googleLogin', () => {
    it('should verify the token against GOOGLE_CLIENT_IDS and login an existing Google user', async () => {
      db.oneOrNone.mockResolvedValueOnce(mockUser); // existing user by (google, sub)
      usersService.requireOnboarded.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('access-token');
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.googleLogin('google-id-token');

      expect(mockGoogleVerify).toHaveBeenCalledWith({
        idToken: 'google-id-token',
        audience: ['web-id.apps.googleusercontent.com', 'android-id.apps.googleusercontent.com'],
      });
      expect(result.user.id).toBe(mockUser.id);
      expect(result.profileComplete).toBe(true);
    });

    it('should create a new user keyed on the Google sub when none exists', async () => {
      db.oneOrNone.mockResolvedValueOnce(null); // no user by (google, sub)
      usersService.findOrCreateByFirebaseUid.mockResolvedValue(mockUser);
      usersService.requireOnboarded.mockRejectedValue(new Error('profile_incomplete'));
      jwtService.sign.mockReturnValue('access-token');
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.googleLogin('google-id-token');

      expect(usersService.findOrCreateByFirebaseUid).toHaveBeenCalledWith('google-sub-123', 'test@example.com', 'Test User', true);
      expect(result.profileComplete).toBe(false);
    });

    it('should reject an unverifiable token', async () => {
      mockGoogleVerify.mockRejectedValue(new Error('bad token'));

      await expect(service.googleLogin('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should reject when email is not verified', async () => {
      mockGoogleVerify.mockResolvedValue({
        getPayload: () => ({ sub: 'google-sub-123', email: 'x@example.com', email_verified: false }),
      });

      await expect(service.googleLogin('google-id-token')).rejects.toThrow('not verified');
    });

    it('should reject suspended and banned users', async () => {
      db.oneOrNone.mockResolvedValueOnce({ ...mockUser, status: 'banned' });

      await expect(service.googleLogin('google-id-token')).rejects.toThrow(ForbiddenException);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('refreshAccessToken', () => {
    it('should throw UnauthorizedException for invalid refresh token', async () => {
      const mockTxDb: ExtendedQueryable = {
        query: jest.fn(),
        oneOrNone: jest.fn().mockResolvedValue(null),
        one: jest.fn(),
        all: jest.fn(),
        count: jest.fn(),
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
        count: jest.fn(),
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
        count: jest.fn(),
      };
      db.tx.mockImplementation(async (fn) => fn(mockTxDb));

      await expect(service.refreshAccessToken('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should return new accessToken and refreshToken for valid refresh token', async () => {
      const mockTxDb: ExtendedQueryable = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
        oneOrNone: jest.fn()
          .mockResolvedValueOnce({
            id: 'token-id',
            user_id: mockUser.id,
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 86400000),
            revoked_at: null,
            family_id: 'family-123',
            replaced_by: null,
          })
          .mockResolvedValueOnce({ status: 'active' }), // user status check
        one: jest.fn().mockResolvedValue({ id: 'new-token-id' }),
        all: jest.fn(),
        count: jest.fn(),
      };
      db.tx.mockImplementation(async (fn) => fn(mockTxDb));
      jwtService.sign.mockReturnValue('new-access-token');

      const result = await service.refreshAccessToken('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.accessToken).toBe('new-access-token');
    });

    it('should reject refresh for a banned user', async () => {
      const mockTxDb: ExtendedQueryable = {
        query: jest.fn(),
        oneOrNone: jest.fn()
          .mockResolvedValueOnce({
            id: 'token-id',
            user_id: mockUser.id,
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 86400000),
            revoked_at: null,
            family_id: 'family-123',
            replaced_by: null,
          })
          .mockResolvedValueOnce({ status: 'banned' }),
        one: jest.fn(),
        all: jest.fn(),
        count: jest.fn(),
      };
      db.tx.mockImplementation(async (fn) => fn(mockTxDb));

      await expect(service.refreshAccessToken('valid-refresh-token')).rejects.toThrow(ForbiddenException);
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
      db.oneOrNone.mockResolvedValue({ family_id: 'family-123' });
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.logout(mockUser.id, 'some-refresh-token');

      expect(result).toEqual({ success: true });
      expect(db.oneOrNone).toHaveBeenCalledWith(
        'SELECT family_id FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2',
        [expect.any(String), mockUser.id],
      );
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND user_id = $2 AND revoked_at IS NULL',
        ['family-123', mockUser.id]
      );
    });

    it('should not revoke anything for another user token (scoped logout)', async () => {
      db.oneOrNone.mockResolvedValue(null); // token belongs to someone else
      db.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await service.logout(mockUser.id, 'foreign-token');

      expect(result).toEqual({ success: true });
      expect(db.query).not.toHaveBeenCalledWith(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
        expect.anything(),
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