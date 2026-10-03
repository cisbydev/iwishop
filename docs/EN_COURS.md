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
- D1 tranchée : offre unique (`d6dc1f9`).
- `CLAUDE.md` : section Migrations (la base accepte l'ancien et le nouveau code pendant un déploiement, `db_default`, test en SQL brut) (`298086f`).

## En cours : dettes fournisseurs (achats à crédit)

Plan validé le 2026-10-02. État au 2026-10-02 :

- Commit 1 (expand) : `708acdf`, vérifié en prod par Mahamadou (Live, migrations 0015 et 0016, achat normal, caisse).
- Commits 2 et 3 : `3c761a1`, vérifiés en prod par Mahamadou (Live, migration 0017, test en prod).
- Commit 1 bis (contract) : `24ed0e8` (migrations 0018 re-backfill et 0019 NOT NULL), vérifié en prod par Mahamadou (0018 et 0019, achat normal, caisse).
- Commit 4 : `9131791` (`formater_montant`) et `e8e71fd` (API des paiements), poussés (`515153b`), CI verte. Déploiement à vérifier par Mahamadou.
- Commit 5 : commité en local, pas poussé.

### Principe

- `Achat` reçoit `statut_paiement` (défaut `paye`), `montant_du` (défaut 0), `montant_paye` (backfill puis NOT NULL, voir D4) et `mode_paiement` (nullable, null = « non précisé »).
- Sans `montant_paye` dans la requête, l'achat est comptant : même comportement qu'aujourd'hui, y compris pour un frontend encore en cache. Un achat à crédit exige un fournisseur.
- Une demande contradictoire est refusée (400), jamais corrigée en silence : par exemple un `mode_paiement` avec un acompte à 0.
- `PaiementFournisseur` est append-only, calqué sur `Remboursement` : corrections chaînées à l'original, `mode_paiement`, `enregistre_par`, isolation par `achat__boutique`.
- Le service `purchases/services/dette.py` est dupliqué depuis `sales/services/credit.py`, sans abstraction commune en v1 : on ne refactore pas le crédit client dans ce chantier. `select_for_update` sur l'`Achat`, et 0 ≤ total payé ≤ `montant_total`.
- L'annulation d'un achat est refusée s'il a déjà un paiement. L'acompte ne se corrige pas : on annule l'achat et on le ressaisit.
- Journal de caisse : `sorties.achats` = argent réellement versé (acompte + paiements), avec de nouvelles clés et une ventilation par mode. Non-régression : un achat comptant existant donne exactement les mêmes chiffres. Bandeau « payés comptant » adapté.
- Inchangés : résumé financier et ses exports (coût engagé), dashboard, assistant, ventes détaillées, notifications, stock et `prix_achat`.
- Pas de « reste à payer » calculé dans le formulaire d'achat : le reste dû s'affiche après la réponse du serveur.

### Décisions

- D1 (décidé le 2026-10-02) : offre unique, voir le chantier « Offre unique » plus bas. Aucun contrôle de palier pour les dettes fournisseurs : seulement le contrôle d'abonnement valide existant (`_verifier_acces`), comme pour les autres écritures.
- D2 : échéances et notifications plus tard (`date_echeance` nullable, additive).
- D3 : créer un achat à crédit est réservé au propriétaire en v1. Enregistrer un paiement fournisseur est permis à l'employé aussi, avec « Enregistré par » visible sur chaque paiement. Corriger un paiement est réservé au propriétaire.
- D4 : backfill `montant_paye = montant_total` pour les achats existants (une seule requête `update` avec `F()`), puis passage en NOT NULL. Un NULL ne veut dire qu'« inconnu ». Migration réversible, avec un test du backfill. Le NOT NULL vient dans un deuxième temps (commit 1 bis), car `migrate` tourne pendant que l'ancien code sert encore les requêtes.
- D5 : la suppression d'un fournisseur est refusée tant qu'il reste une dette (contrôle dans la vue, sans migration). Sous concurrence, la suppression et la création d'un achat verrouillent toutes deux le fournisseur (les clés étrangères Django n'étant vérifiées qu'au commit, elles ne suffisent pas). Cas inverse : si la suppression passe avant, la création de l'achat trouve le fournisseur disparu sous le verrou et renvoie la même réponse qu'un fournisseur inexistant (400 du champ `fournisseur`), sans rien créer.
- D6 : tuile au dashboard et outil pour l'assistant plus tard.
- D7 : journal, « À savoir » : crédit fournisseur obtenu et dette fournisseurs restante.
- D8 (modifiée le 2026-10-03) : le backend regroupe les corrections et calcule `montant_effectif` (par paiement) et `total_paiements` (par achat) dans l'historique fournisseur. Le frontend (commit 8) affiche ces valeurs sans rien calculer : pas de copie de `grouperRemboursements`. `formatEcart` (affichage seul) peut être dupliqué. Pas de refactor de `Clients.jsx` dans ce chantier.
- D9 : pas de paiement antidaté en v1 (date du serveur).

### Commits prévus

Backend d'abord (déployable seul), frontend ensuite (supporte l'absence des nouveaux champs).

