# 📘 Mahjong Club WebApp (Responsive) + Firebase — Implémentation complète

Ce document transforme ta spécification en plan d'exécution technique prêt à développer.

## 1. Objectif et périmètre MVP

- Webapp responsive (mobile-first) pour un club de Mahjong.
- Authentification, gestion membres, compétitions, création/édition de parties.
- Validation unanime obligatoire (création et édition).
- Classements par compétition uniquement (et hors compétition séparé).
- Notifications push web (FCM) + fallback inbox in-app.
- Cloud Functions = source de vérité pour score/états/leaderboards.

## 2. Stack retenue

- Frontend: Next.js (App Router) + TypeScript + TailwindCSS + Radix UI.
- Data fetching: TanStack Query.
- Forms/validation: React Hook Form + Zod.
- Backend: Firebase Auth, Firestore, Cloud Functions (Node.js TypeScript), FCM.
- Déploiement: Firebase Hosting + Functions.
- PWA: manifest + service worker + gestion permission notifications.

## 3. Architecture de projet

```txt
/apps/web
  /src
    /app
      /(auth)/login/page.tsx
      /club/page.tsx
      /competitions/page.tsx
      /competitions/[id]/page.tsx
      /games/new/page.tsx
      /games/[id]/page.tsx
      /inbox/page.tsx
      /admin/page.tsx
    /components
      StatusBadge.tsx
      LeaderboardTable.tsx
      GameCard.tsx
      ProposalDiff.tsx
    /features
      /auth
      /club
      /competitions
      /games
      /inbox
      /admin
    /domain
      models.ts
      scoring.ts
      transitions.ts
    /lib
      firebaseClient.ts
      queryClient.ts
      zodSchemas.ts
      permissions.ts
/functions
  /src
    index.ts
    callable/
      submitGameCreateProposal.ts
      submitGameEditProposal.ts
      approveProposal.ts
      rejectProposal.ts
    core/
      applyProposal.ts
      scoring.ts
      leaderboardDelta.ts
      validators.ts
      notifications.ts
    firestore/
      converters.ts
      refs.ts
      transactions.ts
    test/
      scoring.test.ts
      leaderboardDelta.test.ts
      transitions.test.ts
/firestore
  firestore.rules
  firestore.indexes.json
```

## 4. Modèle Firestore (normalisé)

Collections:

- `users/{userId}`
- `clubs/{clubId}`
- `clubs/{clubId}/members/{userId}`
- `clubs/{clubId}/competitions/{competitionId}`
- `games/{gameId}`
- `gameVersions/{versionId}` (immutable)
- `editProposals/{proposalId}`
- `validationRequests/{requestId}`
- `competitionLeaderboardEntries/{clubId}_{competitionId}_{userId}`
- `globalLeaderboardEntries/{clubId}_{userId}` (optionnel hors compétition)

Règles de conception:

- `games.activeVersionId` pointe vers une version validée courante.
- Toute création/édition passe par `editProposals` et `validationRequests`.
- `gameVersions` n'est jamais modifié après création.
- Leaderboards mis à jour en delta uniquement au moment `applyProposal`.

## 5. Règles métier critiques

### 5.1 Création de partie

1. Client soumet `submitGameCreateProposal`.
2. Function valide:
- membre du club
- 4 participants uniques membres du club
- somme des scores = `rules.scoreSum`
- compétition autorisée (MVP: 0..1)
3. Function calcule aperçu (`computedPreview`) et crée:
- `games` (status `pending_validation`, pendingAction `create`)
- `editProposals` (type `create`, status `pending_validation`)
- `validationRequests` pour chaque participant
4. Notifications FCM envoyées aux participants.

### 5.2 Validation / rejet

- `approveProposal`:
1. vérifie participant requis
2. idempotence (ne pas approuver deux fois)
3. met à jour `validation.approvedBy` + request user `approved`
4. si unanimité: `applyProposal`

- `rejectProposal`:
1. vérifie participant requis
2. enregistre rejet
3. proposal `rejected`, game `disputed`, requests restantes peuvent être marquées `pending`/`rejected` selon UX

### 5.3 Édition de partie

1. Client soumet `submitGameEditProposal` avec `fromVersionId`.
2. Function recalcule preview sur nouvelle version proposée.
3. workflow de validation identique.
4. `applyProposal`:
- crée nouvelle `gameVersion` immutable
- calcule delta leaderboard: `newComputed - oldComputed`
- met à jour `games.activeVersionId`, `games.status = validated`

