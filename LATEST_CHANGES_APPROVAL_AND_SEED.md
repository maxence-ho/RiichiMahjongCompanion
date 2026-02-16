# Implémentation - Approval UX + Seed Tournois

## 1) Afficher clairement l'utilisateur connecté
Fichiers:
- `/Users/maxence.ho/Documents/New project/apps/web/src/components/SessionInfo.tsx`
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/layout.tsx`

Changement:
- Ajout d'un indicateur de session dans le header:
  - `Connected as <name> (<email>)` quand connecté,
  - état `loading` / `not connected` sinon.

## 2) Détail game: statut d'approval par user (row user + status)
Fichier:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/games/[id]/page.tsx`

Changement:
- Sur une game `pending_validation`, affichage d'un bloc `Current approval status`.
- Pour chaque user requis:
  - nom à gauche,
  - badge de statut à droite (`approved`, `pending`, `rejected`).
- Résolution des noms via `clubs/{clubId}/members/{userId}.displayNameCache`.

## 3) Nommage des games de championnat dans l'inbox
Fichier:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/inbox/page.tsx`

Changement:
- Pour les games non-tournoi (championnat), titre formaté:
  - `<NomCompetition> - <GameId> • New game/Edit`
- Pour les games tournoi, le format round/table est conservé.
- Tri des demandes: pending d'abord, puis les plus récentes.

## 4) Bug approval qui reste pending: durcissement du flux
Fichier:
- `/Users/maxence.ho/Documents/New project/functions/src/callable/approveProposal.ts`

Changement:
- Normalisation/dédoublonnage des listes `requiredUserIds`, `approvedBy`, `rejectedBy`.
- Re-check défensif hors transaction avant `applyProposal` pour éviter les cas où l'unanimité n'est pas détectée correctement.
- Si unanimité confirmée, `applyProposal` est bien déclenché.

## 5) Tournoi: resubmit des résultats même en pending_validation
Fichier:
- `/Users/maxence.ho/Documents/New project/functions/src/callable/submitTournamentTableResultProposal.ts`

Changement:
- Une table en `pending_validation` accepte maintenant une resoumission.
- Le même proposal/game est réutilisé (pas de duplication):
  - scores/proposedVersion mis à jour,
  - `approvedBy`/`rejectedBy` remis à zéro,
  - validationRequests repassées à `pending`,
  - notifications renvoyées.

## 6) Seed local enrichi: 2 tournois avec algorithmes et états différents
Fichier:
- `/Users/maxence.ho/Documents/New project/functions/local-dev/seedLocal.ts`

Changement:
- Ajout de 2 compétitions tournoi:
  - `competition_seed_tournament_performance_2026`
    - `pairingAlgorithm: performance_swiss`
    - état d'avancement: round 1 completed, round 2 active
    - avec une game tournoi `pending_validation` liée à la table active
  - `competition_seed_tournament_precomputed_2026`
    - `pairingAlgorithm: precomputed_min_repeats`
    - état d'avancement: rounds 1-2 completed, round 3 active, round 4 scheduled
- Ajout des `tournamentRounds` correspondants.
- Ajout des leaderboard entries pour ces 2 tournois.

## 7) Vérifications
Commandes passées:
- `npm run build:functions`
- `npm run test -w functions`
- `npm run build -w apps/web`

Résultat:
- Build functions OK
- Tests functions OK (10/10)
- Build web OK
