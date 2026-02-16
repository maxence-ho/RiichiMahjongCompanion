# Approval Rework (Per-Player) - Implementation Notes

## What was changed

### 1) Canonical approval domain model
- Added `/Users/maxence.ho/Documents/New project/functions/src/core/approval.ts`.
- This module now defines:
  - per-user approval status (`pending | approved | rejected`)
  - normalization/legacy compatibility (`requiredUserIds`, `approvedBy`, `rejectedBy`)
  - unanimity computation (`all required users approved`, no rejection)
  - decision application rules per user (`approve` / `reject`)

### 2) Backend callables now use per-user approval as source of truth
- Updated `/Users/maxence.ho/Documents/New project/functions/src/callable/submitGameCreateProposal.ts`:
  - proposal initialization now writes `validation.userApprovals`.
- Updated `/Users/maxence.ho/Documents/New project/functions/src/callable/submitGameEditProposal.ts`:
  - same per-user initialization for edit proposals.
- Updated `/Users/maxence.ho/Documents/New project/functions/src/callable/submitTournamentTableResultProposal.ts`:
  - resubmission resets validation to canonical pending per-user statuses.
- Updated `/Users/maxence.ho/Documents/New project/functions/src/callable/approveProposal.ts`:
  - approval is applied for the current user only.
  - proposal apply is only triggered when unanimity is truly reached.
- Updated `/Users/maxence.ho/Documents/New project/functions/src/callable/rejectProposal.ts`:
  - rejection is applied for the current user only.
  - proposal/game transition remains `rejected` / `disputed`.
- Updated `/Users/maxence.ho/Documents/New project/functions/src/core/applyProposal.ts`:
  - unanimity/rejection checks now use canonical per-user resolution.

### 3) Seed data aligned with per-user status and deterministic scenario
- Updated `/Users/maxence.ho/Documents/New project/functions/local-dev/seedLocal.ts`:
  - added helper to build `validation.userApprovals`.
  - proposals now include `validation.userApprovals`.
  - `game_seed_active_pending_3` is seeded with 3 already approved users:
    - `u_alice`, `u_bob`, `u_diana`
    - `u_admin` remains pending.

### 4) Web game detail page now displays user-level approval reliably
- Updated `/Users/maxence.ho/Documents/New project/apps/web/src/app/games/[id]/page.tsx`:
  - supports `validation.userApprovals`.
  - fetches `validationRequests` for the pending proposal and uses those statuses as highest-priority display source.
  - fallback chain is now:
    1. `validationRequests`
    2. `validation.userApprovals`
    3. legacy arrays (`approvedBy`, `rejectedBy`)

## Tests added
- Added `/Users/maxence.ho/Documents/New project/functions/test/approvalDomain.test.ts` with extended domain scenarios:
  - initialization of pending validation
  - legacy compatibility resolution
  - progressive approvals until unanimity
  - rejection path and prevention of invalid reverse action
  - unauthorized user action
  - idempotent approval
  - mixed legacy + explicit map precedence

## Verification commands run
- `npm run build:functions` -> OK
- `npm run test -w functions` -> OK (18 tests passed)
- `npm run build -w apps/web` -> OK

## Quick local validation scenario
1. Start env + seed:
   - `npm run seed:local:exec`
   - `npm run dev:functions`
   - `npm run dev:web`
2. Open:
   - `http://localhost:3000/games/game_seed_active_pending_3`
3. Expected on detail page:
   - `u_alice`, `u_bob`, `u_diana` shown as `approved`
   - `u_admin` shown as `pending`
4. Approve as `u_admin`:
   - game should transition to `validated` (because unanimity is now complete).
