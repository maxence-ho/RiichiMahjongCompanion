# Plan d'action — Évolution Compétitions / Championnats / Tournois

## 1) Objectifs fonctionnels demandés

1. Déclarer une game uniquement depuis une compétition (plus de création “hors compétition”).
2. UX de déclaration de game depuis la page compétition:
   - mobile: page dédiée
   - desktop: panneau latéral dans la page compétition
3. Dashboard compétition:
   - dernières games validées
   - games en attente d'approbation
4. Gouvernance rôles:
   - admin seul: création/gestion compétitions, gestion membres
   - membres: navigation compétitions + inbox + validation
5. Règles de compétition configurables à la création (admin):
   - points initiaux/retour, UMA, arrondis, oka
   - options règles riichi (aka dora, ura/kan dora, ippatsu, etc.)
   - affichage clair des règles dans la page compétition
6. Support tournois en plus des championnats:
   - participants du tournoi
   - nombre de rounds (hanchan)
   - un seul round actif à la fois
   - affectation auto des tables par round avec minimisation des re-rencontres
   - saisie des résultats par table et mise à jour classement par round

## 2) Références règles / tournoi (analyse)

Sources consultées:
- WRC rules (points initiaux, UMA, options telles que aka dora / head bump / agari-yame selon variantes):
  - https://www.worldriichi.org/s/WRC_Rules_2022_20220708_site.pdf
- WRC league variants (exemples de paramètres tournoi):
  - https://www.worldriichi.org/teamrules
- Principes d’appariement tournoi évitant les répétitions (Swiss/Dutch, non-repetitive similar performance):
  - https://mahjongsoft.com/tour.php
  - https://www.mahjongsoft.com/tour_general.php

Décision d’implémentation:
- Les règles seront entièrement paramétrables par admin.
- L’algorithme d’appariement sera un greedy Swiss-like: regroupement par performance + minimisation du coût de re-rencontre.

## 3) Changements techniques prévus

### 3.1 Data model

- `clubs/{clubId}/competitions/{competitionId}`
  - `rules.overrideRules`: enrichi (aka dora, ippatsu, ura/kan dora, tobi, head bump, noten, honba, riichi stick, etc.)
  - `tournamentConfig` (si type `tournament`):
    - `participantUserIds: string[]`
    - `totalRounds: number`
  - `tournamentState`:
    - `activeRoundNumber: number | null`
    - `lastCompletedRound: number`

- Nouvelle collection `tournamentRounds/{roundId}`
  - `clubId`, `competitionId`, `roundNumber`, `status`
  - `tables` (mapping table => joueurs + statut + proposal/game)

- `games/{gameId}` / `editProposals/{proposalId}`
  - `tournamentContext?` (round/table)

### 3.2 Backend (Cloud Functions)

- Renforcement `submitGameCreateProposal`:
  - compétition obligatoire (exactement 1)
  - validation stricte compétition active

- Nouvelles callables:
  - `createTournamentRoundPairings`
  - `submitTournamentTableResultProposal`

- Extension des transitions:
  - à validation d’une game de tournoi, mise à jour de la table/round
  - round clôturé automatiquement quand toutes les tables sont validées

### 3.3 Frontend

- `competitions/[id]`:
  - dashboard complet (règles + dernières validées + pending)
  - bouton “Déclarer une game”
    - desktop: panneau latéral
    - mobile: redirection `/games/new?competitionId=...`
  - section tournoi (round actif, tables, saisie résultats)

- `games/new`:
  - création autorisée seulement avec `competitionId` fourni

- `club`:
  - membres non-admin: actions limitées (compétitions + inbox)
  - suppression de l’entrée création de game globale

- `admin`:
  - accès admin only
  - création compétition avec règles complètes
  - gestion membres (ajout/changement rôle)

### 3.4 Firestore rules / indexes

- lecture `tournamentRounds` pour membres du club, écriture client interdite
- index requis pour requêtes compétition/tournoi

## 4) Stratégie anti-régression

1. Garder les flows existants create/edit/approve/reject.
2. Rendre les migrations backward-compatible (fallback sur anciens docs sans nouveaux champs).
3. Valider que leaderboard compétition continue à s’updater via delta.
4. Conserver inbox comme canal principal de validation (push optionnel).

## 5) Plan d’implémentation

### Phase A — Contraintes de base + UX compétition
- compétition obligatoire pour les games
- création depuis page compétition uniquement
- dashboard compétition (pending + latest validated)

### Phase B — Rôles admin + règles configurables
- admin-only pour écrans/actions de gestion
- formulaire admin enrichi avec règles
- affichage lisible des règles sur la page compétition

### Phase C — Tournoi (MVP opérationnel)
- modèle `tournamentConfig` + `tournamentRounds`
- génération d’appariements round (anti-répétition)
- saisie résultats table -> proposal -> approbation -> classement
- verrouillage “un seul round actif”

### Phase D — Durcissement
- tests ciblés (pairing, transitions, permissions)
- logs explicites sur erreurs métier

## 6) Critères d’acceptation

- Impossible de créer une game sans compétition.
- Depuis une compétition, déclaration game possible et flow d’approbation inchangé.
- Dashboard compétition affiche pending/validées récentes.
- Non-admin ne peut pas gérer compétitions/membres.
- Admin peut créer championnat/tournoi avec règles complètes.
- Tournoi: rounds, tables, saisie résultats, classement par round fonctionnels.
