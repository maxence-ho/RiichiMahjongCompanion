# UI/UX and Admin vs Member Differentiation Audit

## Scope
- Refine the initial master plan using current code realities.
- Focus on:
- Standard member simplicity
- Clear admin boundary
- UI consistency and usability
- Implementation order with low regression risk

## Key Findings (Current State)

### 1) Admin boundary is mostly visual, not structural
- Global nav always exposes `Admin` in the root layout.
- Non-admin users can still open `/admin` and see an "Access denied" panel instead of being routed out.
- Role checks are duplicated across pages with local `isAdmin` state.

### 2) Member and admin experiences are mixed in shared pages
- Competition detail currently serves both power-admin workflows and member workflows in one large page.
- Tournament controls and dense operational details increase cognitive load for regular members.
- Admin tools appear as conditional blocks instead of a dedicated admin information architecture.

### 3) UI consistency and clarity issues
- Mixed language labels in UI strings.
- Limited design tokens and primitive system.
- Repeated “card + border + text” composition without standardized variants or hierarchy conventions.
- Some list/table views use IDs instead of user-friendly labels.

### 4) Data-loading approach impacts UX responsiveness
- Multiple pages perform client-side multi-query orchestration with chained Firestore reads.
- Inbox and competition detail do N+1-style enrichment on the client.
- React Query provider exists, but query hooks are not used in pages.

### 5) Refactor risk concentration
- Largest frontend pages remain monolithic and hard to iterate safely.
- Runtime-critical functions still use `as any` in several paths.
- Web lacks automated tests for route-level behavior and role-based rendering.

## Evidence (File Hotspots)
- Global shared nav includes admin item:
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/layout.tsx:15`
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/layout.tsx:19`
- Non-admin can land on admin route; denied state rendered in page body:
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/admin/page.tsx:269`
- Local admin checks duplicated across pages:
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/club/page.tsx:27`
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/admin/page.tsx:73`
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/competitions/[id]/page.tsx:95`
- Competition detail combines many workflows in one page:
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/competitions/[id]/page.tsx:82`
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/competitions/[id]/page.tsx:356`
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/competitions/[id]/page.tsx:634`
- Inbox has heavy client-side enrichment and `any` maps:
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/inbox/page.tsx:78`
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/inbox/page.tsx:154`
- Mixed-language UI examples:
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/club/page.tsx:117`
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/club/page.tsx:128`
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/components/GameCard.tsx:22`
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/games/[id]/page.tsx:401`
- Minimal design token surface:
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/src/app/globals.css:5`
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/apps/web/tailwind.config.ts:8`
- Role enforcement in backend is present for critical admin operations:
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/functions/src/callable/createTournamentRoundPairings.ts:80`
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/functions/src/callable/adminUpsertClubMember.ts:20`
- Firestore rules also enforce admin writes to competitions:
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/firestore/firestore.rules:52`

## Refined Target Experience

### Member app (simple)
- Navigation limited to:
- Club overview
- Competitions
- Inbox
- Game details
- Competition page defaults to:
- Leaderboard
- My next action (submit score / review pending / wait)
- Recent validated games
- Hide admin operational controls and dense management details by default.

### Admin app (separate management console)
- Dedicated admin shell and nav:
- Competitions setup
- Tournament operations
- Members and roles
- Notification setup
- Competition admin view exposes full operational sections and controls.

## Refined Architecture Decisions
- Use route groups to split shells:
- `apps/web/src/app/(member)/...`
- `apps/web/src/app/(admin)/...`
- Introduce a centralized `useRole()` or `RoleProvider` derived from active club membership.
- Add `RequireRole` guard with redirect, not only in-page warning text.
- Keep backend authorization as source of truth (already mostly correct), but align frontend route access with it.

## Refined TODOs (Prioritized)

### P0: Role separation and navigation correctness
- [ ] Create `(member)` and `(admin)` route groups with distinct layouts.
- [ ] Remove static `Admin` entry from global shared layout.
- [ ] Add `RequireRole role="admin"` guard for all admin routes.
- [ ] Redirect non-admin visits to admin routes toward member home with clear message.
- [ ] Centralize role derivation to stop duplicating `isAdmin` fetch logic per page.

### P1: Member simplification (big UX win)
- [ ] Split competition detail into member-focused and admin-focused sections/components.
- [ ] Default member competition view to top 3 blocks:
- [ ] Leaderboard
- [ ] Pending approvals summary
- [ ] Recent games
- [ ] Move tournament orchestration controls behind admin-only route/section.
- [ ] Reduce dense rules wall in member view (summary + expandable full details).

### P1: UI consistency and language coherence
- [ ] Standardize all user-facing copy to one language.
- [ ] Add semantic design tokens (surface, text, border, success/warn/error).
- [ ] Build shared primitives: `Button`, `Input`, `Select`, `Card`, `EmptyState`, `SectionHeader`.
- [ ] Apply a consistent status and action hierarchy for primary/secondary/destructive actions.

### P2: Data and performance UX
- [ ] Migrate heavy pages to React Query hooks (`useInbox`, `useCompetitionDetail`, `useGameDetail`).
- [ ] Remove N+1 client enrichment where possible by denormalizing display fields in `validationRequests`.
- [ ] Add skeleton loading states to major lists and detail blocks.

### P2: Backend typing and safety that unlocks UI speed
- [ ] Replace `as any` in high-impact callables/core modules first:
- [ ] `createTournamentRoundPairings`
- [ ] `applyProposal`
- [ ] `submitTournamentTableResultProposal`
- [ ] Introduce typed Firestore DTO parse layer for runtime-critical docs.

### P3: Regression safety
- [ ] Add web tests for:
- [ ] member cannot see admin nav/actions
- [ ] non-admin redirect on admin routes
- [ ] admin route access and key actions rendering
- [ ] Keep existing functions tests green and expand role/approval edge-case coverage.

## Suggested Delivery Sequence (Refined)
- [ ] Step 1: Implement shell split + role guard + nav cleanup.
- [ ] Step 2: Extract competition detail into member/admin modules and simplify member default view.
- [ ] Step 3: Introduce UI primitives and apply to club/inbox/competition/game pages.
- [ ] Step 4: Move heavy data loading to hooks with React Query and improve loading states.
- [ ] Step 5: Tighten backend typing and add UI role-regression tests.

## Acceptance Criteria for This Refinement
- Non-admin users never see admin navigation in normal member flow.
- Visiting admin routes as non-admin does not show the admin page body.
- Member competition page can be understood in under 10 seconds (clear primary action).
- Admin can still execute all current operations without regression.
- UI language and component styling are consistent across all top-level routes.
