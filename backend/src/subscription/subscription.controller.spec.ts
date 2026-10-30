import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService, WebhookEvent } from './subscription.service';
import { UsersService } from '../users/users.service';
import { UserRow } from '../db/types';

describe('SubscriptionController', () => {
  let controller: SubscriptionController;
  let subscriptionService: jest.Mocked<SubscriptionService>;
  let usersService: jest.Mocked<UsersService>;

  const mockUser: UserRow = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    phone: null,
    phone_verified: false,
    gender: 'male',
    dob: new Date('2000-01-01'),
    location: 'Test City',
    lat: 0,
    lng: 0,
    device_id: null,
    auth_provider: 'email',
    provider_subject: null,
    email_verified: true,
    firebase_uid: null,
    status: 'active',
    is_admin: false,
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockSubscriptionService = {
      status: jest.fn(),
      applyWebhook: jest.fn(),
      ensure: jest.fn(),
      nightlyQuotaReset: jest.fn(),
    };

    const mockUsersService = {
      requireOnboarded: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionController],
      providers: [
        { provide: SubscriptionService, useValue: mockSubscriptionService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    controller = module.get<SubscriptionController>(SubscriptionController);
    subscriptionService = module.get(SubscriptionService);
    usersService = module.get(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSubscription', () => {
    it('should return subscription status for onboarded user', async () => {
      usersService.requireOnboarded.mockResolvedValue(mockUser);
      subscriptionService.status.mockResolvedValue({
        status: 'active',
        plan: 'plus',
        renewsAt: new Date(),
        startedAt: new Date(),
        likesRemainingToday: 25,
        dailyAllowance: 50,
        quotaResetAt: new Date(),
        canSendLikes: true,
      });

      const result = await controller.getSubscription(mockUser.id);
      expect(result.plan).toBe('plus');
      expect(result.canSendLikes).toBe(true);
    });
  });

  describe('status', () => {
    it('should return subscription status for onboarded user', async () => {
      usersService.requireOnboarded.mockResolvedValue(mockUser);
      subscriptionService.status.mockResolvedValue({
        status: 'active',
        plan: 'gold',
        renewsAt: new Date(),
        startedAt: new Date(),
        likesRemainingToday: 500,
        dailyAllowance: 999,
        quotaResetAt: new Date(),
        canSendLikes: true,
      });

      const result = await controller.status(mockUser.id);
      expect(result.plan).toBe('gold');
    });
  });

  describe('webhook', () => {
    const validEvent: WebhookEvent = {
      id: 'evt_test_123',
      type: 'INITIAL_PURCHASE',
      app_user_id: mockUser.id,
      product_id: 'rishta_plus_monthly',
      expiration_at_ms: Date.now() + 86400000 * 30,
      event_timestamp_ms: Date.now(),
    };

    it('should return 200 for malformed event (missing type)', async () => {
      const result = await controller.webhook({ event: { app_user_id: mockUser.id, type: '' } }, 'secret');
      expect(result).toEqual({ kind: 'noop', applied: false });
    });

    it('should return 200 for malformed event (missing app_user_id)', async () => {
      const result = await controller.webhook({ event: { type: 'INITIAL_PURCHASE' } }, 'secret');
      expect(result).toEqual({ kind: 'noop', applied: false });
    });

    it('should return 200 for null body', async () => {
      const result = await controller.webhook(null as any, 'secret');
      expect(result).toEqual({ kind: 'noop', applied: false });
    });

    it('should call applyWebhook with event and authorization header', async () => {
      const mockResult = {
        kind: 'set' as const,
        applied: true as const,
        status: 'active' as const,
        plan: 'plus',
        previousStatus: 'active' as const,
        previousPlan: 'free',
      };
      subscriptionService.applyWebhook.mockResolvedValue(mockResult);

      const result = await controller.webhook({ event: validEvent }, 'test-secret');

      expect(subscriptionService.applyWebhook).toHaveBeenCalledWith(validEvent, 'test-secret');
      expect(result).toEqual(mockResult);
    });

    it('should return 200 even when service throws UnauthorizedException (no retries)', async () => {
      subscriptionService.applyWebhook.mockRejectedValue(new UnauthorizedException('invalid_webhook_secret'));

      const result = await controller.webhook({ event: validEvent }, 'wrong-secret');
      expect(result).toEqual({ kind: 'noop', applied: false });
    });

    it('should return 200 for any service error (no retries)', async () => {
      subscriptionService.applyWebhook.mockRejectedValue(new Error('unexpected error'));

      const result = await controller.webhook({ event: validEvent }, 'secret');
      expect(result).toEqual({ kind: 'noop', applied: false });
    });
  });
});