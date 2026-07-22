# Athene CMMS

Monorepo: `backend`, `frontend`, `mobile` (Expo + React Native Web — see [`mobile/README.md`](./mobile/README.md)).

## Dev

```bash
npm install
cp backend/.env.example backend/.env
# set DATABASE_URL in backend/.env
npm run dev
```

- Root `npm run dev` runs backend + frontend together.
- Mobile web: `npm run dev:mobile` (backend must run separately or use a second terminal with `npm run dev -w backend`).
- DB migrations: `npm run migrate` (from root) after `DATABASE_URL` is set.

See [Guidelines.md](./Guidelines.md).

## Deploy notes (Vercel)

- The frontend calls backend routes under `/api/...`.
- If frontend and backend are deployed on different domains, set `VITE_API_BASE_URL` for the frontend deployment (for example `https://your-backend-domain.vercel.app`).
- **Mobile (Expo Web)** can be hosted as a separate Vercel project with Root Directory `mobile`. Set `EXPO_PUBLIC_API_BASE_URL` to the backend origin. See [`mobile/README.md`](./mobile/README.md#deploy-on-vercel-phone-browser). Open the deployed URL in Chrome/Firefox on a phone — no Expo Go required.
- `backend/.env` is not committed (correct); set backend runtime env vars in your hosting platform:
  - `DATABASE_URL`
  - `SESSION_SECRET`
