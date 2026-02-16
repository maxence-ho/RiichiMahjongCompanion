# Seed INIT Rework (done)

## Implemented

- Reworked `/Users/maxence.ho/Documents/New project/functions/local-dev/seedLocal.ts`.
- Local seed now resets deterministically with:
  - `1` admin + `12` members.
  - `1` championship (`active`) with a current state and multiple games.
  - `1` performance tournament (`active`) with multiple games.
  - `1` precomputed tournament (`active`) where all rounds are pre-defined in advance, with multiple games.

## Dataset shape

- Users:
  - Admin: `admin@mahjong.local`
  - Members: `alice@mahjong.local`, `bob@mahjong.local`, `charlie@mahjong.local`, `diana@mahjong.local`, `evan@mahjong.local`, `fiona@mahjong.local`, `george@mahjong.local`, `hanna@mahjong.local`, `ivan@mahjong.local`, `julia@mahjong.local`, `kevin@mahjong.local`, `lina@mahjong.local`
  - Password for all: `Test1234!`
- All 12 members are in the club and used across championship + tournaments.
- Championship includes games covering all 12 members.
- Performance tournament includes completed, active, pending-validation, and scheduled round/table states.
- Precomputed tournament has all rounds (`round_01`..`round_04`) already created; state is mid-progress with validated, pending-validation, and scheduled tables.

## Validity and approval integrity

- Every seeded game is validated against rules before write:
  - exactly 4 unique participants,
  - score keys match participants exactly,
  - score sum matches the competition rule `scoreSum`.
- Competition-specific rules are applied correctly:
  - championship uses club default rules,
  - performance and precomputed tournaments use override rules.
- Pending proposals are coherent:
  - `validation.requiredUserIds`,
  - `validation.userApprovals`,
  - `validation.approvedBy` / `validation.rejectedBy`,
  - `validationRequests` per user,
  all aligned (no corrupted approval state).

## Verification run

- `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck functions/local-dev/seedLocal.ts`
- `npm run build:functions`
- `npm run test -w functions` (all tests pass)
