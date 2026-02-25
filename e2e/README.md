# E2E tests

Run the API and web app locally, then run E2E with Playwright or Cypress.

**Suggested flows to automate:**

1. **Login** – POST /api/v1/auth/login, then GET /api/v1/auth/me with session cookie.
2. **Submit prediction then lock** – As player, set vote predictions for an episode; advance time past lock (or mock); verify PUT predictions returns 403.
3. **Admin enters results and leaderboard updates** – As admin, POST scoring event; GET leaderboard and assert points changed.
4. **Trade propose and accept** – As player A, POST /trades/propose; as player B, POST /trades/:id/accept; verify rosters/ledger.

**Minimal run (manual):**

```bash
# Terminal 1: ensure DATABASE_URL and CORS_ORIGINS, then
cd apps/api && npm run db:migrate && npm run dev

# Terminal 2:
cd apps/web && npm run dev

# In browser: login, open dashboard, team, picks, leaderboard.
```

To add automated E2E, install Playwright in the repo and add specs under `e2e/specs/`.
