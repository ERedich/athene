# AGENTS.md

## Cursor Cloud specific instructions

Athene CMMS is an npm-workspaces monorepo: `backend` (Express API + WebSocket, `:3001`), `frontend` (Vite + React SPA, `:5173`), and `mobile` (Expo/React Native Web, `:8081`, optional). Standard dev/build/migrate commands live in `README.md`, root `package.json`, and `mobile/README.md` — refer to those rather than duplicating.

### Datastore (must be running before backend)
- PostgreSQL 16 with the `pgcrypto` and `vector` (pgvector) extensions is required. It is installed in the VM but is NOT auto-started on boot — start it each session with `sudo pg_ctlcluster 16 main start`.
- Local DB: database `athene`, role `athene` / password `athene`. `backend/.env` (gitignored, present in the VM) already holds `DATABASE_URL` and `SESSION_SECRET`.
- Apply schema with `npm run migrate` (idempotent; tracked in the `_migration` table). It seeds a default site `DF` and a login `admin` / password `admin`.

### Running
- `npm run dev` runs backend + frontend + mobile together; or run individually with `npm run dev -w backend` / `npm run dev -w frontend`.
- The frontend proxies `/api` (and WebSocket) to `http://localhost:3001`, so no extra config is needed for local dev.

### Non-obvious gotchas
- The backend dev server uses `tsx watch` (transpile only, no type-checking), so it runs even when `tsc` would fail. `npm run build -w backend` currently FAILS with a pre-existing type error (`computeMovingAverage` is not imported in `src/spareParts.ts`); this is unrelated to environment setup and does not affect dev. `npm run build -w frontend` succeeds.
- The Athene AI assistant / briefing / embeddings / voice features need `OPENAI_API_KEY` in `backend/.env`. They are unset by default and the app degrades gracefully without them (assistant routes disabled), so core CMMS flows work fine.
