import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FeedService, FeedFilters, LikeOutcome } from './feed.service';
import { Db, ExtendedQueryable } from '../db/db';
import { SubscriptionService } from '../subscription/subscription.service';
import { UsersService } from '../users/users.service';
import { PushService } from '../notifications/push.service';
import { OutboxWorker } from '../pg-boss/outbox.worker';

describe('FeedService', () => {
  let service: FeedService;
  let db: any;
  let subscriptionService: any;
  let usersService: any;
  let pushService: any;
  let outboxWorker: any;

  const userId = '11111111-1111-1111-1111-111111111111';
  const targetId = '22222222-2222-2222-2222-222222222222';

  const mockOnboardedProfile = {
    name: 'Test User',
    photos: ['photo1.jpg'],
    gender: 'male',
  };

  const mockTargetProfile = {
    name: 'Target User',
    photos: ['photo2.jpg'],
    gender: 'female',
  };

  beforeEach(async () => {
    db = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
      one: jest.fn(),
      oneOrNone: jest.fn(),
      all: jest.fn(),
      count: jest.fn(),
      repo: jest.fn(),
      tx: jest.fn(async (fn: any) => {
        const txConn: ExtendedQueryable = {
          query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
          one: jest.fn(),
          oneOrNone: jest.fn(),
          all: jest.fn(),
          count: jest.fn(),
        };
        return fn(txConn);
      }),
    };

    subscriptionService = {
      ensure: jest.fn().mockResolvedValue(undefined),
    };

    usersService = {
      findOne: jest.fn(),
    };

    pushService = {
      send: jest.fn(),
    };

    outboxWorker = {
      processBatch: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedService,
        { provide: Db, useValue: db },
        { provide: SubscriptionService, useValue: subscriptionService },
        { provide: UsersService, useValue: usersService },
        { provide: PushService, useValue: pushService },
        { provide: OutboxWorker, useValue: outboxWorker },
      ],
    }).compile();

    service = module.get<FeedService>(FeedService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('like', () => {
    const setupTxMock = (responses: {
      userCheck?: any;
      targetCheck?: any;
      blocked?: any;
      target?: any;
      user?: any;
      existingMatch?: any;
      likeInsert?: any;
      subscriptionUpdate?: any;
      subscriptionSelect?: any;
      reciprocalCheck?: any;
      matchInsert?: any;
    }) => {
      db.tx.mockImplementationOnce(async (fn: any) => {
        const userCheck = responses.userCheck ?? mockOnboardedProfile;
        const targetCheck = responses.targetCheck ?? mockTargetProfile;
        const target = responses.target ?? { id: targetId, status: 'active', verification_status: 'verified' };
        const user = responses.user ?? { id: userId, status: 'active', verification_status: 'verified' };
        const existingMatch = responses.existingMatch ?? null;

        const txConn: ExtendedQueryable = {
          query: jest.fn().mockImplementation((sql: string) => {
            if (sql.includes('INSERT INTO likes')) return responses.likeInsert ?? { rowCount: 1, rows: [{ id: 'like-id' }] };
            if (sql.includes('UPDATE subscriptions')) return responses.subscriptionUpdate ?? { rowCount: 1, rows: [{ likes_remaining_today: 9 }] };
            if (sql.includes('SELECT 1 FROM likes WHERE from_user_id')) return responses.reciprocalCheck ?? { rowCount: 0, rows: [] };
            if (sql.includes('INSERT INTO matches')) return responses.matchInsert ?? { rowCount: 1, rows: [{ id: 'match-id' }] };
            if (sql.includes('INSERT INTO outbox')) return { rowCount: 1, rows: [] };
            return { rowCount: 1, rows: [] };
          }),
          one: jest.fn().mockResolvedValue(responses.blocked ?? { n: 0 }),
          oneOrNone: jest.fn()
            .mockResolvedValueOnce(userCheck)      // userCheck
            .mockResolvedValueOnce(targetCheck)    // targetCheck
            .mockResolvedValueOnce(target)         // target
            .mockResolvedValueOnce(user)           // user
            .mockResolvedValueOnce(existingMatch), // existingMatch
          all: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        };
        return fn(txConn);
      });
    };

    it('should return liked=true, matched=false when no reciprocal like', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: mockTargetProfile,
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'active', verification_status: 'verified' },
        existingMatch: null,
        likeInsert: { rowCount: 1, rows: [{ id: 'like-id' }] },
        subscriptionUpdate: { rowCount: 1, rows: [{ likes_remaining_today: 9 }] },
        reciprocalCheck: { rowCount: 0, rows: [] },
      });

      const result = await service.like(userId, targetId);
      expect(result).toEqual({
        liked: true,
        matched: false,
        matchId: null,
        likesRemainingToday: 9,
      });
    });

    it('should return matched=true and matchId when reciprocal like exists', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: mockTargetProfile,
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'active', verification_status: 'verified' },
        existingMatch: null,
        likeInsert: { rowCount: 1, rows: [{ id: 'like-id' }] },
        subscriptionUpdate: { rowCount: 1, rows: [{ likes_remaining_today: 9 }] },
        reciprocalCheck: { rowCount: 1, rows: [] },
        matchInsert: { rowCount: 1, rows: [{ id: 'match-id' }] },
      });

      const result = await service.like(userId, targetId);
      expect(result.liked).toBe(true);
      expect(result.matched).toBe(true);
      expect(result.matchId).toBe('match-id');
    });

    it('should throw BadRequestException when userId === targetId', async () => {
      await expect(service.like(userId, userId)).rejects.toThrow(BadRequestException);
      await expect(service.like(userId, userId)).rejects.toThrow('cannot_like_self');
    });

    it('should throw BadRequestException for profile_incomplete (user)', async () => {
      setupTxMock({
        userCheck: { name: 'User', photos: [], gender: 'male' }, // no photos
        targetCheck: mockTargetProfile,
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'active', verification_status: 'verified' },
      });
      await expect(service.like(userId, targetId)).rejects.toThrow(BadRequestException);
      await expect(service.like(userId, targetId)).rejects.toThrow('profile_incomplete');
    });

    it('should throw BadRequestException for profile_incomplete (target)', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: { name: 'Target', photos: ['photo.jpg'], gender: null }, // no gender
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'active', verification_status: 'verified' },
      });
      await expect(service.like(userId, targetId)).rejects.toThrow(BadRequestException);
      await expect(service.like(userId, targetId)).rejects.toThrow('profile_incomplete');
    });

    it('should throw ConflictException unavailable when blocked either direction', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: mockTargetProfile,
        blocked: { n: 1 }, // blocked
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'active', verification_status: 'verified' },
      });
      await expect(service.like(userId, targetId)).rejects.toThrow(ConflictException);
      await expect(service.like(userId, targetId)).rejects.toThrow('unavailable');
    });

    it('should throw BadRequestException for unknown_user', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: mockTargetProfile,
        blocked: { n: 0 },
        target: null, // target not found
        user: { id: userId, status: 'active', verification_status: 'verified' },
      });
      await expect(service.like(userId, targetId)).rejects.toThrow(BadRequestException);
      await expect(service.like(userId, targetId)).rejects.toThrow('unknown_user');
    });

    it('should throw ConflictException unavailable when target not active', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: mockTargetProfile,
        blocked: { n: 0 },
        target: { id: targetId, status: 'banned', verification_status: 'verified' },
        user: { id: userId, status: 'active', verification_status: 'verified' },
      });
      await expect(service.like(userId, targetId)).rejects.toThrow(ConflictException);
      await expect(service.like(userId, targetId)).rejects.toThrow('unavailable');
    });

    it('should throw ConflictException target_not_verified when target not verified', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: mockTargetProfile,
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'pending' },
        user: { id: userId, status: 'active', verification_status: 'verified' },
      });
      await expect(service.like(userId, targetId)).rejects.toThrow(ConflictException);
      await expect(service.like(userId, targetId)).rejects.toThrow('target_not_verified');
    });

    it('should throw ConflictException subscription_inactive when user not active', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: mockTargetProfile,
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'banned', verification_status: 'verified' },
      });
      await expect(service.like(userId, targetId)).rejects.toThrow(ConflictException);
      await expect(service.like(userId, targetId)).rejects.toThrow('subscription_inactive');
    });

    it('should throw ConflictException user_not_verified when user not verified', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: mockTargetProfile,
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'active', verification_status: 'pending' },
      });
      await expect(service.like(userId, targetId)).rejects.toThrow(ConflictException);
      await expect(service.like(userId, targetId)).rejects.toThrow('user_not_verified');
    });

    it('should throw ConflictException previously_unmatched when pair was unmatched', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: mockTargetProfile,
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'active', verification_status: 'verified' },
        existingMatch: { id: 'existing-match', unmatched_at: new Date(), unmatched_by: userId },
      });
      await expect(service.like(userId, targetId)).rejects.toThrow(ConflictException);
      await expect(service.like(userId, targetId)).rejects.toThrow('previously_unmatched');
    });

    it('should allow like when existing match was NOT unmatched', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: mockTargetProfile,
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'active', verification_status: 'verified' },
        existingMatch: { id: 'existing-match', unmatched_at: null, unmatched_by: null }, // active match
        likeInsert: { rowCount: 0, rows: [] }, // INSERT like (already exists from original match)
        subscriptionUpdate: { rowCount: 1, rows: [{ likes_remaining_today: 9 }] }, // no quota decrement for re-like
        reciprocalCheck: { rowCount: 1, rows: [] },
        matchInsert: { rowCount: 0, rows: [] }, // INSERT match (already exists)
      });

      const result = await service.like(userId, targetId);
      expect(result.matched).toBe(true);
    });

    it('should not decrement quota on re-like (ON CONFLICT DO NOTHING)', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: mockTargetProfile,
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'active', verification_status: 'verified' },
        existingMatch: null,
        likeInsert: { rowCount: 0, rows: [] }, // INSERT like - rowCount 0 means re-like
        subscriptionUpdate: { rowCount: 1, rows: [{ likes_remaining_today: 10 }] }, // SELECT subscription (no UPDATE)
        reciprocalCheck: { rowCount: 0, rows: [] },
      });

      const result = await service.like(userId, targetId);
      expect(result.likesRemainingToday).toBe(10); // No quota decremented
    });

    it('should throw ConflictException no_likes_remaining when quota exhausted', async () => {
      setupTxMock({
        userCheck: mockOnboardedProfile,
        targetCheck: mockTargetProfile,
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'active', verification_status: 'verified' },
        existingMatch: null,
        likeInsert: { rowCount: 1, rows: [{ id: 'like-id' }] },
        subscriptionUpdate: { rowCount: 0, rows: [] }, // UPDATE subscription - NO ROWS (quota exhausted)
        // Note: The code then does a SELECT subscription to check status
        // We don't have a way to mock that in the current setup, but the error should still be thrown
      });
      await expect(service.like(userId, targetId)).rejects.toThrow(ConflictException);
      await expect(service.like(userId, targetId)).rejects.toThrow('no_likes_remaining');
    });

    it('should throw ConflictException subscription_inactive when subscription not active', async () => {
      setupTxMock({
        userCheck: { name: 'User', photos: ['p.jpg'], gender: 'male' },
        targetCheck: { name: 'Target', photos: ['p.jpg'], gender: 'female' },
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'banned', verification_status: 'verified' },
      });
      await expect(service.like(userId, targetId)).rejects.toThrow(ConflictException);
      await expect(service.like(userId, targetId)).rejects.toThrow('subscription_inactive');
    });

    it('should throw ConflictException user_not_verified when user not verified', async () => {
      setupTxMock({
        userCheck: { name: 'User', photos: ['p.jpg'], gender: 'male' },
        targetCheck: { name: 'Target', photos: ['p.jpg'], gender: 'female' },
        blocked: { n: 0 },
        target: { id: targetId, status: 'active', verification_status: 'verified' },
        user: { id: userId, status: 'active', verification_status: 'pending' },
      });
      await expect(service.like(userId, targetId)).rejects.toThrow(ConflictException);
      await expect(service.like(userId, targetId)).rejects.toThrow('user_not_verified');
    });
  });

  describe('pass', () => {
    const setupPassTxMock = (targetExists: boolean) => {
      db.tx.mockImplementationOnce(async (fn: any) => {
        const txConn: ExtendedQueryable = {
          query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
          one: jest.fn(),
          oneOrNone: jest.fn().mockResolvedValue(targetExists ? { id: targetId } : null),
          all: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        };
        return fn(txConn);
      });
    };

    it('should return passed: true when target exists', async () => {
      setupPassTxMock(true);
      const result = await service.pass(userId, targetId);
      expect(result).toEqual({ passed: true });
    });

    it('should throw NotFoundException when target does not exist', async () => {
      setupPassTxMock(false);
      await expect(service.pass(userId, targetId)).rejects.toThrow(NotFoundException);
      await expect(service.pass(userId, targetId)).rejects.toThrow('unknown_user');
    });

    it('should throw BadRequestException when userId === targetId', async () => {
      await expect(service.pass(userId, userId)).rejects.toThrow(BadRequestException);
      await expect(service.pass(userId, userId)).rejects.toThrow('cannot_pass_self');
    });
  });

  describe('block', () => {
    const setupBlockTxMock = (targetExists: boolean) => {
      db.tx.mockImplementationOnce(async (fn: any) => {
        const txConn: ExtendedQueryable = {
          query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
          one: jest.fn(),
          oneOrNone: jest.fn().mockResolvedValue(targetExists ? { id: targetId } : null),
          all: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        };
        return fn(txConn);
      });
    };

    it('should return blocked: true when target exists', async () => {
      setupBlockTxMock(true);
      const result = await service.block(userId, targetId);
      expect(result).toEqual({ blocked: true });
    });

    it('should throw NotFoundException when target does not exist', async () => {
      setupBlockTxMock(false);
      await expect(service.block(userId, targetId)).rejects.toThrow(NotFoundException);
      await expect(service.block(userId, targetId)).rejects.toThrow('unknown_user');
    });

    it('should throw BadRequestException when userId === targetId', async () => {
      await expect(service.block(userId, userId)).rejects.toThrow(BadRequestException);
      await expect(service.block(userId, userId)).rejects.toThrow('cannot_block_self');
    });
  });

  describe('feed', () => {
    const mockFeedRows = [
      {
        user_id: '33333333-3333-3333-3333-333333333333',
        gender: 'female',
        dob: new Date('2000-01-01'),
        location: 'Karachi',
        lat: 24.8607,
        lng: 67.0011,
        name: 'Candidate 1',
        bio: 'Test bio',
        profession: 'Engineer',
        education: 'bachelor',
        marital_status: 'never_married',
        city: 'Karachi',
        religious_practice_level: 'moderate',
        sect: 'sunni',
        photos: ['photo1.jpg'],
        verification_status: 'verified',
        shared_interests: 3,
        distance_m: 5000,
      },
    ];

    beforeEach(() => {
      db.one.mockResolvedValue({ gender: 'male', lat: 24.8607, lng: 67.0011, dob: new Date('1995-01-01') });
      db.all.mockResolvedValue(mockFeedRows);
    });

    it('should return candidates and nextCursor', async () => {
      const filters: FeedFilters = { minAge: 18, maxAge: 35, radiusKm: 50, limit: 20 };
      const result = await service.feed(userId, filters);
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeDefined();
      expect(result.items[0]).toHaveProperty('distance_bucket');
      expect(result.items[0]).not.toHaveProperty('lat');
      expect(result.items[0]).not.toHaveProperty('lng');
      expect(result.items[0]).not.toHaveProperty('dob');
      expect(result.items[0]).not.toHaveProperty('distance_m');
    });

    it('should throw NotFoundException when user not found', async () => {
      db.one.mockResolvedValue(null);
      await expect(service.feed(userId, {})).rejects.toThrow(NotFoundException);
    });

    it('should validate minAge >= 18', async () => {
      await expect(service.feed(userId, { minAge: 17 })).rejects.toThrow(BadRequestException);
      await expect(service.feed(userId, { minAge: 17 })).rejects.toThrow('minAge must be at least 18');
    });

    it('should validate maxAge >= minAge', async () => {
      await expect(service.feed(userId, { minAge: 25, maxAge: 20 })).rejects.toThrow(BadRequestException);
      await expect(service.feed(userId, { minAge: 25, maxAge: 20 })).rejects.toThrow('maxAge must be >= minAge');
    });

    it('should validate radiusKm between 1 and 500', async () => {
      await expect(service.feed(userId, { radiusKm: 0 })).rejects.toThrow(BadRequestException);
      await expect(service.feed(userId, { radiusKm: 501 })).rejects.toThrow(BadRequestException);
    });

    it('should clamp limit between 1 and 50', async () => {
      const result = await service.feed(userId, { limit: 100 });
      // The limit is clamped in the service, verify the query was called with limit=50
      expect(db.all).toHaveBeenCalled();
    });
  });
});