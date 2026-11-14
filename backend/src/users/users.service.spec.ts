import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { Db } from '../db/db';
import { UserRow } from '../db/types';

describe('UsersService', () => {
  let service: UsersService;
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
    firebase_uid: null,
    status: 'active',
    is_admin: false,
    created_at: new Date(),
  };

  beforeEach(async () => {
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
        UsersService,
        { provide: Db, useValue: mockDb },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    db = module.get(Db);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOrCreateByGoogleId', () => {
    it('looks up an existing account by Google provider subject', async () => {
      const googleUser = { ...mockUser, auth_provider: 'google', provider_subject: 'google-sub-123' };
      db.oneOrNone.mockResolvedValueOnce(googleUser);

      const result = await service.findOrCreateByGoogleId('google-sub-123', 'test@example.com', true);

      expect(result).toEqual(googleUser);
      expect(db.oneOrNone).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE auth_provider = $1 AND provider_subject = $2',
        ['google', 'google-sub-123']
      );
      expect(db.query).not.toHaveBeenCalled();
    });

    it('links Google identity to an existing verified legacy account', async () => {
      const legacyUser = {
        ...mockUser,
        auth_provider: 'firebase',
        provider_subject: 'legacy-firebase-uid',
        firebase_uid: 'legacy-firebase-uid',
        email_verified: true,
      };
      db.oneOrNone
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(legacyUser);
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.findOrCreateByGoogleId('google-sub-456', 'test@example.com', true);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("auth_provider = 'google'"),
        [legacyUser.id, 'google-sub-456']
      );
      expect(result.auth_provider).toBe('google');
      expect(result.provider_subject).toBe('google-sub-456');
      expect(result.firebase_uid).toBe('legacy-firebase-uid');
    });

    it('creates a new user with a Google provider subject', async () => {
      const googleUser = { ...mockUser, auth_provider: 'google', provider_subject: 'google-sub-new', firebase_uid: null };
      db.oneOrNone
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      db.one.mockResolvedValue(googleUser);

      const result = await service.findOrCreateByGoogleId('google-sub-new', 'new@example.com', true);

      expect(result).toEqual(googleUser);
      expect(db.one).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['new@example.com', 'google', 'google-sub-new', true])
      );
    });

    it('does not link a verified email already owned by a different provider', async () => {
      const otherProviderUser = {
        ...mockUser,
        auth_provider: 'apple',
        provider_subject: 'apple-sub-123',
        email_verified: true,
      };
      db.oneOrNone
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(otherProviderUser);

      await expect(service.findOrCreateByGoogleId('google-sub-456', 'test@example.com', true))
        .rejects.toThrow(ConflictException);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('refuses to create an account from an unverified email', async () => {
      await expect(service.findOrCreateByGoogleId('google-sub-123', 'test@example.com', false))
        .rejects.toThrow(ConflictException);
      expect(db.oneOrNone).not.toHaveBeenCalled();
      expect(db.one).not.toHaveBeenCalled();
    });
  });

  describe('require', () => {
    it('should return user when found', async () => {
      db.oneOrNone.mockResolvedValue(mockUser);

      const result = await service.require(mockUser.id);

      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when user not found', async () => {
      db.oneOrNone.mockResolvedValue(null);

      await expect(service.require('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('requireOnboarded', () => {
    it('should return user when profile exists and user has gender and dob', async () => {
      const onboardedUser = { ...mockUser, gender: 'male', dob: new Date('1990-01-01') };
      db.oneOrNone
        .mockResolvedValueOnce(onboardedUser) // require()
        .mockResolvedValueOnce({ '?column?': 1 }); // profile exists with name and photos

      const result = await service.requireOnboarded(onboardedUser.id);

      expect(result).toEqual(onboardedUser);
    });

    it('should throw ForbiddenException when profile incomplete (no name)', async () => {
      const onboardedUser = { ...mockUser, gender: 'male', dob: new Date('1990-01-01') };
      db.oneOrNone
        .mockResolvedValueOnce(onboardedUser) // require()
        .mockResolvedValueOnce(null); // profile missing name

      await expect(service.requireOnboarded(onboardedUser.id)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when profile incomplete (no photos)', async () => {
      const onboardedUser = { ...mockUser, gender: 'male', dob: new Date('1990-01-01') };
      db.oneOrNone
        .mockResolvedValueOnce(onboardedUser) // require()
        .mockResolvedValueOnce(null); // profile missing photos

      await expect(service.requireOnboarded(onboardedUser.id)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when gender missing', async () => {
      const userNoGender = { ...mockUser, gender: null, dob: new Date('1990-01-01') };
      db.oneOrNone
        .mockResolvedValueOnce(userNoGender) // require()
        .mockResolvedValueOnce({ '?column?': 1 }); // profile exists

      await expect(service.requireOnboarded(userNoGender.id)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when dob missing', async () => {
      const userNoDob = { ...mockUser, gender: 'male', dob: null };
      db.oneOrNone
        .mockResolvedValueOnce(userNoDob) // require()
        .mockResolvedValueOnce({ '?column?': 1 }); // profile exists

      await expect(service.requireOnboarded(userNoDob.id)).rejects.toThrow(ForbiddenException);
    });
  });
});