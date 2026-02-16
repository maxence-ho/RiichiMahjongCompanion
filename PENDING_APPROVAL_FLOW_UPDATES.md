# Pending Approval Flow Updates

## Compressed context
Current app now supports:
- competition-scoped game creation,
- tournament pairing (performance or precomputed),
- unanimous approval workflow.

This update adds better pending-approval visibility, clearer game identification in inbox, and tournament table result resubmission while approval is pending.

## Implemented changes

### 1) Game details: per-player approval state when game is pending
File:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/games/[id]/page.tsx`

What changed:
- On pending games, a `Current approval status` block is shown.
- For each required participant, status is displayed as:
  - `approved`
  - `pending`
  - `rejected`
- Display names are resolved from club members (`displayNameCache`) for readability.

### 2) Inbox: clearer game identification for approval
File:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/inbox/page.tsx`

What changed:
- Inbox entries are enriched with readable labels:
  - competition name,
  - tournament context when available (`Round X - Table Y`),
  - participants display names,
  - short game reference.
- Entries are sorted with `pending` first, then newest.
- Keeps direct link to game details.

### 3) Tournament: allow result resubmission while table is pending validation
File:
- `/Users/maxence.ho/Documents/New project/functions/src/callable/submitTournamentTableResultProposal.ts`

What changed:
- `pending_validation` table status is now accepted for submission.
- If table already has a pending proposal/game:
  - proposal scores are updated,
  - approval state is reset (`approvedBy`/`rejectedBy` cleared),
  - validation requests are reset to `pending`,
  - participants are notified again,
  - same game/proposal is reused (no duplicate game creation).

### 4) Tournament page root: show pending approvals immediately
File:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/competitions/[id]/page.tsx`

What changed:
- Added top `Approval gate` block on tournament page.
- Shows pending approval count and preview list of pending games.
- Includes shortcut button to open the `Games` tab.
- In `Round input`, pending-validation tables can now be resubmitted with explicit action label:
  - `Resubmit and restart approval`.

## Regression checks
Executed successfully:
- `npm run build:functions`
- `npm run test -w functions`
- `npm run build -w apps/web`

Result:
- Functions build: OK
- Functions tests: OK (10/10)
- Web build: OK