## 6. Calcul score / UMA (serveur uniquement)

Pipeline conseillé:

1. Trier scores décroissants.
2. Gérer ex aequo via moyenne des places (si besoin, règle explicite).
3. `raw = (finalScore - returnPoints) / 1000`.
4. `total = raw + umaByRank + okaShare`.
5. Arrondi selon règle (`nearest_100` pour score brut, puis points décimaux au dixième si voulu).

Contrôles:

- somme `finalScores` conforme.
- participants dans map score exactement égaux à la liste participants.
- aucune valeur négative non prévue (optionnel selon règles club).

## 7. Contrats Cloud Functions (HTTPS callable)

### 7.1 `submitGameCreateProposal`

Entrée:

```ts
{
  clubId: string;
  participants: string[]; // 4
  finalScores: Record<string, number>;
  competitionIds: string[]; // MVP: 0 ou 1
}
```

Sortie:

```ts
{
  gameId: string;
  proposalId: string;
  status: "pending_validation";
}
```

### 7.2 `submitGameEditProposal`

Entrée:

```ts
{
  gameId: string;
  fromVersionId: string;
  proposedVersion: {
    participants: string[];
    finalScores: Record<string, number>;
    competitionIds: string[];
  };
}
```

### 7.3 `approveProposal`

Entrée:

```ts
{
  proposalId: string;
}
```

Sortie:

```ts
{
  proposalStatus: "pending_validation" | "accepted";
  gameStatus: "pending_validation" | "validated";
}
```

### 7.4 `rejectProposal`

Entrée:

```ts
{
  proposalId: string;
  reason?: string;
}
```

Sortie:

```ts
{
  proposalStatus: "rejected";
  gameStatus: "disputed";
}
```

## 8. Transaction `applyProposal` (atomique)

Dans une transaction Firestore:

1. Lire `proposal`, `game`, version active actuelle (si edit).
2. Vérifier `proposal.status == pending_validation` et unanimité atteinte.
3. Créer `gameVersions/{newVersionId}`.
4. Mettre à jour leaderboard:
- create: ajouter `newComputed` sur compétition cible.
- edit: soustraire old puis ajouter new (delta net).
5. Mettre à jour `games`:
- `activeVersionId = newVersionId`
- `status = validated`
- `pendingAction = null`
- `updatedAt = now`
6. `editProposals.status = accepted`.
7. Clore `validationRequests` en `approved`.

## 9. Règles Firestore (stricte séparation client/serveur)

Principe:

- Le client lit les données nécessaires.
- Le client peut écrire uniquement des documents non critiques si nécessaire.
- Les écritures critiques (`games`, `gameVersions`, `editProposals`, `validationRequests`, leaderboards) passent par Functions Admin SDK.

Politique recommandée:

- `users/{uid}`: lecture utilisateur lui-même; update limité champs profil/token.
- `clubs/*/members/*`: lecture membres du club; écriture admin club.
- `clubs/*/competitions/*`: lecture membres; écriture admin.
- `games`, `gameVersions`, `editProposals`, `competitionLeaderboardEntries`: read membres club, write false côté client.
- `validationRequests/{id}`: read si `request.auth.uid == userId`; write false client.

## 10. Index Firestore recommandés

### Inbox

- `validationRequests` composite:
- `userId ASC, status ASC, createdAt DESC`

### Games validées par compétition

- `games`:
- `clubId ASC, status ASC, updatedAt DESC`

### Leaderboard compétition

- `competitionLeaderboardEntries`:
- `clubId ASC, competitionId ASC, totalPoints DESC`

## 11. Frontend: écrans et comportements

### `/login`

- Email/password + Google (optionnel).
- Après login: charger `activeClubId` sinon assistant de sélection club.

### `/club`

- Résumé des compétitions actives.
- Cartes "Nouvelle partie", "À valider".
- Widget dernière activité.

### `/games/new`

- Sélection 4 participants.
- Saisie scores finaux.
- Compétition (0..1 MVP).
- Preview points calculés depuis endpoint de preview (ou logique miroir locale non source de vérité).
- Submit => crée proposal + toast + navigation game.

### `/inbox`

