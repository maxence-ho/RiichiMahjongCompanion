# Codebase Refactor, UI/UX Upgrade, and Admin/User Separation Plan

## Outcome We Want
- A maintainable codebase with clear module boundaries and strong typing.
- A modern, consistent, accessible UI system across the whole app.
- A clearly separated admin experience and a simplified member experience.
- No regression on current business flows (proposal validation, tournament rounds, scoring, approvals).

## Refinement Companion
- Detailed audit and refined priorities are documented in:
- `/Users/maxence.ho/dev/RiichiMahjongCompanion/UI_UX_ROLE_REFINEMENT_AUDIT.md`

## Current Baseline (from this repository)
- Web app is Next.js App Router + Firebase client reads/callables.
- Backend is Firebase Functions with domain logic in `functions/src/core`.
- Largest refactor hotspots today:
- `apps/web/src/app/admin/page.tsx` (724 lines)
- `apps/web/src/app/competitions/[id]/page.tsx` (688 lines)
- `apps/web/src/app/games/[id]/page.tsx` (437 lines)
- `functions/src/callable/createTournamentRoundPairings.ts` (325 lines)
- `functions/src/core/tournamentPairing.ts` (283 lines)
- `functions/src/core/applyProposal.ts` (276 lines)
- Type safety gaps exist (`as any` in multiple backend and frontend modules).
- Functions unit tests exist, but web has no automated test suite.
- Layout/navigation is mostly shared for all users, with admin exposed in the main shell.

## Strategy
- Use incremental refactor, not a big-bang rewrite.
- Establish quality gates first, then refactor by vertical slices.
- Separate user experiences through route groups + role guards + dedicated navigation.
- Move from page-heavy code to domain modules, feature hooks, and reusable UI primitives.

## Phases

### Phase 0: Guardrails and Architecture Baseline
- [ ] Create a single architecture map document for web + functions data flow.
- [ ] Define coding standards for TypeScript strictness, naming, file organization, and error handling.
- [ ] Add CI checks: `build web`, `build functions`, `functions tests`, `lint`, and `typecheck`.
- [ ] Add PR checklist with mandatory regression checks for admin and member flows.
- [ ] Add logging conventions for callables and critical user actions.

### Phase 1: Role-Based Experience Split (Highest Priority)
- [ ] Introduce Next.js route groups for clear separation:
- [ ] `apps/web/src/app/(member)/*`
- [ ] `apps/web/src/app/(admin)/*`
- [ ] Create dedicated layouts:
- [ ] Member layout: minimal nav, task-focused actions, low cognitive load.
- [ ] Admin layout: management tools, higher information density.
- [ ] Replace ad-hoc `isAdmin` checks with centralized role guard helpers/components.
- [ ] Remove admin entry points from member navigation entirely.
- [ ] Add explicit unauthorized states for admin routes (not just hidden links).
- [ ] Define simple member IA:
- [ ] Home (club summary)
- [ ] Competitions
- [ ] Inbox/Approvals
- [ ] Game details
- [ ] Define admin IA:
- [ ] Competition setup
- [ ] Tournament round orchestration
- [ ] Member management
- [ ] Rules configuration
- [ ] Push/notification admin controls

### Phase 2: Frontend Architecture Refactor
- [ ] Break large page components into feature modules:
- [ ] Container (data orchestration)
- [ ] Presentational UI sections
- [ ] Reusable forms and tables
- [ ] Extract data-fetch logic from pages into hooks/repositories.
- [ ] Standardize data loading/error/empty states in shared components.
- [ ] Replace duplicated normalization helpers with shared utilities.
- [ ] Move competition and game domain logic into dedicated frontend domain modules.
- [ ] Normalize copy language across UI (avoid mixed language in user-facing labels).

