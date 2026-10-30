import { Inject, Injectable, Logger, UnauthorizedException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Db } from '../db/db';
import { SubscriptionRow, SubscriptionStatus } from '../db/types';
import { PgBossService } from '../pg-boss/pg-boss.service';
import { PG_BOSS_SERVICE } from '../pg-boss/pg-boss.module';
import * as crypto from 'crypto';

/** Product id -> plan. RevenueCat sends the product, not our plan name. */
const PLAN_BY_PRODUCT: Record<string, string> = {
  rishta_plus_monthly: 'plus',
  rishta_plus_yearly: 'plus',
  rishta_gold_monthly: 'gold',
  rishta_gold_yearly: 'gold',
};

/** Plan -> daily like allowance (injected via ConfigService) */
@Injectable()
export class SubscriptionService implements OnModuleInit {
  private readonly log = new Logger(SubscriptionService.name);

  constructor(
    private readonly db: Db,
    private readonly config: ConfigService,
    @Inject(PG_BOSS_SERVICE) private readonly pgBoss: PgBossService,
  ) {}

  private getAllowanceByPlan(): Record<string, number> {
    return {
      free: this.config.get<number>('FREE_PLAN_DAILY_LIKES') ?? 10,
      plus: 50,
      gold: 999,
    };
  }