- Liste des `validationRequests` en attente.
- Action approuver/rejeter.
- Badge compteur global dans header.

### `/games/:id`

- Détail version active.
- Historique versions.
- État du consensus.
- Bouton "Proposer une édition".

### `/competitions/:id`

- Leaderboard trié.
- Historique des parties validées associées.
- Filtres par date/joueur.

### `/admin`

- Gestion membres/rôles.
- CRUD compétitions (draft/active/archived).

## 12. Notifications FCM web

Flux:

1. Demander permission dans UI dédiée.
2. Récupérer token via Firebase Messaging.
3. Stocker token dans `users/{uid}.fcmTokens` (merge + dédup).
4. À création/édition proposal: Function envoie push à chaque participant.
5. Fallback systématique: inbox in-app.

Bonnes pratiques:

- Nettoyage tokens invalides après erreurs FCM.
- Deep link notification vers `/inbox` ou `/games/:id`.

## 13. États et transitions

`games.status`:

- `pending_validation` -> `validated` (unanimité)
- `pending_validation` -> `disputed` (au moins un rejet)
- `validated` -> `pending_validation` (nouvelle edit proposal)
- `disputed` -> `pending_validation` (nouvelle proposal corrective, optionnel)
- `cancelled` terminal (admin)

`editProposals.status`:

- `pending_validation` -> `accepted` | `rejected` | `expired`

## 14. Validation de données (Zod + serveur)

Client:

- validation UX rapide (types, champs requis, taille tableau).

Serveur (obligatoire):

- règles métier strictes, appartenance club, rôles, contrainte compétition, somme score.
- Toute décision finale vient du serveur.

## 15. Plan d’implémentation par phases

### Phase 1: Auth + Club + Compétitions

- Setup Firebase + Next.js + Tailwind + Auth guard.
- Modèles `users`, `clubs`, `members`, `competitions`.
- Pages `/login`, `/club`, `/competitions`, `/admin`.

### Phase 2: Création partie + validation + push

- `submitGameCreateProposal`, `approveProposal`, `rejectProposal`.
- Collections `games`, `editProposals`, `validationRequests`.
- Page `/games/new`, `/inbox`, `/games/:id`.
- Notifications FCM + fallback inbox.

### Phase 3: Édition + versioning + delta leaderboard

- `submitGameEditProposal`, `applyProposal` robuste.
- `gameVersions` immutable + historique.
- leaderboard delta sur create/edit.
- page diff `ProposalDiff`.

### Phase 4: Hardening

- Firestore rules strictes.
- tests unitaires/intégration/e2e.
- observabilité: logs structurés, alerting erreurs functions.

## 16. Stratégie de tests

Backend:

- Unit: `scoring.ts`, tie-break, arrondis, règles UMA.
- Unit: `leaderboardDelta.ts` create/edit/remove compétition.
- Unit: transitions d’état.
- Integration (emulator): callable -> écritures atomiques -> états finaux.

Frontend:

- composants clés (`StatusBadge`, `ProposalDiff`, `LeaderboardTable`).
- e2e Playwright:
1. create proposal
2. validation par 4 users
3. passage `validated`
4. leaderboard mis à jour.

## 17. Observabilité et exploitation

- Logs Functions corrélés par `proposalId`/`gameId`.
- Alertes sur taux d’échec callable + latence p95.
- Job de maintenance:
- purge tokens FCM invalides
- expiration proposals anciennes (`expired`) + notifications.

## 18. Risques et mitigations

- Concurrence sur approbations simultanées: transaction + idempotence.
- Incohérences leaderboard: update uniquement dans `applyProposal`.
- Push non disponible (iOS/web restrictions): inbox obligatoire.
- Évolutivité: pagination et indexes dès MVP.

## 19. Décisions MVP confirmées

- Compétition par partie: 0 ou 1 (extensible ensuite).
- Validation unanime obligatoire.
- Leaderboard strictement par compétition.
- Push FCM + fallback inbox.

## 20. Checklist de livraison MVP

- Auth + gestion club fonctionnelles.
- Création partie avec preview et proposal.
- Inbox validation opérationnelle.
- Validation unanime active.
- Rejet -> `disputed`.
- Leaderboard compétition exact (create + edit delta).
- Firestore rules bloquent écritures directes sensibles.
- Tests backend critiques verts.
- PWA installable + notification flow documenté.

