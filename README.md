# Fantasy Survivor

Fantasy sports–style game for the reality TV show Survivor: leagues, rosters (2–3 contestants), weekly vote-out predictions, winner pick, trades, and configurable scoring. Invite-only accounts; weekly lock Wednesday 8:00 PM America/New_York.

## Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/fantasy-survivor.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username (or org). If the repo is already created on GitHub with another name, use that repo URL. After pushing, connect the repo to Render for deployment.

## Hosting (Render)

- **Frontend**: Render **Static Site** (Vite build)
- **Backend**: Render **Web Service** (Node + TypeScript)
- **Database**: Render **PostgreSQL** (managed)

All production URLs and secrets are **env-driven**; nothing is hardcoded.

---

## 1. Create Render PostgreSQL database

1. In [Render Dashboard](https://dashboard.render.com), create a new **PostgreSQL** database.
2. After it’s created, open it and go to **Connect** (or **Info**).
3. Copy the **Internal Database URL** (use this for the backend; it’s only available from other Render services in the same account).  
   If you need to connect from outside Render, use the **External Database URL** instead (e.g. for local dev).

---

## 2. Deploy backend (Web Service)

1. Create a new **Web Service** and connect your GitHub repo (`fantasy-survivor`).
2. **Root directory**: leave empty (monorepo root).
3. **Build command**:  
   `npm install --include=dev && npm run build --workspace=@fantasy-survivor/api`  
   (Render sets `NODE_ENV=production`, so `--include=dev` is needed to install TypeScript and type definitions for the build.)
4. **Start command**:  
   `node apps/api/dist/index.js`  
   (Migrations run automatically on startup.)
5. **Environment variables** (required):

   | Variable         | Description |
   |------------------|-------------|
   | `PORT`           | Set by Render. |
   | `NODE_ENV`       | `production` |
   | `DATABASE_URL`   | **Internal Database URL** from your Render Postgres (from the Connect menu). |
   | `SESSION_SECRET`| Long random string (e.g. `openssl rand -hex 32`). |
   | `CORS_ORIGINS`   | Comma-separated allowlist. Include your **frontend URL** (Render Static Site URL) and, if needed, `http://localhost:5173` for local dev. Example: `https://fantasy-survivor.onrender.com,http://localhost:5173` |

   Optional:

   | Variable              | Description |
   |-----------------------|-------------|
   | `LOG_LEVEL`           | `info` or `debug` |
   | `ADMIN_SEED_USERNAME` | Username for first admin (only used when the `users` table is empty). |
   | `ADMIN_SEED_PASSWORD` | Temporary password for that admin (user must change on first login). |

6. Deploy. The service will run migrations on start and (if set) seed the admin user when no users exist.

---

## 3. Deploy frontend (Static Site)

1. Create a new **Static Site** and connect the same GitHub repo.
2. **Root directory**: leave empty.
3. **Build command**:  
   `npm install --include=dev && npm run build --workspace=@fantasy-survivor/web`
4. **Publish directory**: `apps/web/dist`
5. **Environment variable**:
   - `VITE_API_BASE_URL`: Your **backend Web Service URL** (e.g. `https://fantasy-survivor-api.onrender.com`). No trailing slash.

6. Deploy.

### SPA routing (no 404 on refresh)

Render Static Sites support **rewrite rules** so that all routes serve `index.html`:

- In the Static Site **Settings**, add a **Rewrite Rule** (or use the “Redirects / Rewrites” section):
  - **Source**: `/*`
  - **Destination**: `/index.html`
  - **Action**: Rewrite (not redirect)

This keeps URLs clean (no hash) and allows React Router’s `BrowserRouter` to work on refresh.

---

## 4. Finish backend CORS

After the frontend is deployed, copy its URL (e.g. `https://fantasy-survivor.onrender.com`) and add it to the backend’s `CORS_ORIGINS` env var (comma-separated if you already have localhost). Redeploy the backend if needed.

---

## Local development

1. **Database**: Create a local Postgres DB and set `DATABASE_URL` (e.g. in `apps/api/.env`). Or use the Render **External** URL if your IP is allowed.
2. **Backend**:  
   `cd apps/api && npm run db:migrate && npm run dev`
3. **Frontend**:  
   `cd apps/web && npm run dev`  
   Set `VITE_API_BASE_URL` to `http://localhost:3000` in `apps/web/.env` if you’re not using the Vite proxy.  
   With the default Vite config, `/api` is proxied to the backend when `VITE_API_BASE_URL` is unset (dev).
4. **CORS**: In `apps/api/.env`, set `CORS_ORIGINS=http://localhost:5173`.

---

## Monorepo

- `apps/api` – Node + Express + TypeScript, Drizzle ORM, Postgres, session auth, RBAC, lock enforcement.
- `apps/web` – Vite + React + TypeScript, Tailwind, TanStack Query, React Router.

From repo root:

- `npm run build` – build all workspaces
- `npm run dev` – run api and web (concurrently; define in root `package.json` if needed)

---

## Env var summary

| App     | Variable             | Required | Notes |
|---------|----------------------|----------|--------|
| Backend | `PORT`               | Set by Render | |
| Backend | `NODE_ENV`           | Yes      | `production` on Render |
| Backend | `DATABASE_URL`       | Yes      | Render Postgres Internal URL |
| Backend | `SESSION_SECRET`     | Yes      | Long random string |
| Backend | `CORS_ORIGINS`       | Yes      | Frontend URL(s), comma-separated |
| Backend | `ADMIN_SEED_USERNAME`| No       | First admin when DB empty |
| Backend | `ADMIN_SEED_PASSWORD`| No       | Temp password for seed admin |
| Frontend| `VITE_API_BASE_URL`  | Yes (prod) | Backend Web Service URL |

---

## Tests

- **API unit tests**: `npm run test --workspace=@fantasy-survivor/api` (lock, leaderboard sort, trade logic).
- **E2E**: See [e2e/README.md](e2e/README.md) for manual flows and how to add Playwright/Cypress.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for auth, RBAC, lock enforcement (Wednesday 8pm ET), audit log, ledger, and API shape.
