# Local Dev Tools

This folder contains local-only utilities.

- `seedLocal.ts`: seeds Firebase emulators (Auth + Firestore) with deterministic data.
- `seedAdminLocal.ts`: seeds Firebase emulators with a minimal admin-only dataset.

Run from repo root:

```bash
npm run seed:local
```

Recommended persistent seed flow:

```bash
npm run seed:local:exec
```

`seedLocal.ts` performs a deterministic reset (Auth + Firestore) before creating fixtures.

Admin-only seed flow:

```bash
npm run seed:local:admin:exec
```

`seedAdminLocal.ts` resets Auth + Firestore, then creates:

- 1 auth user (`admin@mahjong.local` by default)
- 1 club
- 1 club member document with role `admin`
- 1 user profile document linked to the seeded club

Safety:

- Script targets emulators via `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST`.
- Do not use this folder for production Cloud Functions code.