1. `feat(purchases)` : champs de paiement sur `Achat`, migration avec backfill (D4). `montant_paye` reste nullable en base ; le nouveau code le remplit toujours.
1 bis. Contract, dans un commit et un déploiement séparés, une fois le commit 1 en ligne sur Render : 0018 refait le backfill des lignes encore vides (`update ... where montant_paye is null`), 0019 passe `montant_paye` en NOT NULL.
2. `feat(purchases)` : achat à crédit ou comptant avec acompte et mode (D1 et D3).
3. `feat(purchases)` : paiements fournisseurs append-only (modèle, service, verrou, bornes, test de concurrence à deux threads).
4. `feat(purchases)` : API des paiements et corrections ; annulation d'achat refusée si le total net des paiements est différent de 0 (option B, décidée le 2026-10-03 : un paiement corrigé à 0 n'a pas eu lieu ; l'acompte seul ne bloque pas).
5. `feat(suppliers)` : dettes par fournisseur (`avec_dette`, `historique`), suppression bloquée s'il reste une dette.
6. `feat(reports)` : journal de caisse, sorties = argent versé, par mode, avec non-régression. À trancher ici : les lignes de paiement d'un achat annulé (total net 0) sont-elles comptées à leur date ou exclues ? Penchant de Mahamadou : à leur date (les périodes passées ne bougent plus).
7. `feat(frontend)` : achat à crédit dans le formulaire d'achat.
8. `feat(frontend)` : dettes et paiements dans Fournisseurs.
9. `feat(frontend)` : journal de caisse, sorties par mode, bandeau adapté.

## Chantier suivant : offre unique

Décidé le 2026-10-02 : iWiShop passe à une offre unique. Un abonnement valide donne accès à toutes les fonctionnalités, sans palier Essentiel ou Premium. À faire après les dettes fournisseurs. Plan d'abord, rien de codé.

- Retirer `verifier_acces_premium` du crédit client (les 4 appels : `sales/serializers.py` `VenteSerializer.create`, `sales/views.py` `ClientViewSet.perform_create`, `RemboursementViewSet.perform_create` et `RemboursementViewSet.corriger`), et l'affichage frontend lié (bannière, boutons grisés, colonne masquée du journal). Voir l'inventaire ci-dessous.
- Garder le contrôle d'abonnement valide (`_verifier_acces`).
- Inventorier ce qui dépend encore des paliers : formules en base, PayDunya, pages de prix, tests.
- Règle aussi le point « boutique redescendue du Premium » (section « En attente, côté code »).

## Fonctionnalités réservées au Premium (état au 2026-10-02, à retirer par le chantier « offre unique »)

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
- Chantier séparé : `sales/services/credit.py` (`enregistrer_remboursement`) semble accepter un nouveau remboursement sur une vente annulée (seule la correction vérifie `ANNULEE`). À vérifier avec un test, puis corriger (refus, comme `enregistrer_paiement` côté fournisseurs).
- Chantier séparé : l'annulation d'une vente suit l'option A (`VenteViewSet.annuler` refuse dès que `vente.remboursements.exists()`, même si les remboursements sont corrigés à 0). L'aligner sur l'option B des achats (refus seulement si le total net remboursé est différent de 0, message qui dit comment s'en sortir), pour que ventes et achats se comportent de la même façon.
- Chantier séparé : objets d'une autre boutique qui renvoient autre chose qu'un 404 identique à celui d'un objet inexistant (règle de `CLAUDE.md`, Sécurité). `RemboursementViewSet.perform_create` renvoie 403 (« Cette vente n'appartient pas à votre boutique », `sales/views.py`). Même problème relevé ailleurs, à inventorier : `products/views.py` (403 sur produit et unité), et des serializers qui répondent 400 « n'appartient pas à votre boutique », message différent de celui d'un id inexistant (`sales`, `purchases` dont `validate_fournisseur`, `inventory`, `products`). Modèle à suivre : `AchatDeLaBoutiqueField` (`purchases/serializers.py`).
- Chantier séparé : `Clients.jsx:55` (`grouperRemboursements`) calcule le montant effectif d'un remboursement côté frontend, en flottants avec arrondi, contrairement à `CLAUDE.md` (aucun calcul de montant dans le frontend). Le faire calculer par le backend, comme `montant_effectif` dans l'historique fournisseur.
- Chantier séparé : messages et exports du backend qui affichent un montant brut (`100.00 FCFA`) au lieu du rendu de l'app. Passer par `formater_montant` (`parametres/services.py`, même rendu que `formatCurrency`) : avertissement de plafond (`sales/services/credit.py`, `avertissement_plafond_credit`), notification de dette (`notifications/services.py`), export PDF du résumé financier et des ventes détaillées (`reports/views.py`, format `:.2f`). Les exports Excel (`#,##0.00` dans `reports/views.py`) sont des formats de cellule numériques : à examiner à part.
- `date_annulation` sur Vente/Achat/Dépense, avant toute vraie clôture de caisse (voir `reports/caisse.py`).
- Export PDF/Excel du journal de caisse.
- Montants JSON en float à migrer en chaînes : tous les rapports ensemble, jamais un par un.
- `/api/health/` qui renvoie `RENDER_GIT_COMMIT`, pour vérifier quel commit tourne sur Render.
- Vérifier `create_superuser_auto` : mot de passe en variable d'environnement, commande idempotente.

## En attente, côté Mahamadou

- Vérifier le déploiement du commit 4 (`515153b`) : Render Live, aucune erreur dans Sentry, un paiement fournisseur de test si possible. Puis feu vert pour pousser le commit 5.
- Vérifier en prod Ctrl+P et l'état vide du journal de caisse.
- Activer Secret scanning et Push protection sur GitHub.
- Changer l'ancien mot de passe PostgreSQL local.
