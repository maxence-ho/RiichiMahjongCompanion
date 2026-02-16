# Plan d'action - Refactor UI/UX tournoi et compétition

## Objectif
Améliorer la lisibilité et la navigabilité de l'expérience tournoi sans casser les flows existants (création, rounds, approval, leaderboard).

## Demandes couvertes
1. Formulaire création tournoi: afficher clairement les noms des règles modifiables.
2. Page compétition: déplacer les règles en colonne droite.
3. Page compétition: leaderboard en haut.
4. Tournoi: rendre visible l'intégralité des rounds `scheduled` (rencontres prévues).
5. Tournoi: rendre l'UI plus digeste via navigation sémantique entre sections (résultats, saisie, planning, jeux).

## Plan technique

### Phase 1 - Formulaire admin (règles nommées)
- Fichier: `apps/web/src/app/admin/page.tsx`
- Remplacer les inputs à placeholders par des champs avec labels explicites.
- Grouper les réglages:
  - Scoring de base (starting/return/score sum/oka/rounding)
  - UMA
  - Bonus/riichi/honba/noten
  - Toggles règles spéciales
- Conserver le payload Firestore inchangé pour éviter les régressions backend.

### Phase 2 - Layout compétition
- Fichier: `apps/web/src/app/competitions/[id]/page.tsx`
- Réordonner sections:
  - Le leaderboard passe en premier bloc principal.
  - Les règles sortent de la colonne principale et vont dans l'`aside` (droite).
- Conserver l'accès création de game championnat dans l'aside (desktop).

### Phase 3 - UX sémantique tournoi
- Ajouter un switch d'onglets local côté client (pas de routing additionnel):
  - `Results`
  - `Round input`
  - `Schedule`
  - `Games`
- `Results`: état tournoi + historique synthétique.
- `Round input`: round actif + saisie des scores des tables.
- `Schedule`: tous les rounds avec détail de toutes les tables, y compris `scheduled`.
- `Games`: demandes d'approval + dernières validées.

### Phase 4 - Affichage complet du planning
- Dans l'onglet `Schedule`, afficher:
  - round number + status,
  - pour chaque table: index + liste des joueurs.
- Trier les rounds dans l'ordre chronologique (1 -> N) pour lecture du planning.

## Anti-régression
- Ne pas modifier la structure de docs Firestore utilisés par les callables existants.
- Ne pas changer les noms de statuts (`active`, `scheduled`, `completed`, etc.).
- Garder le bouton admin de génération/activation de round opérationnel.
- Maintenir les flows championnat inchangés (déclaration + approval).

## Validation
- `npm run build`
- `npm run test`
- Vérification visuelle manuelle:
  - création tournoi (labels règles),
  - page tournoi (leaderboard top, rules à droite),
  - affichage des rounds scheduled et tables.
