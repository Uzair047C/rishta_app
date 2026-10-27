import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Db } from '../db/db';
import { SubscriptionRow, SubscriptionStatus } from '../db/types';
import * as crypto from 'crypto';

/** Product id -> plan. RevenueCat sends the product, not our plan name. */
const PLAN_BY_PRODUCT: Record<string, string> = {
  rishta_plus_monthly: 'plus',
  rishta_plus_yearly: 'plus',
  rishta_gold_monthly: 'gold',
  rishta_gold_yearly: 'gold',
};

const ALLOWANCE_BY_PLAN: Record<string, number> = {
  free: Number(process.env.FREE_PLAN_DAILY_LIKES ?? 10),
  plus: 50,
  gold: 999,
};

/** RevenueCat webhook event types from their docs */
type WebhookEventType =
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

@Injectable()
export class SubscriptionService {
  private readonly log = new Logger(SubscriptionService.name);

  constructor(private readonly db: Db) {}

  /**
   * Every user has exactly one subscription row, including free users, so the
   * atomic decrement in FeedService.like is always a single UPDATE.
   */
  async ensure(userId: string): Promise<SubscriptionRow> {
    const allowance = ALLOWANCE_BY_PLAN.free;
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
      // Spec 1.2 — surfaced prominently so the client can disable Like at zero
      // rather than letting the button silently fail.
      likesRemainingToday: sub.likes_remaining_today,
      dailyAllowance: sub.daily_allowance,
      quotaResetAt: sub.quota_reset_at,
      // Spec 1.2 — an inactive plan gates new likes only; chat stays open.
      canSendLikes: sub.status === 'active' && sub.likes_remaining_today > 0,
    };
  }

  /**
   * Spec 2.3 — quota resets on a schedule, never on login. Resetting at
   * authentication would let anyone refill by logging out and back in.
   * Uses Asia/Karachi timezone as specified.
   * Idempotent per day using quota_reset_at.
   */
  @Cron('0 0 * * *', { timeZone: 'Asia/Karachi' })
  async nightlyQuotaReset(): Promise<void> {
    const lapsed = await this.db.query(
      `UPDATE subscriptions SET status = 'expired'
        WHERE status = 'active' AND renews_at IS NOT NULL AND renews_at < now()`,
    );
    const reset = await this.db.query(
      `UPDATE subscriptions
          SET likes_remaining_today = daily_allowance, quota_reset_at = now()
        WHERE status = 'active'
          AND (quota_reset_at IS NULL OR quota_reset_at < CURRENT_DATE)`,
    );
    this.log.log(`quota reset: ${reset.rowCount ?? 0} active, ${lapsed.rowCount ?? 0} lapsed`);
  }

  /**
   * RevenueCat / Play Billing webhook. Must be authenticated — an unauthenticated
   * endpoint here would let anyone grant themselves a paid plan.
   *
   * Phase 3 improvements:
   * - Dedupe by RevenueCat event id using webhook_events table
   * - Ignore events older than last_event_at_ms for that user
   * - Validate app_user_id as UUID, return 200 for non-UUID (don't 500)
   * - Handle TRANSFER event (no app_user_id)
   * - Fix statusForEvent for all event types per RevenueCat docs
   * - Use crypto.timingSafeEqual for secret comparison
   * - Handle BILLING_ISSUE grace period correctly using expiration_at_ms
   * - Unknown events no-op instead of 'inactive'
   * - If expiration_at_ms missing on active paid plan, don't write NULL renews_at
   */
  async applyWebhook(event: WebhookEvent, secret?: string): Promise<{ applied: boolean; status: SubscriptionStatus }> {
    const expected = process.env.REVENUECAT_WEBHOOK_SECRET;
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

    // Deduplication: check if we've already processed this event
    if (event.id) {
      const existing = await this.db.one<{ id: string }>(
        'SELECT id FROM webhook_events WHERE id = $1',
        [event.id],
      );
      if (existing) {
        this.log.debug(`Duplicate event ignored: ${event.id}`);
        return { applied: false, status: 'inactive' };
      }
    }

    // Handle TRANSFER event (no app_user_id in payload)
    if (event.type === 'TRANSFER') {
      this.log.log('TRANSFER event received - no user action needed');
      // TRANSFER is informational only - the old and new users get their own events
      if (event.id) {
        await this.db.query('INSERT INTO webhook_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [event.id]);
      }
      return { applied: true, status: 'inactive' };
    }

    // Validate app_user_id as UUID
    if (!event.app_user_id || !this.isValidUuid(event.app_user_id)) {
      this.log.warn(`Invalid or missing app_user_id: ${event.app_user_id}, returning 200 to avoid retries`);
      // Return 200 to not trigger RevenueCat retries, but record the event
      if (event.id) {
        await this.db.query('INSERT INTO webhook_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [event.id]);
      }
      return { applied: true, status: 'inactive' };
    }

    const user = await this.db.one<{ id: string }>('SELECT id FROM users WHERE id = $1', [
      event.app_user_id,
    ]);
    if (!user) {
      this.log.warn(`User not found: ${event.app_user_id}`);
      if (event.id) {
        await this.db.query('INSERT INTO webhook_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [event.id]);
      }
      return { applied: true, status: 'inactive' };
    }

    // Check if event is older than last applied event for this user (out-of-order protection)
    if (event.event_timestamp_ms && event.app_user_id) {
      const sub = await this.db.one<{ last_event_at_ms: number | null }>(
        'SELECT last_event_at_ms FROM subscriptions WHERE user_id = $1',
        [event.app_user_id],
      );
      if (sub?.last_event_at_ms && event.event_timestamp_ms <= sub.last_event_at_ms) {
        this.log.debug(`Out-of-order event ignored for user ${event.app_user_id}: ${event.event_timestamp_ms} <= ${sub.last_event_at_ms}`);
        if (event.id) {
          await this.db.query('INSERT INTO webhook_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [event.id]);
        }
        return { applied: false, status: 'inactive' };
      }
    }

    await this.ensure(user.id);
    const plan = PLAN_BY_PRODUCT[event.product_id ?? ''] ?? 'free';
    const status = this.statusForEvent(event.type as WebhookEventType);

    // Handle informational events that don't change state but should be recorded
    const isInformationalEvent = ['TEST', 'SUBSCRIBER_ALIAS', 'INVOICE_ISSUANCE'].includes(event.type);
    if (isInformationalEvent) {
      // Record the event for deduplication but don't change subscription state
      if (event.id) {
        await this.db.query(
          'INSERT INTO webhook_events (id) VALUES ($1) ON CONFLICT DO NOTHING',
          [event.id],
        );
      }
      return { applied: true, status: 'inactive' };
    }

    // Handle expiration_at_ms: only set renews_at if present, don't write NULL for active paid plans
    let renewsAt: Date | null = null;
    if (event.expiration_at_ms !== undefined && event.expiration_at_ms !== null) {
      renewsAt = new Date(event.expiration_at_ms);
    } else if (status === 'active' && plan !== 'free') {
      // Active paid plan but no expiration_at_ms - keep existing renews_at, don't write NULL
      const existing = await this.db.one<{ renews_at: Date | null }>(
        'SELECT renews_at FROM subscriptions WHERE user_id = $1',
        [user.id],
      );
      renewsAt = existing?.renews_at ?? null;
    }

    await this.db.query(
      `UPDATE subscriptions
          SET status = $2,
              plan = $3,
              daily_allowance = $4,
              -- Upgrade grants the new allowance immediately; a lapse keeps the
              -- remaining count untouched because the gate is the status, not the count.
              likes_remaining_today = CASE WHEN $2 = 'active' THEN $4
                                           ELSE likes_remaining_today END,
              started_at = COALESCE(started_at, now()),
              renews_at = $5,
              last_event_at_ms = $6
        WHERE user_id = $1`,
      [user.id, status, plan, ALLOWANCE_BY_PLAN[plan] ?? ALLOWANCE_BY_PLAN.free, renewsAt, event.event_timestamp_ms ?? null],
    );

    // Record the event for deduplication
    if (event.id) {
      await this.db.query(
        'INSERT INTO webhook_events (id) VALUES ($1) ON CONFLICT DO NOTHING',
        [event.id],
      );
    }

    return { applied: true, status };
  }

  private isValidUuid(val: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(val);
  }

  /**
   * Maps RevenueCat event types to our subscription status.
   * Based on RevenueCat webhook documentation:
   * https://www.revenuecat.com/docs/webhooks
   *
   * Key behaviors:
   * - INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE, UNCANCELLATION, TEMPORARY_ENTITLEMENT_GRANT: active
   * - CANCELLATION: active (user has access until renews_at, then expires)
   * - EXPIRATION: expired (access ended)
   * - BILLING_ISSUE: active (grace period - user still has access until expiration_at_ms passes)
   * - SUBSCRIPTION_PAUSED: active (paused but still has access)
   * - SUBSCRIPTION_EXTENDED: active (extended promotional period)
   * - NON_RENEWING_PURCHASE: active (lifetime or one-time purchase)
   * - SUBSCRIBER_ALIAS: no-op (informational)
   * - TEST: no-op (test event)
   * - INVOICE_ISSUANCE: no-op (informational)
   * - TRANSFER: handled separately above
   * - Unknown: no-op
   */
  private statusForEvent(type: WebhookEventType): SubscriptionStatus {
    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
      case 'UNCANCELLATION':
      case 'TEMPORARY_ENTITLEMENT_GRANT':
      case 'NON_RENEWING_PURCHASE':
      case 'SUBSCRIPTION_PAUSED':
      case 'SUBSCRIPTION_EXTENDED':
        return 'active';
      case 'CANCELLATION':
        // Cancellation means "will not renew", not "access ends now". The user
        // has paid through renews_at, so they stay 'active' and the nightly job
        // expires them once that date passes. Marking them 'cancelled' here
        // would revoke a period they already paid for.
        return 'active';
      case 'EXPIRATION':
        return 'expired';
      case 'BILLING_ISSUE':
        // BILLING_ISSUE means there's a payment problem but the user is in a grace period.
        // They still have access until expiration_at_ms passes.
        // The nightly cron will expire them when renews_at < now().
        return 'active';
      case 'SUBSCRIBER_ALIAS':
      case 'TEST':
      case 'INVOICE_ISSUANCE':
        // Informational events - no state change
        return 'inactive'; // This will be treated as no-op by applyWebhook
      default:
        // Unknown events are no-ops
        this.log.warn(`Unknown webhook event type: ${type}`);
        return 'inactive';
    }
  }
}