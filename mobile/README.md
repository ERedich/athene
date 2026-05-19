# Athene Mobile (Expo + React Native Web)

Field client for **Kostenstellen** and **Assets** with the same backend session cookie as the web app (`HttpOnly` `athene.sid`). **Expo Web** is the primary target for now; native iOS/Android is possible later with extra auth work.

## Prerequisites

- Node 20+ (recommended)
- Backend running on `http://localhost:3001` (see repo root `README.md`)
- PostgreSQL + migrations applied

## Setup

```bash
# from repo root
npm install

cd mobile
cp .env.example .env
# default EXPO_PUBLIC_API_BASE_URL=http://localhost:3001 is fine for local dev
```

## Run (browser)

Terminal 1 — API:

```bash
cd ..   # repo root
npm run dev -w backend
```

Terminal 2 — Expo Web:

```bash
cd mobile
npm run web
```

Open the URL printed by Expo (typically `http://localhost:8081`). Sign in with a valid user; then use **Apps** → Kostenstellen or Assets.

From repo root you can also run:

```bash
npm run dev:mobile
```

## API base URL

- **Local:** `EXPO_PUBLIC_API_BASE_URL=http://localhost:3001` in `mobile/.env`
- **Cross-origin:** Backend already uses `cors({ origin: true, credentials: true })`. Browser session cookies work for `localhost` → `localhost` (different ports, same site).

## Design notes

- **Login only:** visual tokens live in [`src/screens/login/loginDesign.ts`](src/screens/login/loginDesign.ts) (light + dark). Do not import that file from post-login screens.
- **Post-login shell:** light/dark tokens in [`src/styles/appTheme.ts`](src/styles/appTheme.ts), toggled in the header (sun/moon) next to language; preference is persisted with AsyncStorage (`athene.appShellColorScheme`).

## Phase 2 (not in v1)

- **Asset documents (mobile UI):** backend supports `/api/assets/:id/documents/...` (unified `document` table); mobile Asset editor UI not yet implemented.
- **Asset tree** view (hierarchy table like web).
- **Native apps without browser cookies:** add a token-based login (e.g. extend `/api/auth/login` to return a bearer token for mobile) — cookies do not apply the same way outside the web runtime.

## Shared i18n (future)

Strings are duplicated under `src/locales/` for now. A future `packages/i18n` workspace can merge keys with `frontend/src/locales`.
