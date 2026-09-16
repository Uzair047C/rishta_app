import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Db } from '../db/db';
import { SubscriptionRow, SubscriptionStatus } from '../db/types';

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

export interface WebhookEvent {
  type: string;
  app_user_id: string;
  product_id?: string;
  expiration_at_ms?: number;
  period_type?: string;
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
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async nightlyQuotaReset(): Promise<void> {
    const lapsed = await this.db.query(
      `UPDATE subscriptions SET status = 'expired'
        WHERE status = 'active' AND renews_at IS NOT NULL AND renews_at < now()`,
    );
    const reset = await this.db.query(
      `UPDATE subscriptions
          SET likes_remaining_today = daily_allowance, quota_reset_at = now()
        WHERE status = 'active'`,
    );
    this.log.log(`quota reset: ${reset.rowCount ?? 0} active, ${lapsed.rowCount ?? 0} lapsed`);
  }

  /**
   * RevenueCat / Play Billing webhook. Must be authenticated — an unauthenticated
   * endpoint here would let anyone grant themselves a paid plan.
   */
  async applyWebhook(event: WebhookEvent, secret?: string): Promise<{ applied: boolean; status: SubscriptionStatus }> {
    const expected = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!expected || secret !== expected) throw new UnauthorizedException('invalid_webhook_secret');

    const user = await this.db.one<{ id: string }>('SELECT id FROM users WHERE id = $1', [
      event.app_user_id,
    ]);
    if (!user) return { applied: false, status: 'inactive' };

    await this.ensure(user.id);
    const plan = PLAN_BY_PRODUCT[event.product_id ?? ''] ?? 'free';
    const status = this.statusForEvent(event.type);
    const renewsAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;

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
              renews_at = $5
        WHERE user_id = $1`,
      [user.id, status, plan, ALLOWANCE_BY_PLAN[plan] ?? ALLOWANCE_BY_PLAN.free, renewsAt],
    );

    return { applied: true, status };
  }

  private statusForEvent(type: string): SubscriptionStatus {
    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
      case 'UNCANCELLATION':
      case 'TEMPORARY_ENTITLEMENT_GRANT':
      case 'CANCELLATION':
        // Cancellation means "will not renew", not "access ends now". The user
        // has paid through renews_at, so they stay 'active' and the nightly job
        // expires them once that date passes. Marking them 'cancelled' here
        // would revoke a period they already paid for.
        return 'active';
      case 'EXPIRATION':
      case 'BILLING_ISSUE':
        return 'expired';
      default:
        return 'inactive';
    }
  }
}
