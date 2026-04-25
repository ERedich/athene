# Athene CMMS

Monorepo: `backend`, `frontend`, `mobile` (mobile scaffold — see `mobile/README.md`).

## Dev

```bash
npm install
cp backend/.env.example backend/.env
# set DATABASE_URL in backend/.env
npm run dev
```

- Root `npm run dev` runs backend + frontend together.
- DB migrations: `npm run migrate` (from root) after `DATABASE_URL` is set.

See [Guidelines.md](./Guidelines.md).

## Deploy notes (Vercel)

- The frontend calls backend routes under `/api/...`.
- If frontend and backend are deployed on different domains, set `VITE_API_BASE_URL` for the frontend deployment (for example `https://your-backend-domain.vercel.app`).
- `backend/.env` is not committed (correct); set backend runtime env vars in your hosting platform:
  - `DATABASE_URL`
  - `SESSION_SECRET`
