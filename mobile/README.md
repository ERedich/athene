# Athene Mobile (React Native)

Planned React Native client for field / CMMS workflows. Share API contracts and i18n keys with `frontend` / `backend`.

## Next steps

- Initialize with React Native CLI or Expo (team choice).
- Align auth with backend session/JWT once defined.
- Reuse DE/EN strings (e.g. export JSON from `frontend/src/locales` or a future `packages/i18n` workspace).

## Scripts (placeholder)

From repo root after a RN app exists:

```bash
cd mobile
npm install
npm run android   # or ios
```

Until the native app is generated, use `npm run dev` at repo root for web + API only.