### Phase 3: UI/UX System Upgrade
- [ ] Create a design token system in `apps/web/src/app/globals.css` and Tailwind config:
- [ ] semantic colors
- [ ] spacing scale
- [ ] typography scale
- [ ] radius/shadow/elevation
- [ ] Build reusable UI primitives:
- [ ] buttons (primary/secondary/destructive/ghost)
- [ ] input/select/checkbox
- [ ] cards, alerts, badges, table shells
- [ ] page header, section shell, empty state, skeleton state
- [ ] Redesign high-traffic screens first:
- [ ] Club dashboard
- [ ] Competition detail
- [ ] Inbox
- [ ] Game detail
- [ ] Admin competition creation
- [ ] Accessibility pass:
- [ ] visible focus states
- [ ] semantic headings/landmarks
- [ ] color contrast compliance
- [ ] keyboard-only navigation
- [ ] responsive behavior for mobile-first member experience

### Phase 4: Backend and Domain Hardening
- [ ] Remove `as any` in `functions/src/callable/*` and `functions/src/core/*`.
- [ ] Introduce typed Firestore document contracts and parser boundaries.
- [ ] Split callable handlers into:
- [ ] input validation
- [ ] permission checks
- [ ] pure domain logic
- [ ] persistence adapter
- [ ] Refactor `applyProposal` transaction into smaller testable units.
- [ ] Refactor tournament pairing flow for readability and deterministic behavior.
- [ ] Centralize shared validators and identity normalization logic.
- [ ] Add consistent domain error taxonomy and messages.

### Phase 5: Testing and Quality Expansion
- [ ] Keep current functions tests green during each phase.
- [ ] Expand functions tests:
- [ ] proposal lifecycle edge cases
- [ ] tournament round activation/completion edge cases
- [ ] role/permission edge cases
- [ ] Add web unit tests (component + hook level).
- [ ] Add e2e tests for:
- [ ] member happy paths
- [ ] admin happy paths
- [ ] unauthorized route attempts
- [ ] regression around approval gates and round progression

### Phase 6: Rollout and Stabilization
- [ ] Launch behind feature flags for new member and admin shells.
- [ ] Run side-by-side verification in emulator with seeded data.
- [ ] Perform QA checklist per flow before enabling by default.
- [ ] Monitor error rates and callable failures after rollout.
- [ ] Remove deprecated UI paths and dead code once stable.

## Parallel Workstreams
- Workstream A (Platform): CI, lint/type gates, test framework setup.
- Workstream B (Role Split): route groups, guards, nav separation.
- Workstream C (Frontend Refactor): page decomposition, hooks, reusable components.
- Workstream D (Design System): tokens, primitives, accessibility.
- Workstream E (Backend Refactor): typed contracts, callable decomposition, tests.

## Definition of Done
- No admin UI is visible or reachable by non-admin users.
- Member app has a reduced navigation surface and simpler workflows.
- Top 6 largest modules are split into smaller focused units.
- `as any` usage is removed from runtime-critical backend paths.
- Web has automated tests for core screens and critical hooks.
- Functions test suite remains green and expanded for new edge cases.
- Lighthouse/accessibility checks pass agreed thresholds on member screens.

## Suggested Execution Order (Pragmatic)
- [ ] Week 1: Phase 0 + start Phase 1 (route groups and role guards).
- [ ] Week 2: Complete Phase 1 + start Phase 2 on `competitions/[id]` and `games/[id]`.
- [ ] Week 3: Finish Phase 2 + begin Phase 3 component system.
- [ ] Week 4: Continue Phase 3 + Phase 4 backend typing and decomposition.
- [ ] Week 5: Phase 5 testing expansion + Phase 6 staged rollout.

## First Concrete TODO Batch (Start Here)
- [ ] Create `(member)` and `(admin)` layouts and move routes.
- [ ] Implement centralized role guard and unauthorized page.
- [ ] Extract `apps/web/src/app/competitions/[id]/page.tsx` into feature sections/hooks.
- [ ] Extract `apps/web/src/app/admin/page.tsx` into admin modules.
- [ ] Add web test tooling and first tests for club/inbox route behavior.
- [ ] Type and refactor `functions/src/core/applyProposal.ts` transaction helpers.
- [ ] Type and refactor `functions/src/callable/createTournamentRoundPairings.ts`.
