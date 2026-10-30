# Rishta Scaling Plan

## Overview
This document outlines concrete scaling improvements for the Rishta matchmaking platform, organized by effort and impact. Each item includes specific changes needed and rough effort estimates.

---

## 1. Feed Candidate Generation Optimization

### Current State
- PostGIS GiST index on `users.geo` for radius filtering
- Shared interests computed per-request via subquery
- No caching between requests

### Proposed Changes
| Component | Change | Effort |
|-----------|--------|--------|
| **Prefilter** | Keep PostGIS `ST_DWithin` + GiST index (already implemented) | ✅ Done |
| **Shared-interest score** | Add `user_interest_bitmap` column (bitarray of interest IDs) or materialized view with precomputed scores | Medium (2-3 days) |
| **Redis-cached pages** | Cache feed pages per user: key = `feed:{userId}:{cursorHash}`, TTL 5 min, invalidate on like/pass/block | Low (1-2 days) |
| **Offline ranking job** | Nightly pg-boss job computes top-N candidates per active user, stores in `feed_candidates(user_id, candidate_id, score, created_at)` | Medium (2-3 days) |
| **Hybrid read path** | Try Redis cache → fall back to offline table → fall back to live query | Low (1 day) |

### Key Files to Modify
- `backend/src/feed/feed.service.ts` — add cache layer before live query
- `backend/src/pg-boss/outbox.worker.ts` or new `feed-ranking.worker.ts` — nightly ranking job
- New migration: `feed_candidates` table + `user_interest_bitmap` column

### Upgrade Path
Start with Redis cache (fast win). Add offline ranking when cache hit rate plateaus or latency p95 > 200ms.

---

## 2. Move All Scheduled/Async Work to pg-boss

### Current State
- `@Cron` for nightly quota reset (`SubscriptionService.nightlyQuotaReset`)
- `ScheduleModule.forRoot()` in `app.module.ts`
- Outbox processor scheduled via pg-boss (good)
- Token cleanup: not implemented

### Proposed Changes
| Job | Current | Target | Effort |
|-----|---------|--------|--------|
| Quota reset (daily) | `@Cron('0 0 * * *')` | pg-boss schedule `0 0 * * *` tz `Asia/Karachi` + run on startup | Low (1 day) |
| Subscription expiry (hourly) | Not implemented | pg-boss schedule `0 * * * *` | Low (1 day) |
| Refresh token cleanup (daily) | Not implemented | pg-boss schedule `0 2 * * *` (delete expired/revoked > 7 days) | Low (1 day) |
| Outbox processor | pg-boss every 10s | Keep, add dead-letter queue monitoring | ✅ Done |
| Photo moderation | pg-boss `moderate-photo` | Keep | ✅ Done |
| Verification reopen | pg-boss (triggered) | Keep | ✅ Done |

### Key Files to Modify
- `backend/src/subscription/subscription.service.ts` — remove `@Cron`, add pg-boss schedule in module init
- `backend/src/pg-boss/pg-boss.module.ts` — register all schedules on startup
- `backend/src/auth/auth.service.ts` — add token cleanup method
- New worker: `backend/src/pg-boss/subscription.worker.ts`

### Idempotency & Catch-up
- Quota reset: `WHERE quota_reset_at < (now() at time zone 'Asia/Karachi')::date` (already correct)
- Expiry: `UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND renews_at < now()`
- Token cleanup: `DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days'`

---

## 3. Moderation & Verification as Async Jobs

### Current State
- `ModerationService.screenText()` called synchronously in `ProfileService.upsert`
- `ModerationService.screenImage()` called synchronously in `PhotosService.addPhoto`
- `VerificationService.reopen()` called after photo changes

### Proposed Changes
| Flow | Change | Effort |
|------|--------|--------|
| Bio screening | Already async via pg-boss in `ProfileService` (fire-and-forget) | ✅ Done |
| Photo screening | Move to pg-boss job `moderate-photo` (already implemented in `PhotosService`) | ✅ Done |
| Verification trigger | Already async via `VerificationService.reopen()` | ✅ Done |
| Admin queue | Results written to `moderation_flags` table, surfaced in `AdminController` | ✅ Done |
| **Add**: Result webhook | Notify client via Stream Chat or push when moderation completes | Low (1 day) |

### Key Files to Modify
- `backend/src/moderation/moderation.service.ts` — ensure all screening is async
- `backend/src/verification/verification.service.ts` — add webhook/push on status change

---

## 4. Observability

### Current State
- Structured request logging in `main.ts` (JSON, request/response)
- Basic error logging via NestJS logger
- No metrics, no distributed tracing, no error tracking service

### Proposed Changes
| Component | Tool | Implementation | Effort |
|-----------|------|----------------|--------|
| **Metrics** | Prometheus + `@nestjs/terminus` | Expose `/metrics`: p95 latency per route, pool wait, queue depth, active users | Medium (2-3 days) |
| **Error Tracking** | Sentry | `@sentry/node` integration, capture all exceptions, add user context | Low (1 day) |
| **Alerting** | Prometheus Alertmanager or Sentry alerts | Critical: p95 > 500ms, error rate > 5%, queue depth > 1000, DB pool exhausted | Low (1 day) |
| **Health Checks** | `/health` (liveness), `/ready` (DB connectivity) | Already implemented | ✅ Done |

