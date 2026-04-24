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
