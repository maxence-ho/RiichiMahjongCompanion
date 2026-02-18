# Mahjong Club WebApp

MVP implementation of a responsive Mahjong club webapp with Firebase backend.

## Structure

- `apps/web`: Next.js (App Router, TypeScript, Tailwind)
- `functions`: Firebase Cloud Functions (TypeScript)
- `firestore`: security rules and indexes
- `functions/local-dev`: local-only scripts (not deployed runtime)

## Scope separation

- Production runtime code:
  - `apps/web/src/**`
  - `functions/src/callable/**`
  - `functions/src/core/**`
  - `functions/src/firestore/**`
  - `functions/src/index.ts`
  - `firestore/**`
- Local development / test utilities:
  - `functions/local-dev/**` (seed emulator)
  - `functions/test/**` (unit tests)

`functions/tsconfig.json` excludes `functions/local-dev/**` from Cloud Functions build output.

## Features implemented

- Firebase Auth UI (`/login`)
- Club dashboard (`/club`)
- Competition list and detail leaderboard (`/competitions`, `/competitions/[id]`)
- Create game proposal from competition context (`/competitions/[id]`, `/games/new?competitionId=...`)
- Inbox for approval/rejection (`/inbox`)
- Game detail + edit proposal (`/games/[id]`)
- Admin competition creation + push token registration (`/admin`)
- Tournament rounds generation + table result submission (admin/players flow)
- Callable functions:
  - `submitGameCreateProposal`
  - `submitGameEditProposal`
  - `approveProposal`
  - `rejectProposal`
- Immutable versions and leaderboard delta update on proposal application
- Firestore rules blocking direct critical writes from client
- Unit tests for scoring, leaderboard delta, transitions

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure web env:

```bash
cp apps/web/.env.example apps/web/.env.local
```

For local emulator usage, keep `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` in `apps/web/.env.local`.

3. Set Firebase project id in `.firebaserc`.

4. Run locally:

```bash
npm run dev:web
npm run dev:functions
```

If you change `.env.local`, restart `npm run dev:web`.

If Functions emulator reports `functions/lib/index.js does not exist`, run:

```bash
npm run build:functions
```

`npm run dev:functions` now builds Functions automatically before start.
It also resets and seeds emulator data before start so every session begins from the same state.

## Docker

### Local stack (admin-only seed)

From repo root:

```bash
docker compose -f docker/compose.local.yml up --build
```

Or:

```bash
npm run docker:local
```

This starts:

- Next.js web app on `http://localhost:3000`
- Firebase emulators (UI/Auth/Firestore/Functions) on `4000/9099/8080/5001`
- Deterministic admin-only seed data (single admin + single club)

Default local admin credentials:

- Email: `admin@mahjong.local`
- Password: `Test1234!`

You can override with env vars:

- `LOCAL_ADMIN_EMAIL`
- `LOCAL_ADMIN_PASSWORD`
- `LOCAL_ADMIN_UID`
- `LOCAL_ADMIN_CLUB_ID`
- `LOCAL_ADMIN_CLUB_NAME`

### Production web container

Set production Firebase web env values before build:

```bash
export NEXT_PUBLIC_FIREBASE_API_KEY="..."
export NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="..."
export NEXT_PUBLIC_FIREBASE_PROJECT_ID="..."
export NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="..."
export NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
export NEXT_PUBLIC_FIREBASE_APP_ID="..."
export NEXT_PUBLIC_FIREBASE_VAPID_KEY="..."
```

Then run:

```bash
docker compose -f docker/compose.prod.yml up --build -d
```

Or:

```bash
npm run docker:prod
```

Production compose builds/runs the web app container only.
Firebase Functions deployment remains managed by Firebase CLI:

```bash
npm run deploy -w functions
```

## Seed local data (Emulators)

1. Start full local environment:

```bash
npm run dev:functions
```

This always performs a deterministic reset/seed, then starts emulators.

2. Start web app in another terminal:

```bash
npm run dev:web
```

Manual one-shot seed only (starts/stops emulators automatically):

```bash
npm run seed:local:exec
```

`seed:local:exec` exports snapshot data to `.emulator-seed`.

Admin-only one-shot seed (for local Docker/minimal bootstrapping):

```bash
npm run seed:local:admin:exec
```

Admin-only emulator start:

```bash
npm run dev:functions:admin
```

This creates:

- 1 club: `club_seed_main`
- 1 active competition: `competition_seed_championship_2026`
- 3 validated games in history + leaderboard entries
- 3 active pending games
- 1 pending game with only non-admin users (`u_alice`, `u_bob`, `u_charlie`, `u_diana`) and approval requests
- 5 auth users (Auth emulator), password: `Test1234!`

Accounts:

- `admin@mahjong.local` (`u_admin`, admin)
- `alice@mahjong.local` (`u_alice`, member)
- `bob@mahjong.local` (`u_bob`, member)
- `charlie@mahjong.local` (`u_charlie`, member)
- `diana@mahjong.local` (`u_diana`, member)

## Notes

- Replace placeholders in `apps/web/public/firebase-messaging-sw.js` with real Firebase web config values.
- Push notifications require HTTPS and user permission.
- Browser push also requires `NEXT_PUBLIC_FIREBASE_APP_ID` and `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`.
- If seed fails with `ECONNREFUSED 127.0.0.1:9099`, Auth emulator is not running.
- In local emulator mode, use Inbox fallback (`/inbox`) as the primary validation channel.
- Games must always belong to exactly one competition.
# RiichiMahjongCompanion