  /**
   * Every user has exactly one subscription row, including free users, so the
   * atomic decrement in FeedService.like is always a single UPDATE.
   */
  async ensure(userId: string): Promise<SubscriptionRow> {
    const allowance = this.getAllowanceByPlan().free;
    await this.db.query(
      `INSERT INTO subscriptions (user_id, status, plan, daily_allowance, likes_remaining_today)
       VALUES ($1, 'active', 'free', $2, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, allowance],
    );
    return (await this.db.one<SubscriptionRow>('SELECT * FROM subscriptions WHERE user_id = $1', [
      userId,
    ])) as SubscriptionRow;
  }

  async status(userId: string) {
    const sub = await this.ensure(userId);
    return {
      status: sub.status,
      plan: sub.plan,
      renewsAt: sub.renews_at,
      startedAt: sub.started_at,
      likesRemainingToday: sub.likes_remaining_today,
      dailyAllowance: sub.daily_allowance,
      quotaResetAt: sub.quota_reset_at,
      canSendLikes: sub.status === 'active' && sub.likes_remaining_today > 0,
    };
  }

  /**
   * Spec 2.3 — quota resets on a schedule, never on login.
   * Uses Asia/Karachi timezone as specified.
   * Idempotent per day using quota_reset_at.
   * Fixed timezone logic: uses date_trunc at PKT then converts back to UTC.
   */
  async nightlyQuotaReset(): Promise<void> {
    // Expiry: active subscriptions where renews_at < now()
    const lapsed = await this.db.query(
      `UPDATE subscriptions SET status = 'expired'
        WHERE status = 'active' AND renews_at IS NOT NULL AND renews_at < now()`,
    );

    // Quota reset: compare quota_reset_at to start of PKT day in UTC
    // date_trunc('day', now() AT TIME ZONE 'Asia/Karachi') gives start of PKT day as timestamp without TZ
    // AT TIME ZONE 'Asia/Karachi' converts it back to timestamptz (UTC)
    const reset = await this.db.query(
      `UPDATE subscriptions
          SET likes_remaining_today = daily_allowance, quota_reset_at = now()
        WHERE status = 'active'
          AND (quota_reset_at IS NULL
            OR quota_reset_at < (date_trunc('day', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi'))`,
    );
    this.log.log(`quota reset: ${reset.rowCount ?? 0} active, ${lapsed.rowCount ?? 0} lapsed`);
  }

  async onModuleInit(): Promise<void> {
    // Startup catch-up: run quota reset once at startup
    await this.nightlyQuotaReset();

    // Schedule daily quota reset at midnight PKT via pg-boss
    await this.pgBoss.schedule(
      'quota.reset',
      '0 0 * * *', // Midnight UTC - pg-boss minimum is 1 minute, but cron is daily
      {},
      { timezone: 'Asia/Karachi' },
    );

    // Define the worker
    await this.pgBoss.subscribe('quota.reset', async () => {
      await this.nightlyQuotaReset();
    }, { teamSize: 1, teamConcurrency: 1 });

    this.log.log('Quota reset job scheduled (daily at midnight PKT)');
  }

  /**
   * RevenueCat / Play Billing webhook.
   * - Atomic deduplication via webhook_events table (INSERT ON CONFLICT)
   * - Entire state change in single transaction
   * - Returns {kind: 'noop'} for no-op events, {kind: 'set', ...} for state changes
   */
  async applyWebhook(
    event: WebhookEvent,
    secret?: string,
  ): Promise<
    | { kind: 'noop'; applied: false }
    | { kind: 'set'; applied: true; status: SubscriptionStatus; plan: string; previousStatus: SubscriptionStatus; previousPlan: string }
  > {
    const expected = this.config.get<string>('REVENUECAT_WEBHOOK_SECRET');
    if (!expected) {
      this.log.error('REVENUECAT_WEBHOOK_SECRET not configured');
      throw new UnauthorizedException('webhook_not_configured');
    }
    // Timing-safe comparison
    const expectedBuf = Buffer.from(expected);
    const secretBuf = Buffer.from(secret ?? '');
    if (expectedBuf.length !== secretBuf.length || !crypto.timingSafeEqual(expectedBuf, secretBuf)) {
      throw new UnauthorizedException('invalid_webhook_secret');
    }

    return this.db.tx(async (conn) => {
      // Atomic deduplication: INSERT ON CONFLICT DO NOTHING
      let isDuplicate = false;
      if (event.id) {
        const result = await conn.query(
          'INSERT INTO webhook_events (id) VALUES ($1) ON CONFLICT DO NOTHING',
          [event.id],
        );
        isDuplicate = result.rowCount === 0;
      }

      if (isDuplicate) {
        this.log.debug(`Duplicate event ignored: ${event.id}`);
        return { kind: 'noop', applied: false };
      }

      // TRANSFER is informational only
      if (event.type === 'TRANSFER') {
        this.log.log('TRANSFER event received - no user action needed');
        return { kind: 'noop', applied: false };
      }

      // Validate app_user_id as UUID
      if (!event.app_user_id || !this.isValidUuid(event.app_user_id)) {
        this.log.warn(`Invalid or missing app_user_id: ${event.app_user_id}, returning 200 to avoid retries`);
        return { kind: 'noop', applied: false };
      }

      const user = await conn.oneOrNone<{ id: string }>('SELECT id FROM users WHERE id = $1', [
        event.app_user_id,
      ]);
      if (!user) {
        this.log.warn(`User not found: ${event.app_user_id}`);
        return { kind: 'noop', applied: false };
      }

      // Out-of-order protection (atomic in transaction)
      if (event.event_timestamp_ms) {
        const sub = await conn.oneOrNone<{ last_event_at_ms: number | null }>(
          'SELECT last_event_at_ms FROM subscriptions WHERE user_id = $1',
          [event.app_user_id],
        );
        if (sub?.last_event_at_ms && event.event_timestamp_ms <= sub.last_event_at_ms) {
          this.log.debug(`Out-of-order event ignored for user ${event.app_user_id}: ${event.event_timestamp_ms} <= ${sub.last_event_at_ms}`);
          return { kind: 'noop', applied: false };
        }
      }

      await this.ensure(user.id);
      const plan = PLAN_BY_PRODUCT[event.product_id ?? ''] ?? 'free';

      // Handle unknown product_id on active events
      const isActiveEvent = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'TEMPORARY_ENTITLEMENT_GRANT', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED'].includes(event.type);
      if (isActiveEvent && plan === 'free' && event.product_id) {
        this.log.error(`Unknown product_id for active event: ${event.product_id} (user: ${user.id})`);
        // Don't downgrade to free - treat as no-op
        return { kind: 'noop', applied: false };
      }

      const currentSub = await conn.oneOrNone<SubscriptionRow>('SELECT * FROM subscriptions WHERE user_id = $1', [user.id]);
      const previousStatus = currentSub?.status ?? 'active';
      const previousPlan = currentSub?.plan ?? 'free';

      const eventResult = this.processEventType(event.type as WebhookEventType);

      // Informational events: no state change
      if (eventResult.kind === 'noop') {
        return { kind: 'noop', applied: false };
      }

      // Handle expiration_at_ms: only set renews_at if present, don't write NULL for active paid plans
      let renewsAt: Date | null = null;
      if (event.expiration_at_ms !== undefined && event.expiration_at_ms !== null) {
        renewsAt = new Date(event.expiration_at_ms);
      } else if (eventResult.status === 'active' && plan !== 'free') {
        // Active paid plan but no expiration_at_ms - keep existing renews_at
        renewsAt = currentSub?.renews_at ?? null;
      }

      // Determine new allowance
      const newAllowance = this.getAllowanceByPlan()[plan] ?? this.getAllowanceByPlan().free;

      // Determine likes_remaining_today:
      // - Quota reset ONLY on INITIAL_PURCHASE, PRODUCT_CHANGE (upgrade), and nightly job
      // - CANCELLATION, BILLING_ISSUE, SUBSCRIPTION_PAUSED, EXPIRATION: keep existing likes_remaining_today (don't refill)
      const shouldResetQuota = ['INITIAL_PURCHASE', 'PRODUCT_CHANGE'].includes(event.type);
      const newLikesRemaining = shouldResetQuota ? newAllowance : (currentSub?.likes_remaining_today ?? 0);

      await conn.query(
        `UPDATE subscriptions
            SET status = $2,
                plan = $3,
                daily_allowance = $4,
                likes_remaining_today = $5,
                started_at = COALESCE(started_at, now()),
                renews_at = $6,
                last_event_at_ms = $7
          WHERE user_id = $1`,
        [user.id, eventResult.status, plan, newAllowance, newLikesRemaining, renewsAt, event.event_timestamp_ms ?? null],
      );

      return {
        kind: 'set',
        applied: true,
        status: eventResult.status,
        plan,
        previousStatus,
        previousPlan,
      };
    });
  }

  private isValidUuid(val: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(val);
  }

  /**
   * Maps RevenueCat event types to our subscription status and behavior.
   * Returns {kind: 'noop'} for events that don't change state.
   * Returns {kind: 'set', status: ...} for events that change state.
   */
  private processEventType(type: WebhookEventType): { kind: 'noop' } | { kind: 'set'; status: SubscriptionStatus } {
    switch (type) {
      // Active access - reset quota on INITIAL_PURCHASE and PRODUCT_CHANGE
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'TEMPORARY_ENTITLEMENT_GRANT':
      case 'NON_RENEWING_PURCHASE':
      case 'SUBSCRIPTION_EXTENDED':
        return { kind: 'set', status: 'active' };

      // PRODUCT_CHANGE: active, but quota reset only on upgrade (handled in applyWebhook)
      case 'PRODUCT_CHANGE':
        return { kind: 'set', status: 'active' };

      // CANCELLATION: user has access until renews_at, then expires. Don't refill quota.
      case 'CANCELLATION':
        return { kind: 'set', status: 'active' };

      // EXPIRATION: access ended
      case 'EXPIRATION':
        return { kind: 'set', status: 'expired' };

      // BILLING_ISSUE: grace period - user still has access until expiration_at_ms passes. Don't refill quota.
      case 'BILLING_ISSUE':
        return { kind: 'set', status: 'active' };

      // SUBSCRIPTION_PAUSED: paused - NO active access. Don't refill quota.
      case 'SUBSCRIPTION_PAUSED':
        return { kind: 'set', status: 'paused' };

      // Informational events - true no-ops
      case 'SUBSCRIBER_ALIAS':
      case 'TEST':
      case 'INVOICE_ISSUANCE':
        return { kind: 'noop' };

      default:
        // Unknown events are no-ops
        this.log.warn(`Unknown webhook event type: ${type}`);
        return { kind: 'noop' };
    }
  }
}

/** RevenueCat webhook event types from their docs */
export type WebhookEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'PRODUCT_CHANGE'
  | 'UNCANCELLATION'
  | 'TEMPORARY_ENTITLEMENT_GRANT'
  | 'CANCELLATION'
  | 'EXPIRATION'
  | 'BILLING_ISSUE'
  | 'SUBSCRIPTION_PAUSED'
  | 'SUBSCRIPTION_EXTENDED'
  | 'NON_RENEWING_PURCHASE'
  | 'SUBSCRIBER_ALIAS'
  | 'TEST'
  | 'INVOICE_ISSUANCE'
  | 'TRANSFER';

export interface WebhookEvent {
  type: string;
  app_user_id?: string; // Optional for TRANSFER
  product_id?: string;
  expiration_at_ms?: number;
  period_type?: string;
  event_timestamp_ms?: number;
  id?: string; // RevenueCat event id for deduplication
}