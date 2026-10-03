# Travail en cours

Mis à jour le 2026-10-03.

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

Plan validé le 2026-10-02. État au 2026-10-03 :

- Commit 1 (expand) : `708acdf`, vérifié en prod par Mahamadou (Live, migrations 0015 et 0016, achat normal, caisse).
- Commits 2 et 3 : `3c761a1`, vérifiés en prod par Mahamadou (Live, migration 0017, test en prod).
- Commit 1 bis (contract) : `24ed0e8` (migrations 0018 re-backfill et 0019 NOT NULL), vérifié en prod par Mahamadou (0018 et 0019, achat normal, caisse).
- Commit 4 : `9131791` (`formater_montant`) et `e8e71fd` (API des paiements), poussés (`515153b`), CI verte.
- Commit 5 : `16e3f4d`, poussé (`0fc48d1`), CI verte. Render Live vérifié par Mahamadou (ce déploiement inclut aussi le commit 4).
- Commit 6 : `7cd88cc`, poussé (`29e03bd`), CI verte. Vérifié en prod par Mahamadou : Render Live, caisse du 01/10 identique à avant.
- Commit 7 : `2e25e34`, poussé (`f72d73b`), CI verte. Déploiement Vercel à tester par Mahamadou (voir plus bas).
- Commit 7 bis : `38e2584`, validé par Mahamadou, **non poussé** : Mahamadou teste d'abord le commit 7 en prod. lint, build et 164 tests Vitest OK en local, 5 mutations détectées, captures à 375 px et en desktop.
- Prochaine étape : petit chantier « bouton flottant » (priorité, avant le commit 9), voir plus bas.

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
6. `feat(reports)` : journal de caisse, sorties = argent versé, par mode, avec non-régression. `sorties.achats` garde son nom avec le sens « argent versé » (acomptes à la date de l'achat + paiements fournisseurs à leur date). Option A (décidée le 2026-10-03) : les paiements d'un achat annulé sont comptés à leur date.
7. `feat(frontend)` : achat à crédit dans le formulaire d'achat (case réservée au propriétaire, montant versé, mode obligatoire seulement s'il est supérieur à 0, reste dû affiché après la réponse du serveur, badge « À crédit · reste X » dans l'historique). Un achat comptant envoie exactement le même objet qu'avant.
7 bis. `feat(frontend)` : mode de paiement demandé aussi pour un achat comptant (sélecteur obligatoire, sans valeur par défaut), juste après le 7 et avant le 9. Décidé le 2026-10-03. Le backend accepte et enregistre déjà ce mode (`test_mode_paiement_sans_montant_paye_conserve`), et le journal le range dans son mode (`test_ligne_non_precise_absente_sil_ny_en_a_pas`) : commit frontend seul. Il changera l'objet envoyé pour un achat comptant (ajout de `mode_paiement`) : le test de non-régression du 7 sera adapté.
   - Décision 1 : le mode de paiement est remis à zéro après chaque achat (choix explicite à chaque fois).
   - Décision 2 : un seul sélecteur « Mode de paiement », au même endroit pour tous les achats, juste au-dessus du bouton Valider. Il porte sur le total pour un achat comptant, sur le montant versé pour un achat à crédit, et il est absent si le montant versé est 0 (jamais envoyé dans ce cas, même si un mode avait été choisi avant de cocher « Achat à crédit »).
   - Pas de valeur par défaut ; sans mode, l'envoi est bloqué. Un employé voit le sélecteur (achat comptant) mais toujours pas la case crédit (D3).
   - Décision 3 (2026-10-03) : si on choisit un mode, qu'on coche puis décoche « Achat à crédit », le mode choisi reste sélectionné. Il est visible avant l'envoi : pas de piège caché.
8. `feat(frontend)` : dettes et paiements dans Fournisseurs.
9. `feat(frontend)` : journal de caisse, sorties par mode, bandeau adapté. Vient **après le petit chantier « bouton flottant »** (décidé le 2026-10-03). Part **avant ou avec le commit 8** (décidé le 2026-10-03) : sans lui, l'ancien `JournalCaisse.jsx` afficherait « aucun mouvement » un jour où il n'y a que des paiements fournisseurs.
   - État vide : ajouter `sorties.nombre_paiements_fournisseurs` à la condition ; clé absente (backend antérieur) : pas d'état vide, comme `nombre_remboursements`.
   - Bandeau : achats = argent réellement versé (acomptes et paiements fournisseurs), par mode ; « non précisé » = achats enregistrés avant le suivi du mode ; les dépenses restent supposées payées comptant.
   - « À savoir » : `credit_fournisseur_obtenu` et `dette_fournisseurs_restante` ne portent que sur les achats de la période. Libellé comme pour les clients : « Acheté à crédit sur la période : X, dont encore dû aujourd'hui : Y ». La dette totale par fournisseur reste dans l'écran Fournisseurs.
   - Chaque nouveau champ peut être absent (ligne masquée).

## Petit chantier prioritaire : bouton flottant de l'assistant

Passé en priorité le 2026-10-03, avant le commit 9 : depuis le 7 bis, à 375 px, le bouton flottant recouvre un champ obligatoire (le sélecteur « Mode de paiement » du formulaire d'achat), en plus du « Montant Total ». Plan révisé le 2026-10-03, **à valider**, rien de codé.

- Décision (2026-10-03) : Iwi reste visible sur mobile (argument de vente, commerçants surtout sur téléphone). On essaie d'abord la solution la plus simple : agrandir la marge basse de `main` (`App.jsx`), sur mobile et en desktop, pour que la fin de toute page puisse défiler au-dessus du bouton. Les champs du milieu de page se dégagent en défilant, comme avec tout bouton flottant. Si ça ne suffit pas, on reparlera de l'en-tête.
- Constat : `Assistant.jsx`, bouton de 56 px en `fixed bottom-20 right-4` (mobile), `md:bottom-6 md:right-6`. Son haut est à 136 px du bas de l'écran sur mobile, 80 px en desktop. La marge basse de `main` n'est que de 96 px (`pb-24`) sur mobile et 24 px (`md:pb-6`) en desktop : même tout en bas d'une page, les derniers 40 px (mobile) ou 56 px (desktop) du contenu restent sous le bouton.
- Correctif prévu : `pb-36` (144 px) sur mobile et `md:pb-24` (96 px) en desktop, soit 8 px et 16 px de marge au-dessus du bouton. Une seule ligne de `App.jsx`, valable pour toutes les pages.
- Mesure Playwright faite le 2026-10-03, avant correctif (API simulée, panier d'une ligne, historique de 2 achats puis vide) :
  - En fin de page, le bas du contenu est sous le haut du bouton : 716 px contre 676 px à 375 px (écran de 812 px), 876 px contre 820 px en desktop (écran de 900 px). En desktop, avec un historique, le bouton « Annuler l'achat #40 » est sous Iwi.
  - **Limite** : à 375 px, le formulaire d'achat n'est jamais en fin de page (l'historique le suit, même vide). Quand on fait défiler juste assez pour voir Valider au-dessus de la barre du bas, Valider est sous Iwi, avec ou sans le correctif. Il se dégage en défilant d'environ 70 px de plus (bas de Valider à 748 px, haut d'Iwi à 676 px). La marge seule ne change donc rien à ce cas : c'est le cas « milieu de page ».
- Preuves prévues :
  - Mesure Playwright, à 375 px et en desktop, sur Achats, vue échouer avant le correctif : défilement jusqu'en bas de la page, le bas du contenu de `main` est au-dessus du haut du bouton Iwi, et aucun champ ni bouton n'est sous Iwi (en desktop : plus de « Annuler l'achat #40 »).
  - Formulaire d'achat à 375 px : il existe une position de défilement où tous ses champs et Valider sont hors du bouton Iwi (vrai avant et après : constat, pas preuve du correctif).
  - Captures d'Achats à 375 px et en desktop, en fin de page.

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
- Chantier séparé : l'annulation d'une vente suit l'option A (`VenteViewSet.annuler` refuse dès que `vente.remboursements.exists()`, même si les remboursements sont corrigés à 0). L'aligner sur l'option B des achats (refus seulement si le total net remboursé est différent de 0, message qui dit comment s'en sortir), pour que ventes et achats se comportent de la même façon. Ce jour-là, le journal de caisse devra compter les remboursements d'une vente annulée à leur date (option A, comme les paiements fournisseurs) : le filtre `vente__statut='VALIDEE'` de `reports/caisse.py` les exclurait.
- Chantier séparé : objets d'une autre boutique qui renvoient autre chose qu'un 404 identique à celui d'un objet inexistant (règle de `CLAUDE.md`, Sécurité). `RemboursementViewSet.perform_create` renvoie 403 (« Cette vente n'appartient pas à votre boutique », `sales/views.py`). Même problème relevé ailleurs, à inventorier : `products/views.py` (403 sur produit et unité), et des serializers qui répondent 400 « n'appartient pas à votre boutique », message différent de celui d'un id inexistant (`sales`, `purchases` dont `validate_fournisseur`, `inventory`, `products`). Modèle à suivre : `AchatDeLaBoutiqueField` (`purchases/serializers.py`).
- Chantier séparé : `Clients.jsx:55` (`grouperRemboursements`) calcule le montant effectif d'un remboursement côté frontend, en flottants avec arrondi, contrairement à `CLAUDE.md` (aucun calcul de montant dans le frontend). Le faire calculer par le backend, comme `montant_effectif` dans l'historique fournisseur.
- Chantier séparé : autres calculs de montants existants dans le frontend. `Purchases.jsx` (sous-totaux et « Montant Total » du panier) et `Sales.jsx` (« Restera dû » calculé pendant la saisie d'une vente à crédit). Nuance : un total provisoire pendant la saisie est acceptable si le serveur recalcule la valeur enregistrée ; le chantier vérifiera au cas par cas.
- Chantier séparé : messages et exports du backend qui affichent un montant brut (`100.00 FCFA`) au lieu du rendu de l'app. Passer par `formater_montant` (`parametres/services.py`, même rendu que `formatCurrency`) : avertissement de plafond (`sales/services/credit.py`, `avertissement_plafond_credit`), notification de dette (`notifications/services.py`), export PDF du résumé financier et des ventes détaillées (`reports/views.py`, format `:.2f`). Les exports Excel (`#,##0.00` dans `reports/views.py`) sont des formats de cellule numériques : à examiner à part.
- `date_annulation` sur Vente/Achat/Dépense, avant toute vraie clôture de caisse (voir `reports/caisse.py`).
- Export PDF/Excel du journal de caisse.
- Montants JSON en float à migrer en chaînes : tous les rapports ensemble, jamais un par un.
- `/api/health/` qui renvoie `RENDER_GIT_COMMIT`, pour vérifier quel commit tourne sur Render.
- Vérifier `create_superuser_auto` : mot de passe en variable d'environnement, commande idempotente.

## En attente, côté Mahamadou

- Tester le commit 7 en prod (Vercel) : un achat à crédit depuis le téléphone, le badge « À crédit · reste X » dans l'historique, et la caisse du jour. Ensuite seulement, push du 7 bis (`38e2584`).
- Vérifier en prod Ctrl+P et l'état vide du journal de caisse.
- Activer Secret scanning et Push protection sur GitHub.
- Changer l'ancien mot de passe PostgreSQL local.
