# AGENTS.md

## Cursor Cloud specific instructions

Athene CMMS is an npm-workspaces monorepo (`backend`, `frontend`, `mobile`). Standard commands live in `README.md`, `mobile/README.md`, and the workspace `package.json` scripts — use those; this section only captures non-obvious cloud setup caveats.

### Services

- backend — Express REST API + WebSocket on port `3001`. Run: `npm run dev -w backend`.
- frontend — Vite + React (PrimeReact) on port `5173`; dev-proxies `/api` (and ws) to `localhost:3001`. Run: `npm run dev -w frontend`.
- mobile (optional) — Expo Web on `8081`. Run: `npm run web -w mobile` (needs backend running).
- Root `npm run dev` starts backend + frontend + mobile together via `concurrently`.

### Database (required, not auto-started)

- PostgreSQL is the only datastore and must be running before the backend/migrations work. The update script does NOT start it. In this VM, start it with `sudo pg_ctlcluster 16 main start` (Postgres 16 is installed with the `pgvector` extension).
- A local role/db `athene`/`athene` (password `athene`) already exists with `vector` + `pgcrypto` extensions enabled. Connection string: `postgresql://athene:athene@localhost:5432/athene`.
- `backend/.env` is gitignored and already contains `DATABASE_URL`, `SESSION_SECRET`, and `ATHENE_EMBEDDING_ENABLED=0`. If it is missing, copy `backend/.env.example` and add `DATABASE_URL` + `SESSION_SECRET` (the example file omits `DATABASE_URL`).
- Migration `038_athene_assistant.sql` requires the `vector` (pgvector) extension; migration `001` requires `pgcrypto`. Both are pre-created in the `athene` db.
- Apply migrations from the repo root: `npm run migrate` (idempotent; tracks applied files in the `_migration` table). Re-run after pulling new migration files.

### Auth / testing

- Default seeded login is `admin` / `admin` (site `DF - Default`), created by migration `002`.
- Session auth is a signed HttpOnly cookie (`athene.sid`); there is no server-side session store to run.

### Lint / typecheck / build

- There is no dedicated `lint` script. The type-check gate is `tsc`: backend `npx tsc -p backend/tsconfig.json --noEmit`; frontend `cd frontend && npx tsc -b`.
- Production build: `npm run build` (backend `tsc` + frontend `tsc -b && vite build`). For development use the `dev` scripts, not `build`.

### OpenAI / Athene assistant

- OpenAI is optional. Core CMMS works without it. Keep `ATHENE_EMBEDDING_ENABLED=0` when no real `OPENAI_API_KEY` is set, otherwise CRUD operations attempt embedding ingest. Set a real `OPENAI_API_KEY` to exercise the Athene assistant / embeddings / Whisper features.
