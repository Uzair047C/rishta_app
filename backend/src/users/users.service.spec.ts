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
    auth_provider: 'firebase',
    provider_subject: 'firebase-uid-123',
    email_verified: true,
    firebase_uid: 'firebase-uid-123',
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

  describe('findOrCreateByFirebaseUid', () => {
    it('should return existing user when Firebase UID matches', async () => {
      db.oneOrNone
        .mockResolvedValueOnce(mockUser); // First call: find by Firebase UID

      const result = await service.findOrCreateByFirebaseUid('firebase-uid-123', 'test@example.com', undefined, true);

      expect(result).toEqual(mockUser);
      expect(db.oneOrNone).toHaveBeenCalledTimes(1);
      // Should not call UPDATE since email_verified is already true
      expect(db.query).not.toHaveBeenCalled();
    });

    it('should update email_verified when Firebase says verified and user is not verified', async () => {
      const userNotVerified = { ...mockUser, email_verified: false };
      db.oneOrNone.mockResolvedValueOnce(userNotVerified);
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.findOrCreateByFirebaseUid('firebase-uid-123', 'test@example.com', undefined, true);

      expect(result.email_verified).toBe(true);
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE users SET email_verified = true WHERE id = $1',
        [mockUser.id]
      );
    });

    it('should link Firebase account to existing user with same verified email and no firebase_uid', async () => {
      const userWithoutProvider = { ...mockUser, firebase_uid: null, auth_provider: null, provider_subject: null, email_verified: true };
      db.oneOrNone
        .mockResolvedValueOnce(null) // No Firebase UID match
        .mockResolvedValueOnce(userWithoutProvider); // Find by email
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.findOrCreateByFirebaseUid('firebase-uid-456', 'test@example.com', undefined, true);

      expect(result.firebase_uid).toBe('firebase-uid-456');
      expect(result.email_verified).toBe(true);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        [userWithoutProvider.id, 'firebase-uid-456']
      );
    });

    it('should throw conflict when email is linked to different firebase_uid', async () => {
      const userWithDifferentProvider = { ...mockUser, firebase_uid: 'different-uid', auth_provider: 'firebase', provider_subject: 'different-uid', email_verified: true };
      db.oneOrNone
        .mockResolvedValueOnce(null) // No Firebase UID match
        .mockResolvedValueOnce(userWithDifferentProvider); // Find by email

      await expect(service.findOrCreateByFirebaseUid('firebase-uid-456', 'test@example.com', undefined, true))
        .rejects.toThrow(ConflictException);
    });

    it('should create new user when no existing user found', async () => {
      db.oneOrNone
        .mockResolvedValueOnce(null) // No Firebase UID match
        .mockResolvedValueOnce(null); // No email match
      db.one.mockResolvedValue(mockUser);

      const result = await service.findOrCreateByFirebaseUid('firebase-uid-new', 'new@example.com', 'John Doe', true);

      expect(result).toEqual(mockUser);
      expect(db.one).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['new@example.com', 'firebase-uid-new', true])
      );
    });

    it('should throw when email not provided', async () => {
      await expect(service.findOrCreateByFirebaseUid('firebase-uid', '')).rejects.toThrow(ConflictException);
    });

    it('should NOT link by email when emailVerified is false', async () => {
      const userWithVerifiedEmail = { ...mockUser, firebase_uid: null, auth_provider: null, provider_subject: null, email_verified: true };
      db.oneOrNone
        .mockResolvedValueOnce(null) // No Firebase UID match
        .mockResolvedValueOnce(userWithVerifiedEmail); // Find by email (but emailVerified=false, so should skip)

      // When emailVerified=false, the function should NOT look up by email
      // and should create a new user instead
      db.one.mockResolvedValue(mockUser);

      const result = await service.findOrCreateByFirebaseUid('firebase-uid-456', 'test@example.com', undefined, false);

      expect(result).toEqual(mockUser);
      // Should only call oneOrNone once (for firebase_uid lookup)
      expect(db.oneOrNone).toHaveBeenCalledTimes(1);
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