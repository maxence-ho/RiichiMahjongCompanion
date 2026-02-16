# Mise à jour: algorithmes d'appariement de tournoi

## Objectif implémenté
Tu peux maintenant choisir **l'algorithme d'appariement** à la création d'un tournoi:

- `performance_swiss`:
  - génération des tables **round par round**,
  - tient compte des standings + pénalité de re-rencontre.
- `precomputed_min_repeats`:
  - génération de **toutes les tables de tous les rounds à l'avance**,
  - objectif: minimiser les re-rencontres sur l'ensemble du tournoi.

## Ce qui a changé

### 1) Admin: choix d'algorithme à la création du tournoi
Fichier:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/admin/page.tsx`

Ajouts:
- champ `Pairing algorithm` dans les settings tournoi.
- stockage dans `tournamentConfig.pairingAlgorithm`.
- si tournoi `active` + algo `precomputed_min_repeats`, l'initialisation du planning complet est lancée automatiquement.

### 2) Backend: support des 2 modes dans le callable de rounds
Fichier:
- `/Users/maxence.ho/Documents/New project/functions/src/callable/createTournamentRoundPairings.ts`

Comportement:
- `performance_swiss`:
  - conserve le comportement existant (génération du prochain round seulement).
- `precomputed_min_repeats`:
  - si aucun round n'existe: calcule tout le planning (`totalRounds`) et crée tous les docs `tournamentRounds`:
    - round 1: `active`
    - rounds suivants: `scheduled`
  - ensuite, quand il n'y a plus de round actif, le même callable active simplement le prochain round `scheduled`.

### 3) Nouveau moteur de planning complet
Fichier:
- `/Users/maxence.ho/Documents/New project/functions/src/core/tournamentPairing.ts`

Ajouts:
- type `TournamentPairingAlgorithm`.
- `generatePrecomputedTournamentSchedule(...)`:
  - tente plusieurs constructions (recherche multi-attempts déterministe),
  - optimise la distribution globale des rencontres,
  - minimise d'abord le nombre max de re-rencontres d'une paire, puis l'excès de répétitions.

### 4) UI compétition: affichage du mode + rounds scheduled
Fichier:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/competitions/[id]/page.tsx`

Ajouts:
- affichage de l'algorithme sélectionné.
- compteur des rounds `scheduled` restants en mode pré-calcul.
- libellé dynamique du bouton admin:
  - `Initialize full schedule` (première initialisation),
  - `Start next scheduled round` (activation round suivant),
  - ou `Create next round` (mode performance).

### 5) Modèle + badges
Fichiers:
- `/Users/maxence.ho/Documents/New project/apps/web/src/domain/models.ts`
- `/Users/maxence.ho/Documents/New project/apps/web/src/components/StatusBadge.tsx`

Ajouts:
- `tournamentConfig.pairingAlgorithm` dans le modèle.
- status badge `scheduled`.

### 6) Tests
Fichier:
- `/Users/maxence.ho/Documents/New project/functions/test/tournamentPairing.test.ts`

Ajout d'un test pour le planning pré-calculé.

## Validation technique
Commandes exécutées avec succès:
- `npm run build`
- `npm run test`

## Comment tester rapidement
1. Lancer les services:
   - `npm run dev:functions`
   - `npm run dev:web`
2. Se connecter en admin: `admin@mahjong.local` / `Test1234!`.
3. Créer un tournoi en choisissant:
   - `Precompute all rounds (min repeat encounters)`.
4. Vérifier dans la page compétition du tournoi:
   - round 1 actif,
   - rounds suivants en `scheduled`,
   - bouton admin `Start next scheduled round` après clôture du round actif.