### Key Metrics to Track
| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| `http_request_duration_seconds` (p50, p95, p99) | Middleware | p95 > 500ms |
| `db_pool_wait_seconds` | Pg pool events | > 100ms |
| `pg_boss_queue_depth` | pg-boss admin | > 1000 |
| `auth_refresh_failures_total` | Auth service | > 10/min |
| `subscription_webhook_failures_total` | Subscription service | > 5/min |

### Files to Modify
- `backend/src/main.ts` — add Prometheus metrics middleware
- `backend/src/app.module.ts` — add Sentry initialization
- New: `backend/src/observability/` module

---

## 5. Payments for Pakistan Market

### Current State
- RevenueCat webhook handles Apple/Google Play subscriptions
- `PLAN_BY_PRODUCT` maps RevenueCat product IDs to internal plans
- Webhook processing is atomic and idempotent

### Gap Analysis
| Gateway | Coverage | Integration Effort |
|---------|----------|-------------------|
| **RevenueCat (App Store/Play Billing)** | iOS/Android in-app | ✅ Done |
| **JazzCash** | Pakistan mobile wallet, bank transfers | Medium (3-5 days) |
| **Easypaisa** | Pakistan mobile wallet | Medium (3-5 days) |
| **Safepay** | Pakistan card/gateway aggregator | Medium (2-3 days) |
| **Stripe** | International cards | Low (1-2 days) |

### Subscription Model Changes
1. **Local plans**: Add `plan` values `jazzcash_monthly`, `easypaisa_monthly`, `safepay_monthly`
2. **Webhook handlers**: Separate controllers for each gateway, normalize to internal `applyWebhook`-style logic
3. **RevenueCat fallback**: Keep as primary for app-store users; local gateways for web/direct
4. **Currency**: Store amounts in PKR (integer paisa), convert only for display

### Key Files to Modify
- `backend/src/subscription/subscription.service.ts` — extend `PLAN_BY_PRODUCT`, add local gateway handlers
- New: `backend/src/payments/` module with `JazzCashController`, `EasypaisaController`, `SafepayController`
- Migration: add `payment_gateway` column to `subscriptions` table

---

## 6. Rishta-Specific Product Features

### Missing Today (from spec & onboarding flow)
| Feature | Spec Reference | Implementation | Effort |
|---------|----------------|----------------|--------|
| **Photo privacy controls** | Onboarding: "Who can see my photos?" (Guardian/Family/Everyone) | Add `photo_visibility` enum to profiles, filter in feed query | Medium (2-3 days) |
| **Guardian/family involvement** | Onboarding screens for "Wali" details | Add `guardians` table, link to user, notification preferences | Medium (3-5 days) |
| **Religion/sect/city filters** | Onboarding: sect, religious_practice_level, city | Already in feed filters (`FeedFilters`), ensure indexed | Low (1 day) |
| **Report SLAs** | Moderation: "Review within 24h" | Add `sla_deadline` to `reports`/`moderation_flags`, cron alert if breached | Low (1 day) |
| **Profile completion %** | Onboarding progress bar | Computed field in `GET /auth/me`, used by frontend | Low (1 day) |
| **Interest/personality categories** | Onboarding: categorized multi-select | Already implemented in `ProfileService.interestsCategorized()` | ✅ Done |

---

## Priority Summary

| Priority | Items | Total Effort |
|----------|-------|--------------|
| **P0 (Do now)** | Redis cache for feed, pg-boss for all jobs, Sentry, token cleanup | ~1 week |
| **P1 (Next sprint)** | Offline feed ranking, local payment gateways, photo privacy | ~2-3 weeks |
| **P2 (Later)** | Guardian involvement, advanced metrics/alerts, SLA monitoring | ~2-3 weeks |

---

## One-Time Manual Steps Required

1. **Secret Rotation** (from SECURITY_TODO.md):
   - Firebase service account
   - Stream Chat secret
   - JWT secret (invalidates all sessions)
   - Database password
   - RevenueCat webhook secret
   - AWS keys (if used)

2. **Git History Purge** (coordinate with team):
   ```bash
   git filter-repo --path .claude --invert-paths --path .antigravity --invert-paths ...
   git push --force-with-lease --all
   ```

3. **Infrastructure**:
   - Provision Redis (ElastiCache / Redis Cloud) → set `REDIS_URL`
   - Configure Sentry DSN → set `SENTRY_DSN`
   - Set up Prometheus + Grafana or use managed (Datadog, etc.)

4. **Firebase/Stream/RevenueCat Console**:
   - Update Firebase authorized domains
   - Rotate Stream secret in dashboard
   - Verify RevenueCat webhook URL points to new endpoint

---

## Appendix: Migration Checklist for Phase 8 Items

- [ ] `feed_candidates` table migration
- [ ] `user_interest_bitmap` column on `profiles` or `users`
- [ ] `payment_gateway` column on `subscriptions`
- [ ] `photo_visibility` enum on `profiles`
- [ ] `guardians` table + foreign key
- [ ] `sla_deadline` on `reports` and `moderation_flags`
- [ ] Redis connection config in `.env.example`
- [ ] Sentry DSN in `.env.example`
- [ ] Prometheus scrape config