# Implémentation - Refactor UI/UX tournoi et compétition

## Plan demandé
Plan de travail créé dans:
- `/Users/maxence.ho/Documents/New project/TOURNAMENT_UI_UX_REFACTOR_PLAN.md`

## Changements implémentés

### 1) Création tournoi: règles nommées et lisibles
Fichier:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/admin/page.tsx`

Détails:
- Le bloc règles est maintenant structuré en sections avec labels explicites:
  - Base scoring
  - UMA
  - Payments and counters
  - Red fives
  - Rule toggles
- Les champs ne reposent plus uniquement sur des placeholders.
- Payload Firestore inchangé (pas de régression backend).

### 2) Page compétition: leaderboard en haut
Fichier:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/competitions/[id]/page.tsx`

Détails:
- Le leaderboard est désormais le premier bloc de contenu principal après l'en-tête compétition.

### 3) Page compétition: règles déplacées en colonne droite
Fichier:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/competitions/[id]/page.tsx`

Détails:
- La carte `Competition rules` est affichée dans l'`aside` (colonne droite sur desktop).
- En mobile, elle reste accessible (layout mono-colonne naturel).

### 4) Tournoi: affichage complet des rounds scheduled et rencontres
Fichier:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/competitions/[id]/page.tsx`

Détails:
- Ajout d'un onglet `Schedule` qui affiche l'intégralité du planning:
  - tous les rounds (y compris `scheduled`),
  - toutes les tables de chaque round,
  - la liste des joueurs de chaque table.
- Tri des rounds en ordre chronologique pour la lecture du planning.

### 5) UX plus digeste via navigation sémantique
Fichier:
- `/Users/maxence.ho/Documents/New project/apps/web/src/app/competitions/[id]/page.tsx`

Détails:
- Ajout de navigation d'onglets tournoi:
  - `Results`
  - `Round input`
  - `Schedule`
  - `Games`
- Séparation claire entre:
  - lecture des résultats,
  - saisie des résultats,
  - visualisation du planning,
  - suivi des games.

## Validation anti-régression
Commandes exécutées avec succès:
- `npm run build -w apps/web`
- `npm run build:functions`
- `npm run test -w functions`

Résultat:
- Build web OK
- Build functions OK
- Tests functions OK (10/10)
