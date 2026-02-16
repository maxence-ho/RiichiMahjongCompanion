# Implémentation - État actuel

## 1) Plan d’action (déjà produit)
Le plan demandé est présent dans:
- `/Users/maxence.ho/Documents/New project/FEATURE_CHANGE_PLAN.md`

## 2) Implémentation réalisée

### A. Déclaration de game uniquement depuis une compétition
- Le flux de création est contraint à **exactement 1 compétition** (backend + UI).
- La page `/games/new` exige le `competitionId` en query param; sinon elle renvoie vers `/competitions`.
- La navigation globale ne pousse plus la création de game hors contexte compétition.

Fichiers principaux:
- `/Users/maxence.ho/Documents/New project/functions/src/core/validators.ts`
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/games/new/page.tsx`
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/layout.tsx`

### B. Dashboard compétition (dernieres games + pending approvals)
- La page détail compétition affiche:
  - les dernières games validées,
  - les games en `pending_validation`,
  - le leaderboard,
  - les règles de la compétition.
- Déclaration de game:
  - mobile: lien vers page dédiée,
  - desktop: panneau latéral sur la page compétition.

Fichier principal:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/competitions/[id]/page.tsx`

### C. Permissions admin/user
- Les actions de gestion (création compétition, gestion membres) sont réservées admin.
- Les membres non-admin naviguent compétitions + inbox.

Fichiers principaux:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/admin/page.tsx`
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/club/page.tsx`
- `/Users/maxence.ho/Documents/New project/functions/src/callable/adminUpsertClubMember.ts`
- `/Users/maxence.ho/Documents/New project/firestore/firestore.rules`

### D. Règles de compétition enrichies
- Ajout/prise en compte de règles détaillées (UMA, points départ/retour, aka/ura/ippatsu, etc.).
- Affichage clair des règles dans la page compétition.

Fichiers principaux:
- `/Users/maxence.ho/Documents/New project/functions/src/types.ts`
- `/Users/maxence.ho/Documents/New project/apps/web/src/domain/models.ts`
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/competitions/[id]/page.tsx`

### E. Tournois (rounds/hanchan + appariement + résultats)
- Ajout des callables pour:
  - créer le round suivant (`createTournamentRoundPairings`),
  - soumettre un résultat de table (`submitTournamentTableResultProposal`).
- Algorithme d’appariement pour limiter les re-rencontres.
- Contrainte: un seul round actif à la fois.
- Résultats de table -> flow d’approval existant.

Fichiers principaux:
- `/Users/maxence.ho/Documents/New project/functions/src/core/tournamentPairing.ts`
- `/Users/maxence.ho/Documents/New project/functions/src/callable/createTournamentRoundPairings.ts`
- `/Users/maxence.ho/Documents/New project/functions/src/callable/submitTournamentTableResultProposal.ts`
- `/Users/maxence.ho/Documents/New project/functions/src/index.ts`

## 3) Correctifs critiques appliqués pendant cette passe

### A. Erreurs approve/reject
Cause corrigée: lectures Firestore effectuées après écritures dans la même transaction (provoquait des erreurs `internal`).

Fichiers corrigés:
- `/Users/maxence.ho/Documents/New project/functions/src/callable/approveProposal.ts`
- `/Users/maxence.ho/Documents/New project/functions/src/callable/rejectProposal.ts`
- `/Users/maxence.ho/Documents/New project/functions/src/core/applyProposal.ts`

### B. Build web (prerender) cassé avec config Firebase absente
- Le client Firebase n’interrompt plus le build statique.
- Ajout de garde pour Messaging (pas d’appel si `appId`/`messagingSenderId` absents).
- Enregistrement service worker conditionnel (uniquement si config messaging présente).
- Correction `useSearchParams` avec boundary `Suspense` sur `/games/new`.

Fichiers corrigés:
- `/Users/maxence.ho/Documents/New project/apps/web/src/lib/firebaseClient.ts`
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/providers.tsx`
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/games/new/page.tsx`

## 4) Validation technique (ok)

### Build
- `npm run build:functions` ✅
- `npm run build -w apps/web` ✅

### Tests
- `npm run test -w functions` ✅
- 4 fichiers de tests passés, 9 tests passés.

## 5) Seed local deterministic (état)
Le dev local reset + seed de manière déterministe à chaque démarrage functions.

Scripts:
- `npm run dev:functions`
- `npm run seed:local:exec`

Comportement seed:
- mêmes users,
- même club,
- même championnat,
- 3 games validées,
- 3 games actives pending,
- 1 game pending avec les 4 users non-admin.

Références:
- `/Users/maxence.ho/Documents/New project/functions/local-dev/seedLocal.ts`
- `/Users/maxence.ho/Documents/New project/package.json`
- `/Users/maxence.ho/Documents/New project/README.md`

## 6) Comment tester rapidement en local
1. Terminal A:
   - `cd "/Users/maxence.ho/Documents/New project"`
   - `npm run dev:functions`
2. Terminal B:
   - `cd "/Users/maxence.ho/Documents/New project"`
   - `npm run dev:web`
3. Ouvrir `http://localhost:3000`.
4. Se connecter avec par exemple:
   - `admin@mahjong.local` / `Test1234!`
   - `alice@mahjong.local` / `Test1234!`

## 7) Limites connues
- Les push navigateur FCM nécessitent une vraie config web Firebase (notamment `appId`, `messagingSenderId`, `vapidKey`) et HTTPS selon navigateur.
- En local émulateurs, l’inbox reste le fallback principal.
