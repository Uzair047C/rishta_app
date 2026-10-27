import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { SubscriptionService, WebhookEvent } from './subscription.service';
import { Db } from '../db/db';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let db: jest.Mocked<Db>;

  const mockUser = { id: '123e4567-e89b-12d3-a456-426614174000' };
  const mockSub = {
    user_id: mockUser.id,
    status: 'active' as const,
    plan: 'free' as const,
    daily_allowance: 10,
    likes_remaining_today: 10,
    started_at: new Date(),
    renews_at: null,
    quota_reset_at: new Date(),
    last_event_at_ms: null,
  };

  beforeEach(async () => {
    const mockDb = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
      one: jest.fn(),
      all: jest.fn(),
      count: jest.fn(),
      tx: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: Db, useValue: mockDb },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
    db = module.get(Db);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('applyWebhook', () => {
    const validSecret = 'test-secret';
    process.env.REVENUECAT_WEBHOOK_SECRET = validSecret;

    const createBaseEvent = (overrides: Partial<WebhookEvent> = {}): WebhookEvent => ({
      id: 'evt_test_123',
      type: 'INITIAL_PURCHASE',
      app_user_id: mockUser.id,
      product_id: 'rishta_plus_monthly',
      expiration_at_ms: Date.now() + 86400000 * 30, // 30 days from now
      event_timestamp_ms: Date.now(),
      ...overrides,
    });

    it('should reject invalid secret with UnauthorizedException', async () => {
      const event = createBaseEvent();
      await expect(service.applyWebhook(event, 'wrong-secret')).rejects.toThrow(UnauthorizedException);
    });

    it('should accept valid secret with timing-safe comparison', async () => {
      const event = createBaseEvent();
      // Mock the sequence of calls:
      // 1. webhook_events lookup (dedup check) -> null
      // 2. users lookup -> mockUser
      // 3. ensure -> subscription lookup -> mockSub
      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure subscription lookup

      const result = await service.applyWebhook(event, validSecret);
      expect(result.applied).toBe(true);
      expect(result.status).toBe('active');
    });

    it('should deduplicate by event id (replayed event is no-op)', async () => {
      const event = createBaseEvent();

      // First call sequence
      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup - not found
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure

      await service.applyWebhook(event, validSecret);

      // Second call with same event id
      db.one
        .mockResolvedValueOnce({ id: event.id }) // webhook_events lookup - found
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure

      const result = await service.applyWebhook(event, validSecret);
      expect(result.applied).toBe(false);
    });

    it('should handle TRANSFER event (no app_user_id)', async () => {
      const transferEvent: WebhookEvent = {
        id: 'evt_transfer_123',
        type: 'TRANSFER',
        event_timestamp_ms: Date.now(),
      };

      db.one.mockResolvedValueOnce(null); // webhook_events lookup

      const result = await service.applyWebhook(transferEvent, validSecret);
      expect(result.applied).toBe(true);
      expect(result.status).toBe('inactive');
    });

    it('should return 200 for non-UUID app_user_id (not 500)', async () => {
      const invalidEvent = createBaseEvent({ app_user_id: 'not-a-uuid' });
      db.one.mockResolvedValueOnce(null); // webhook_events lookup

      const result = await service.applyWebhook(invalidEvent, validSecret);
      expect(result.applied).toBe(true); // Event recorded
      expect(result.status).toBe('inactive');
    });

    it('should return 200 for missing app_user_id', async () => {
      const invalidEvent = createBaseEvent({ app_user_id: undefined });
      db.one.mockResolvedValueOnce(null); // webhook_events lookup

      const result = await service.applyWebhook(invalidEvent, validSecret);
      expect(result.applied).toBe(true);
      expect(result.status).toBe('inactive');
    });

    it('should ignore out-of-order EXPIRATION after RENEWAL', async () => {
      const now = Date.now();
      const renewalEvent = createBaseEvent({
        id: 'evt_renewal_123',
        type: 'RENEWAL',
        event_timestamp_ms: now
      });

      const expirationEvent = createBaseEvent({
        id: 'evt_expiration_123',
        type: 'EXPIRATION',
        event_timestamp_ms: now - 1000, // Older than renewal
      });

      // First call - renewal
      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure

      await service.applyWebhook(renewalEvent, validSecret);

      // Second call - out-of-order expiration
      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup for expiration
        .mockResolvedValueOnce(mockUser) // user lookup for expiration
        .mockResolvedValueOnce({ last_event_at_ms: now }); // subscription lookup for out-of-order check

      const result = await service.applyWebhook(expirationEvent, validSecret);
      expect(result.applied).toBe(false);
    });

    it('should not change state for TEST event', async () => {
      const testEvent = createBaseEvent({ id: 'evt_test_456', type: 'TEST' });

      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure

      const result = await service.applyWebhook(testEvent, validSecret);
      expect(result.applied).toBe(true); // Event recorded but no state change
      expect(result.status).toBe('inactive');
    });

    it('should not change state for SUBSCRIBER_ALIAS event', async () => {
      const aliasEvent = createBaseEvent({ id: 'evt_alias_123', type: 'SUBSCRIBER_ALIAS' });

      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure

      const result = await service.applyWebhook(aliasEvent, validSecret);
      expect(result.applied).toBe(true);
      expect(result.status).toBe('inactive');
    });

    it('should set status to active for NON_RENEWING_PURCHASE event', async () => {
      const purchaseEvent = createBaseEvent({ id: 'evt_nonrenew_123', type: 'NON_RENEWING_PURCHASE', product_id: 'rishta_lifetime' });

      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure

      const result = await service.applyWebhook(purchaseEvent, validSecret);
      expect(result.applied).toBe(true);
      expect(result.status).toBe('active');
    });

    it('should not change state for INVOICE_ISSUANCE event', async () => {
      const invoiceEvent = createBaseEvent({ id: 'evt_invoice_123', type: 'INVOICE_ISSUANCE' });

      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure

      const result = await service.applyWebhook(invoiceEvent, validSecret);
      expect(result.applied).toBe(true);
      expect(result.status).toBe('inactive');
    });

    it('should keep user active during BILLING_ISSUE grace period', async () => {
      const billingEvent = createBaseEvent({ id: 'evt_billing_123', type: 'BILLING_ISSUE', expiration_at_ms: Date.now() + 86400000 * 30 });

      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure

      const result = await service.applyWebhook(billingEvent, validSecret);
      expect(result.applied).toBe(true);
      expect(result.status).toBe('active');
    });

    it('should set status to expired for EXPIRATION event', async () => {
      const expirationEvent = createBaseEvent({ id: 'evt_expiration_456', type: 'EXPIRATION' });

      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure

      const result = await service.applyWebhook(expirationEvent, validSecret);
      expect(result.applied).toBe(true);
      expect(result.status).toBe('expired');
    });

    it('should handle SUBSCRIPTION_PAUSED as active', async () => {
      const pausedEvent = createBaseEvent({ id: 'evt_paused_123', type: 'SUBSCRIPTION_PAUSED' });

      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure

      const result = await service.applyWebhook(pausedEvent, validSecret);
      expect(result.applied).toBe(true);
      expect(result.status).toBe('active');
    });

    it('should handle SUBSCRIPTION_EXTENDED as active', async () => {
      const extendedEvent = createBaseEvent({ id: 'evt_extended_123', type: 'SUBSCRIPTION_EXTENDED' });

      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure

      const result = await service.applyWebhook(extendedEvent, validSecret);
      expect(result.applied).toBe(true);
      expect(result.status).toBe('active');
    });

    it('should not write NULL renews_at when expiration_at_ms missing on active paid plan', async () => {
      const eventNoExpiration = createBaseEvent({ id: 'evt_no_exp_123', expiration_at_ms: undefined });

      // Mock existing subscription with renews_at and plus plan
      const existingSub = { ...mockSub, renews_at: new Date('2026-12-01'), plan: 'plus' };

      // Mock the call sequence (5 calls to db.one):
      // 1. webhook_events lookup -> null
      // 2. user lookup -> mockUser
      // 3. out-of-order check (last_event_at_ms) -> null (no previous event)
      // 4. ensure() SELECT -> existingSub
      // 5. extra renews_at lookup -> { renews_at: existingSub.renews_at }
      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce({ last_event_at_ms: null }) // out-of-order check
        .mockResolvedValueOnce(existingSub) // ensure() SELECT
        .mockResolvedValueOnce({ renews_at: existingSub.renews_at }); // extra renews_at lookup

      await service.applyWebhook(eventNoExpiration, validSecret);

      // Find the UPDATE subscriptions call
      const updateCalls = db.query.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('UPDATE subscriptions')
      );
      expect(updateCalls.length).toBeGreaterThan(0);

      const updateCall = updateCalls[updateCalls.length - 1];
      // The 5th parameter should be the existing renews_at (not null)
      // The 6th parameter is event_timestamp_ms
      const params = updateCall[1] as unknown[];
      expect(params[4]).toEqual(existingSub.renews_at); // renews_at should not be null
      expect(params[5]).toEqual(eventNoExpiration.event_timestamp_ms);
    });

    it('should return 200 for unknown user (not 500)', async () => {
      const event = createBaseEvent();

      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(null); // user lookup - not found

      const result = await service.applyWebhook(event, validSecret);
      expect(result.applied).toBe(true); // Event recorded
      expect(result.status).toBe('inactive');
    });

    it('should handle CANCELLATION as active (access until renews_at)', async () => {
      const cancelEvent = createBaseEvent({ id: 'evt_cancel_123', type: 'CANCELLATION' });

      db.one
        .mockResolvedValueOnce(null) // webhook_events lookup
        .mockResolvedValueOnce(mockUser) // user lookup
        .mockResolvedValueOnce(mockSub); // ensure

      const result = await service.applyWebhook(cancelEvent, validSecret);
      expect(result.applied).toBe(true);
      expect(result.status).toBe('active');
    });
  });

  describe('nightlyQuotaReset', () => {
    it('should reset quota for active subscriptions', async () => {
      db.query
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // lapsed
        .mockResolvedValueOnce({ rowCount: 5, rows: [] }); // reset

      await service.nightlyQuotaReset();

      expect(db.query).toHaveBeenCalledTimes(2);
    });

    it('should be idempotent per day using quota_reset_at', async () => {
      db.query
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // No rows to reset if already reset today

      await service.nightlyQuotaReset();

      // Verify the reset query includes the idempotency check
      const resetCall = db.query.mock.calls[1];
      expect(resetCall[0]).toContain('quota_reset_at < CURRENT_DATE');
    });
  });

  describe('ensure', () => {
    it('should create subscription row for new user', async () => {
      db.query.mockResolvedValue({ rowCount: 1, rows: [] });
      db.one.mockResolvedValue(mockSub);

      const result = await service.ensure(mockUser.id);
      expect(result).toEqual(mockSub);
    });
  });

  describe('status', () => {
    it('should return subscription status with computed fields', async () => {
      db.one.mockResolvedValue(mockSub);

      const result = await service.status(mockUser.id);
      expect(result).toEqual({
        status: 'active',
        plan: 'free',
        renewsAt: mockSub.renews_at,
        startedAt: mockSub.started_at,
        likesRemainingToday: 10,
        dailyAllowance: 10,
        quotaResetAt: mockSub.quota_reset_at,
        canSendLikes: true,
      });
    });

    it('should return canSendLikes: false when no likes remaining', async () => {
      db.one.mockResolvedValue({ ...mockSub, likes_remaining_today: 0 });

      const result = await service.status(mockUser.id);
      expect(result.canSendLikes).toBe(false);
    });

    it('should return canSendLikes: false when status is expired', async () => {
      db.one.mockResolvedValue({ ...mockSub, status: 'expired', likes_remaining_today: 10 });

      const result = await service.status(mockUser.id);
      expect(result.canSendLikes).toBe(false);
    });
  });
});