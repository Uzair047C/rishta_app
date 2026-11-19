I reviewed the README, `SECURITY_TODO.md`, `feed.service.ts`, `auth.service.ts` and `app/lib/core/api.dart`. I did not read the migrations, the outbox worker, the subscription/webhook code, the JWT guard, or the Flutter screens, so those areas aren't covered. Items marked "verify" are things I suspect but couldn't confirm.

## Critical

**1. Leaked secrets.** `SECURITY_TODO.md` says the Firebase service account, Stream secret, JWT secret, DB password and possibly AWS keys were committed to git history. Every checklist box is still unchecked, and `.gitignore.backup` is still in the repo even though it is on the purge list. If the repo is public, treat all of these as compromised now. Rotate first, then purge history.

**2. The refresh-token SQL looks invalid (verify).** In `refreshAccessToken`, the query puts `INSERT … RETURNING` inside a `FROM (…)` subquery of an `UPDATE`. Postgres only allows data-modifying statements as top-level CTEs (`WITH x AS (INSERT …)`). If this fails, every token refresh returns 500 and users are logged out after 15 minutes. Run the refresh e2e test against real Postgres to check.

**3. Refresh rotation will log out users on flaky networks.** If the server rotates the token but the response never reaches the phone, the client retries the old token. The server treats that as reuse and revokes the whole family. On mobile networks in Pakistan this will happen regularly. Add a short grace window (about 10–30 seconds) where the previous token is accepted once and returns the same successor.

**4. Verification is effectively a stub.** The feed only shows `verification_status = 'verified'` users, but the Liveness client is unimplemented and device fingerprinting isn't sent. In a matrimony app, trust is the product. Right now the "verified" badge probably doesn't mean what users think it means. Also `deviceLimitReached` can never fire from the client.

## High: backend correctness

- **Feed pagination skips candidates.** In `feed()`, if the last row on a page has `distance_m = null` (users without location), the cursor sends `null`. Then `COALESCE(distance_m, 999999999) > NULL` is never true, so the remaining candidates with equal `shared_interests` are dropped. Use `COALESCE($dm, 999999999)`.
- **Outbox runs before commit.** `processOutboxAfterCommit()` is called inside the `db.tx` callback, before the transaction commits. The `setTimeout(10)` is a race hack, not a fix. Call it after `db.tx` resolves. Every like also triggers `processBatch(100)`, which competes with the pg-boss worker. Confirm the batch uses `FOR UPDATE SKIP LOCKED`, or you'll get duplicate pushes.
- **`assertCanInteract` contradicts its own comment.** The comment says "sequential queries to avoid pg 8 concurrent query warnings," but the code uses `Promise.all` on one transaction client. That triggers the deprecation warning now and is a risk on future pg versions. It also makes 4–5 round trips inside a transaction that holds an advisory lock. Collapse it into one query.
- **Wrong error for suspended users.** A suspended liker gets `subscription_inactive`, and the client shows "Your subscription has lapsed." That is misleading.
- **README doesn't match the code.** `JWT_ACCESS_TTL_MINUTES` and `JWT_REFRESH_TTL_DAYS` are documented, but the TTLs are hard-coded as 15 and 30.
- **Chat can bypass blocks (verify).** Block and unmatch only change Postgres. If the Stream channel isn't frozen or deleted, the blocked person can still message. Stream is the real authorization layer for chat.
- **Moderation fails open.** "Degrades to passthrough when unconfigured" means a missing key in production silently disables moderation. In production it should fail closed (hold profiles as pending).
- **Photo URL trust.** `POST /profile/photo` records a client-supplied URL. Validate that it points to your bucket under that user's path, or anyone can attach arbitrary hosted images and skip moderation.
- **Location trilateration (verify).** The feed returns distance buckets but filters by exact radius from the caller's own lat/lng. If the client can set its own coordinates, an attacker can locate a target by moving around. Rate-limit location changes and jitter the results.

## System design

- **The feed won't scale.** It orders by `shared_interests DESC, distance ASC`. Both values are computed per row, with a correlated subquery for interests and six `NOT EXISTS` anti-joins, so Postgres must evaluate and sort every eligible candidate for every page. That's fine at 1k users and painful at 100k. Instead, generate a capped candidate set (geo and filters, say 300–500) and rank it in app code or a cached per-user queue.
- **No activity signal.** The feed has no `last_active` filter or boost, so dormant profiles that rank well will be shown forever. This hurts user experience more than any other ranking issue.
- **Connection pool contention.** The API, the pg-boss workers and the heavy feed query share a pool of 10 (`DB_POOL_MAX`), and transactions hold advisory locks while waiting on other queries. Separate the worker from the API process, or at least give it its own pool.
- **Throttling.** Redis is optional, so with more than one instance each instance enforces its own limits. `TRUST_PROXY` has the opposite risk: if false behind a load balancer, everyone shares one IP bucket, and if true without a trusted proxy, `X-Forwarded-For` is spoofable.
- **Vendor concentration.** Stream (pricing grows with MAU), Firebase and RevenueCat are all unavoidable pieces of the design, so keep your own match and conversation tables as the source of truth.
- **Product risks specific to this market.** Photo privacy controls and guardian involvement are listed as "still open." For many women in this market those are launch requirements, not nice-to-haves.

## Frontend (Flutter)

- **Broken idempotency key.** `_generateIdempotencyKey()` derives every character from one `random` value (`random % 16`), so the key is a few repeated characters, not a UUID. Use the `uuid` package. Also, the 401 retry calls `request()` again and generates a new key, which defeats idempotency exactly when it's needed. I didn't confirm whether the server honors the header.
- **Retries.** There is no retry or backoff for idempotent GETs on transient network errors. Combined with a 20-second timeout, it's a poor experience on bad connections.
- **Billing and photo upload are stubs.** `_purchase` throws in release builds, and photo upload uses a mock bucket URL. The app can't ship without these.
- **Hand-rolled client.** `Api` reimplements interceptors, refresh and error mapping. It works, but `dio` with interceptors would be less code to maintain.

## Repo hygiene

There are about 45 `test-*.js` / `test-debug-*.js` scripts in `backend/` (including `test-dollar-quote*.js` and `test-migrate-*.js`), plus `.playwright-mcp/`, a stray root `package-lock.json` and `requirements.txt`. They suggest migrations were painful to get working, and they hurt credibility if anyone reviews the repo. Delete them or move the useful ones into `test/`.

