# Travail en cours

Mis à jour le 2026-10-02.

## Fait récemment

- Correction des remboursements (corrections chaînées à l'original).
- Journal de caisse : v1 (lecture seule), correctif des libellés, impression.
- CI verte avec Vitest lancé à chaque push.
- Hook de secrets élargi (clés préfixées : `R2_*`, `PAYDUNYA_*`, `*_API_KEY`, `*_TOKEN`...).
- Test instable `Clients.test.jsx` réglé (`ebed005`, `504be15`).
- `CLAUDE.md` (règles permanentes) et ce fichier créés.
- Hook de secrets : backticks retirés de la docstring (lancé par erreur avec `sh`, ils exécutaient `git commit --no-verify`). Toujours lancer le hook avec Python.

## Prochaine fonctionnalité : dettes fournisseurs (achats à crédit)

Plan validé le 2026-10-02, rien de codé. Le chantier commence à la prochaine session.

### Principe

- `Achat` reçoit `statut_paiement` (défaut `paye`), `montant_du` (défaut 0), `montant_paye` (backfill puis NOT NULL, voir D4) et `mode_paiement` (nullable, null = « non précisé »).
- Sans `montant_paye` dans la requête, l'achat est comptant : même comportement qu'aujourd'hui, y compris pour un frontend encore en cache. Un achat à crédit exige un fournisseur.
- `PaiementFournisseur` est append-only, calqué sur `Remboursement` : corrections chaînées à l'original, `mode_paiement`, `enregistre_par`, isolation par `achat__boutique`.
- Le service `purchases/services/dette.py` est dupliqué depuis `sales/services/credit.py`, sans abstraction commune en v1 : on ne refactore pas le crédit client dans ce chantier. `select_for_update` sur l'`Achat`, et 0 ≤ total payé ≤ `montant_total`.
- L'annulation d'un achat est refusée s'il a déjà un paiement. L'acompte ne se corrige pas : on annule l'achat et on le ressaisit.
- Journal de caisse : `sorties.achats` = argent réellement versé (acompte + paiements), avec de nouvelles clés et une ventilation par mode. Non-régression : un achat comptant existant donne exactement les mêmes chiffres. Bandeau « payés comptant » adapté.
- Inchangés : résumé financier et ses exports (coût engagé), dashboard, assistant, ventes détaillées, notifications, stock et `prix_achat`.
- Pas de « reste à payer » calculé dans le formulaire d'achat : le reste dû s'affiche après la réponse du serveur.

### Décisions

- **D1, Premium ou non : à décider avant le commit 2.**
- D2 : échéances et notifications plus tard (`date_echeance` nullable, additive).
- D3 : créer un achat à crédit est réservé au propriétaire en v1. Enregistrer un paiement fournisseur est permis à l'employé aussi, avec « Enregistré par » visible sur chaque paiement. Corriger un paiement est réservé au propriétaire.
- D4 : backfill `montant_paye = montant_total` pour les achats existants (une seule requête `update` avec `F()`), puis passage en NOT NULL. Un NULL ne veut dire qu'« inconnu ». Migration réversible, avec un test du backfill.
- D5 : la suppression d'un fournisseur est refusée tant qu'il reste une dette (contrôle dans la vue, sans migration).
- D6 : tuile au dashboard et outil pour l'assistant plus tard.
- D7 : journal, « À savoir » : crédit fournisseur obtenu et dette fournisseurs restante.
- D8 : frontend, `grouperRemboursements` et `formatEcart` dupliqués (pas de refactor de `Clients.jsx`).
- D9 : pas de paiement antidaté en v1 (date du serveur).

### Commits prévus

Backend d'abord (déployable seul), frontend ensuite (supporte l'absence des nouveaux champs).

1. `feat(purchases)` : champs de paiement sur `Achat`, migration avec backfill (D4).
2. `feat(purchases)` : achat à crédit ou comptant avec acompte et mode (D1 et D3).
3. `feat(purchases)` : paiements fournisseurs append-only (modèle, service, verrou, bornes, test de concurrence à deux threads).
4. `feat(purchases)` : API des paiements et corrections ; annulation d'achat refusée s'il a un paiement.
5. `feat(suppliers)` : dettes par fournisseur (`avec_dette`, `historique`), suppression bloquée s'il reste une dette.
6. `feat(reports)` : journal de caisse, sorties = argent versé, par mode, avec non-régression.
7. `feat(frontend)` : achat à crédit dans le formulaire d'achat.
8. `feat(frontend)` : dettes et paiements dans Fournisseurs.
9. `feat(frontend)` : journal de caisse, sorties par mode, bandeau adapté.

## Fonctionnalités réservées au Premium (état au 2026-10-02)

Un seul contrôle côté backend, `verifier_acces_premium` (`tenants/premium.py`), qui s'appuie sur `Boutique.a_acces_premium()` (`tenants/models.py`) : abonnement valide et formule de palier `PREMIUM`. Il ne bloque que les écritures ; la lecture reste toujours permise.

| Fonctionnalité | Contrôle backend | Frontend |
|---|---|---|
| Vente à crédit (avec `client_credit`) | `sales/serializers.py` (`VenteSerializer.create`) | `Sales.jsx` : case « Vente à crédit » grisée, bannière |
| Créer un client à crédit | `sales/views.py` (`ClientViewSet.perform_create`) | `Clients.jsx` : bouton « Ajouter un client » grisé, bannière |
| Enregistrer un remboursement client | `sales/views.py` (`RemboursementViewSet.perform_create`) | `Clients.jsx` : formulaire remplacé par la bannière |
| Corriger un remboursement client | `sales/views.py` (`RemboursementViewSet.corriger`) | `Clients.jsx` : bouton « Corriger » masqué |

- `tenants/views.py` expose `a_acces_premium` au frontend, lu par `SettingsContext.jsx` (`aAccesPremium`). Le frontend ne bloque que sur un `false` confirmé.
- `PremiumRequisBanner.jsx` s'affiche sur le code d'erreur `PALIER_INSUFFISANT` (`services/errorUtils.js`).
- `JournalCaisse.jsx` masque la colonne « Remboursements de dettes » hors Premium, sauf s'il y a des montants. C'est de l'affichage, pas un contrôle.

## En attente, côté code (pour plus tard)

- Chantier séparé : une boutique redescendue du Premium ne peut plus enregistrer les remboursements de ses clients (`RemboursementViewSet.perform_create`), ce qui fausse sa caisse.
- `date_annulation` sur Vente/Achat/Dépense, avant toute vraie clôture de caisse (voir `reports/caisse.py`).
- Export PDF/Excel du journal de caisse.
- Montants JSON en float à migrer en chaînes : tous les rapports ensemble, jamais un par un.
- `/api/health/` qui renvoie `RENDER_GIT_COMMIT`, pour vérifier quel commit tourne sur Render.
- Vérifier `create_superuser_auto` : mot de passe en variable d'environnement, commande idempotente.

## En attente, côté Mahamadou

- Vérifier en prod Ctrl+P et l'état vide du journal de caisse.
- Activer Secret scanning et Push protection sur GitHub.
- Changer l'ancien mot de passe PostgreSQL local.
