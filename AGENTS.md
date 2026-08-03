# AGENTS.md

## Cursor Cloud specific instructions

Athene CMMS is an npm-workspaces monorepo with three services (see `README.md` and root `package.json`):

- `backend` — Express + TypeScript API on port `3001` (run via `tsx watch`, transpile-only, no typecheck). Needs PostgreSQL.
- `frontend` — Vite + React (PrimeReact) desktop web app on port `5173`. Proxies `/api` to `http://localhost:3001` (see `frontend/vite.config.ts`).
- `mobile` — Expo + React Native Web app on port `8081` (Metro). Talks to the same backend.

Standard commands live in the root `package.json` / `README.md`:

- Run everything: `npm run dev` (backend + frontend + mobile via `concurrently`).
- Run one service: `npm run dev -w backend`, `npm run dev -w frontend`, `npm run web -w mobile`.
- Migrations: `npm run migrate` (from root; requires `DATABASE_URL`).

### Database (must be running before the backend is useful)

The backend needs PostgreSQL with the `pgcrypto` and `vector` (pgvector) extensions (used by `backend/migrations/001_*` and `038_athene_assistant.sql`). PostgreSQL 16 + pgvector are installed in the VM image but the cluster is **not auto-started** on boot. Start it before running the backend:

```bash
sudo pg_ctlcluster 16 main start   # idempotent-ish; ignore "already running"
```

Local dev DB/role (already created; the data dir persists in the VM snapshot): database `athene`, role `athene` / password `athene` (superuser). If they are ever missing, recreate with:

```bash
sudo -u postgres psql -c "CREATE USER athene WITH PASSWORD 'athene' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE athene OWNER athene;"
```

### backend/.env (not committed — `.env` is gitignored)

The backend reads `backend/.env` via `dotenv`. Required keys and the dev values in use:

```
DATABASE_URL=postgres://athene:athene@localhost:5432/athene
SESSION_SECRET=<any string >= 16 chars>
ATHENE_EMBEDDING_ENABLED=0   # avoids needing OPENAI_API_KEY for normal CRUD
```

Athene assistant / embeddings / voice features additionally require a real `OPENAI_API_KEY`; leave embedding ingest disabled (`ATHENE_EMBEDDING_ENABLED=0`) unless testing those flows.

### Login and first-run onboarding gotcha

Seeded login is `admin` / `admin` (migration `002_seed_site_and_admin.sql`). On first login a new user has `onboardingCompletedAt = null`, which triggers an **auto-running onboarding tour** (`frontend/src/onboarding/OnboardingProvider.tsx`) that repeatedly calls `navigate(step.route)`. This makes any manual navigation (e.g. to `/sites`) appear to "bounce back" — it is NOT a routing bug. Dismiss the tour first via the coachmark **Überspringen / Skip** (or step through **Weiter / Next**) before navigating elsewhere.

### Lint / typecheck / build notes

- There is no ESLint config; the type-check step is the effective lint. Frontend: `npx tsc -b` (clean). Backend: `npx tsc --noEmit`.
- Known pre-existing failure: `backend/src/spareParts.ts` calls `computeMovingAverage` without importing it, so `tsc`/`npm run build -w backend` fails. This does **not** affect `npm run dev` because the backend runs through `tsx watch` (transpile-only). Do not "fix" this as part of environment setup.
