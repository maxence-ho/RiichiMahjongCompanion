# Local Dev Tools

This folder contains local-only utilities.

- `seedLocal.ts`: seeds Firebase emulators (Auth + Firestore) with deterministic data.

Run from repo root:

```bash
npm run seed:local
```

Recommended persistent seed flow:

```bash
npm run seed:local:exec
```

`seedLocal.ts` performs a deterministic reset (Auth + Firestore) before creating fixtures.

Safety:

- Script targets emulators via `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST`.
- Do not use this folder for production Cloud Functions code.
