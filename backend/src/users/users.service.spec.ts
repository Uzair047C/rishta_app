import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
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
    it('should return existing user when Google ID matches', async () => {
      db.oneOrNone
        .mockResolvedValueOnce(mockUser) // First call: find by Google ID
        .mockResolvedValueOnce({ auth_provider: 'google', provider_subject: 'google-sub-123' }); // Update email_verified

      const result = await service.findOrCreateByGoogleId('google-sub-123', 'test@example.com');

      expect(result).toEqual(mockUser);
      expect(db.oneOrNone).toHaveBeenCalledTimes(2);
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE users SET email_verified = true WHERE id = $1',
        [mockUser.id]
      );
    });

    it('should link Google account to existing user with same verified email and no provider', async () => {
      const userWithoutProvider = { ...mockUser, auth_provider: null, provider_subject: null, email_verified: true };
      db.oneOrNone
        .mockResolvedValueOnce(null) // No Google ID match
        .mockResolvedValueOnce(userWithoutProvider) // Find by email
        .mockResolvedValueOnce({ auth_provider: null, provider_subject: null }); // No existing provider
      db.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.findOrCreateByGoogleId('google-sub-456', 'test@example.com');

      expect(result).toEqual(userWithoutProvider);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        [userWithoutProvider.id, 'google', 'google-sub-456']
      );
    });

    it('should throw conflict when email is linked to different provider', async () => {
      const userWithDifferentProvider = { ...mockUser, auth_provider: 'google', provider_subject: 'different-sub' };
      db.oneOrNone
        .mockResolvedValueOnce(null) // No Google ID match
        .mockResolvedValueOnce(userWithDifferentProvider) // Find by email
        .mockResolvedValueOnce({ auth_provider: 'google', provider_subject: 'different-sub' }); // Existing provider

      await expect(service.findOrCreateByGoogleId('google-sub-456', 'test@example.com'))
        .rejects.toThrow('Account already exists with different provider');
    });

    it('should create new user when no existing user found', async () => {
      db.oneOrNone
        .mockResolvedValueOnce(null) // No Google ID match
        .mockResolvedValueOnce(null); // No email match
      db.one.mockResolvedValue(mockUser);

      const result = await service.findOrCreateByGoogleId('google-sub-new', 'new@example.com', 'John', 'Doe');

      expect(result).toEqual(mockUser);
      expect(db.one).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['new@example.com', 'google', 'google-sub-new'])
      );
    });

    it('should throw when email not provided', async () => {
      await expect(service.findOrCreateByGoogleId('google-sub', '')).rejects.toThrow('Email not provided from Google');
    });
  });

  describe('require', () => {
    it('should return user when found', async () => {
      db.oneOrNone.mockResolvedValue(mockUser);

      const result = await service.require(mockUser.id);

      expect(result).toEqual(mockUser);
    });

    it('should throw when user not found', async () => {
      db.oneOrNone.mockResolvedValue(null);

      await expect(service.require('non-existent-id')).rejects.toThrow('User not found');
    });
  });

  describe('requireOnboarded', () => {
    it('should return user when profile exists', async () => {
      db.oneOrNone
        .mockResolvedValueOnce(mockUser) // require()
        .mockResolvedValueOnce({ user_id: mockUser.id }); // profile exists

      const result = await service.requireOnboarded(mockUser.id);

      expect(result).toEqual(mockUser);
    });

    it('should throw ForbiddenException when profile incomplete', async () => {
      db.oneOrNone
        .mockResolvedValueOnce(mockUser) // require()
        .mockResolvedValueOnce(null); // no profile

      await expect(service.requireOnboarded(mockUser.id)).rejects.toThrow(ForbiddenException);
    });
  });
});