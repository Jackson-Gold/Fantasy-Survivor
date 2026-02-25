# Fantasy Survivor — Architecture Decisions

## Hosting

- **Frontend**: Render Static Site (Vite build → `dist`). SPA rewrite rule: all routes → `/index.html`.
- **Backend**: Render Web Service (Node + TypeScript, Express).
- **Database**: Render Managed PostgreSQL. Single connection via `DATABASE_URL`. No SQLite or persistent disks.

All URLs (API base, CORS origins) are env-driven; no hardcoded production URLs.

---

## Authentication

- **Method**: Cookie-based sessions (httpOnly, secure in production, sameSite).
- **Storage**: Session store backed by Postgres (e.g. `connect-pg-simple`) so sessions survive restarts.
- **Passwords**: Argon2 for hashing (or bcrypt). No secrets in localStorage.
- **Flow**: Admin creates accounts (username + temp password). First login forces password change (flag on user).
- **Rate limiting**: Applied on login/signup endpoints to prevent brute force.
- **CORS**: Credentials allowed; allowlist from `CORS_ORIGINS` only. Express `cors` middleware with origin function.

**Admin seed**: If `users` table is empty on startup and `ADMIN_SEED_USERNAME` + `ADMIN_SEED_PASSWORD` are set, one admin user is created (must change password on first login).

---

## Authorization (RBAC)

- **Roles**: `admin` | `player`. Stored on user row.
- **Enforcement**: Every protected endpoint checks role (middleware or per-route). Admin-only routes (user CRUD, league config, episode outcomes, scoring rules, logs) require `admin`. Player routes (my team, my predictions, trades, leaderboard) require at least `player` and often league membership.
- **No trust of frontend**: All role and league-membership checks happen on the backend.

---

## Database and Migrations

- **ORM / migrations**: Drizzle ORM + Drizzle Kit. Schema in code; migrations generated and run on deploy (or via start script).
- **Connection**: Single `DATABASE_URL` (Render Internal Database URL). Pool size kept small (e.g. 10) for Render Web Service.
- **Key tables**: `users`, `leagues`, `league_members`, `contestants`, `episodes`, `teams` (roster: user + league + 2–3 contestants), `winner_picks`, `vote_predictions`, `trades` + `trade_items`, `scoring_rules`, `scoring_events`, `ledger_transactions`, `audit_log`.

---

## Lock Enforcement (Wednesday 8:00 PM America/New_York)

- **Rule**: All writes for predictions, roster changes, and trades are disallowed after the weekly lock.
- **Implementation**: Server computes “current lock time” as the most recent Wednesday 8:00 PM ET (using `America/New_York` and DST-aware logic, e.g. `date-fns-tz` or Luxon). For episode-scoped operations, lock is tied to the episode’s lock timestamp (e.g. episode has `lock_at` or we derive it from episode’s week).
- **Checks**: Before any mutation for predictions/roster/trades, backend compares `now()` in ET (or UTC compared to stored lock) and rejects with 403 if past lock. Admin override is a separate path (e.g. “override lock” with reason, logged in audit_log).
- **Tests**: Unit tests for lock boundary (just before / just after 8pm ET) and for DST transition dates.

---

## Audit Logging and Ledger

- **Audit log**: Append-only `audit_log` table: `timestamp`, `actor_user_id`, `action_type`, `entity_type`, `entity_id`, `before_json`, `after_json`, `metadata_json`, `ip`, `user_agent`. No updates or deletes.
- **Ledger**: Append-only `ledger_transactions` for points (user, league, amount, reason, reference to scoring event or trade, etc.). No edits; corrections are new rows (e.g. “reversal” or “adjustment”).
- **Admin**: Read-only views of audit log and ledger in admin dashboard; export allowed.

---

## API Shape

- **REST**, versioned under `/api/v1`.
- **Auth**: Login returns Set-Cookie; logout clears session. Optional “me” endpoint for current user.
- **Resources**: Leagues, contestants, episodes, my team, winner pick, vote predictions, trades, leaderboard, scoring (admin), users (admin), audit/logs (admin).
- **Errors**: Consistent JSON (e.g. `{ error: string, code?: string }`). 401 for unauthenticated, 403 for forbidden or lock violation.
- **Idempotency**: Trade acceptance and scoring application use single DB transactions so side effects are atomic.

---

## Frontend

- **Stack**: Vite, React, TypeScript, Tailwind, React Router (BrowserRouter; SPA rewrite on Render handles refresh).
- **API client**: TanStack Query; base URL from `VITE_API_BASE_URL`; credentials included for cookies.
- **Validation**: Zod for forms and API response shapes.
- **UI**: Tropical/adventure theme; mobile-first; bottom nav on mobile, side nav on desktop. No copyrighted Survivor assets.

---

## Summary

| Concern           | Decision                                                                 |
|-------------------|--------------------------------------------------------------------------|
| Persistence       | Render PostgreSQL via `DATABASE_URL`; Drizzle migrations                 |
| Auth              | Cookie sessions (Postgres store), Argon2, admin seed from env            |
| RBAC              | Backend-only checks on every protected route                             |
| Locks             | Wednesday 8pm ET computed server-side; DST-safe; tests for boundary     |
| Audit / Ledger    | Append-only tables; no edits                                             |
| API               | REST `/api/v1`, env-driven CORS with credentials                         |
