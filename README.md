# Fantasy Survivor

A **fantasy league game** for the reality TV show *Survivor*. Build a roster of contestants, lock in a winner pick, make weekly vote-out predictions, and earn points as the season unfolds. Compete with friends on a shared leaderboard.

---

## What is this?

Fantasy Survivor lets you:

- **Build a roster** of 2–3 contestants from the current season
- **Pick a winner** before the season (or first episode) locks
- **Predict the vote** each week: allocate votes across active players for who you think will be voted out
- **Earn points** from scoring events (immunity wins, idols, tribe wins, eliminations) and from correct vote predictions
- **Trade** with other players (when enabled)
- **Climb the leaderboard** — points are broken down by category and by episode

Admins can run a league: create contestants and episodes, enter outcomes each week (who won immunity, who was voted out, etc.), and optionally adjust scores. A weekly lock (Wednesday 8:00 PM ET) prevents changes to predictions and rosters until the next episode.

---

## Tech stack

- **Frontend**: Vite, React, TypeScript, Tailwind CSS, TanStack Query, React Router
- **Backend**: Node.js, Express, TypeScript, Drizzle ORM
- **Database**: PostgreSQL (e.g. Render Managed Postgres)
- **Auth**: JWT (stored in `localStorage`); optional admin seed via env

The repo is a **monorepo**: `apps/web` (frontend) and `apps/api` (backend). Deploy the frontend as a static site and the API as a web service; point the frontend at the API with `VITE_API_BASE_URL`.

---

## Quick start (local)

1. **Clone and install**
   ```bash
   git clone https://github.com/YOUR_USERNAME/fantasy-survivor.git
   cd fantasy-survivor
   npm install
   ```

2. **Database**  
   Create a PostgreSQL database and set `DATABASE_URL` (e.g. in `apps/api/.env`). Run migrations:
   ```bash
   cd apps/api && npm run db:migrate
   ```

3. **Backend**
   ```bash
   cd apps/api && npm run dev
   ```
   Use a `.env` with `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGINS=http://localhost:5173`. Optionally set `ADMIN_SEED_USERNAME` and `ADMIN_SEED_PASSWORD` to create an admin on first run.

4. **Frontend**
   ```bash
   cd apps/web && npm run dev
   ```
   Set `VITE_API_BASE_URL=http://localhost:3000` (or your API port) in `apps/web/.env` if needed.

5. **Seed data (optional)**  
   From `apps/api`:
   - Demo league + players: `ALLOW_DEMO_SEED=1 npm run db:seed-demo`
   - Survivor 50–style seed: `SURVIVOR50_SEED=1 npm run db:seed-survivor50`  
   Do not set these env vars in production.

---

## Hosting (e.g. Render)

- **Database**: Create a **PostgreSQL** instance; copy the **Internal Database URL** for the API.
- **Backend**: Create a **Web Service** (Node), connect the repo, set **Build** to `npm install --include=dev && npm run build --workspace=@fantasy-survivor/api`, **Start** to `node apps/api/dist/index.js`. Set env vars: `PORT`, `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`, `CORS_ORIGINS` (include your frontend URL).
- **Frontend**: Create a **Static Site**, **Build** `npm install --include=dev && npm run build --workspace=@fantasy-survivor/web`, **Publish** `apps/web/dist`. Set `VITE_API_BASE_URL` to your backend URL. Add a rewrite rule: `/*` → `/index.html` for SPA routing.

After the frontend is live, add its URL to the backend `CORS_ORIGINS` and redeploy the API if needed.

---

## Env vars

| App     | Variable                | Required | Description |
|---------|-------------------------|----------|-------------|
| Backend | `PORT`                  | Set by host | Server port |
| Backend | `NODE_ENV`              | Yes      | `production` or `development` |
| Backend | `DATABASE_URL`          | Yes      | PostgreSQL connection string |
| Backend | `SESSION_SECRET`        | Yes      | Secret for JWT signing |
| Backend | `CORS_ORIGINS`          | Yes      | Comma-separated frontend origins |
| Backend | `ADMIN_SEED_USERNAME`   | No       | Create this admin when DB has no users |
| Backend | `ADMIN_SEED_PASSWORD`   | No       | Temp password for seed admin |
| Frontend| `VITE_API_BASE_URL`     | Yes (prod) | Backend API URL (no trailing slash) |

---

## Project structure

- `apps/api` – REST API, auth, leagues, teams, predictions, trades, leaderboard, admin, audit log
- `apps/web` – SPA: dashboard, profile, My Team, Picks, Leaderboard, Trades, Admin
- `apps/api/drizzle` – SQL migrations
- `docs/ARCHITECTURE.md` – Auth, RBAC, lock times, audit log, ledger

From repo root: `npm run build` builds all workspaces; run tests with `npm run test --workspace=@fantasy-survivor/api`.

---

## Contributing and license

This is a hobby project. Feel free to fork and adapt for your own league. If you push to GitHub, update the remote:

```bash
git remote add origin https://github.com/YOUR_USERNAME/fantasy-survivor.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username or org.
