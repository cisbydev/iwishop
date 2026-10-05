# Travail en cours

Mis à jour le 2026-10-05.

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

## Terminé le 2026-10-04 : dettes fournisseurs (achats à crédit)

Plan validé le 2026-10-02. Chantier terminé le 2026-10-04 : tous les commits sont poussés, CI verte, vérifiés en prod par Mahamadou.

Horloge du PC décalée jusqu'au 2026-10-04 : les dates git du 7 bis au 8 ter, et les dates 2026-10-03 notées pendant cette période, peuvent être fausses ; les dates de vérification en prod font foi.

- Commit 1 (expand) : `708acdf`, vérifié en prod par Mahamadou (Live, migrations 0015 et 0016, achat normal, caisse).
- Commits 2 et 3 : `3c761a1`, vérifiés en prod par Mahamadou (Live, migration 0017, test en prod).
- Commit 1 bis (contract) : `24ed0e8` (migrations 0018 re-backfill et 0019 NOT NULL), vérifié en prod par Mahamadou (0018 et 0019, achat normal, caisse).
- Commit 4 : `9131791` (`formater_montant`) et `e8e71fd` (API des paiements), poussés (`515153b`), CI verte.
- Commit 5 : `16e3f4d`, poussé (`0fc48d1`), CI verte. Render Live vérifié par Mahamadou (ce déploiement inclut aussi le commit 4).
- Commit 6 : `7cd88cc`, poussé (`29e03bd`), CI verte. Vérifié en prod par Mahamadou : Render Live, caisse du 01/10 identique à avant.
- Commit 7 : `2e25e34`, poussé (`f72d73b`), CI verte. Vérifié en prod par Mahamadou le 2026-10-03 : achat à crédit de 1000 avec 300 versés en espèces, reste dû de 700 FCFA affiché après l'enregistrement, badge sous le fournisseur, 300 dans les sorties de la caisse du jour.
- Commit 7 bis : `38e2584`, poussé (`cb5d253`), CI verte, vérifié en prod par Mahamadou. lint, build et 164 tests Vitest OK en local, 5 mutations détectées, captures à 375 px et en desktop.
- Petit chantier « bouton flottant » (priorité, avant le commit 9) : correctif `ed7c70c`, poussé (`cb5d253`), CI verte, voir plus bas.
- Commit 9 : `486155c`, poussé (`6873bc7`), CI verte, vérifié en prod par Mahamadou. Plan et décisions ci-dessous (2026-10-03). lint et build OK ; 27 tests de `JournalCaisse.test.jsx` OK ; 8 mutations détectées ; captures à 375 px, en desktop et à l'impression.
- Commit 8 : `0abc2a4`, poussé (`ed764df`), CI verte, vérifié en prod par Mahamadou. Plan et décisions ci-dessous (2026-10-03). lint et build OK ; 185 tests Vitest OK (dont 12 dans `SuppliersDettes.test.jsx`) ; 10 mutations détectées ; captures à 375 px et en desktop.
- Correctif z-index d'Iwi (priorité, avant le 8 bis) : `6dd69a4`, poussé (`0036395`), CI verte. Bouton d'Iwi en `z-40` (couche des éléments flottants), les fenêtres en `z-50` le recouvrent. Mesure Playwright (`elementFromPoint` au centre du bouton), à 375 px et en desktop : fiche fournisseur, ajout de fournisseur, fiche client, ajout de client : Iwi au-dessus avant le correctif (8 échecs), recouvert après ; sans fenêtre, Iwi reste visible et cliquable. Panneau « Plus » (375 px) : déjà au-dessus d'Iwi avant, inchangé. Autres fenêtres (Produits, Catégories, Dépenses, Employés, Unités de vente) : même structure, non mesurées. Échelle des couches ajoutée à `CLAUDE.md`.
- Commit 8 bis : `bafa7ee`, poussé (`577f62b`), CI verte. Vérifié en prod par Mahamadou : Render Live sur `577f62b`, logs sans erreur 500, achat comptant normal. Réponse de la route `/api/fournisseurs/dette_totale/` confirmée au 8 ter, via l'écran Fournisseurs. `check`, `makemigrations --check` et 576 tests backend OK (dont 10 dans `DetteTotaleFournisseursTests`) ; 5 mutations détectées.
- Commit 8 ter : `6a9deca`, poussé, CI verte. Vérifié en prod par Mahamadou le 2026-10-04 (Boutique 2) : « Total dû : 20 000 FCFA à 1 fournisseur », identique au badge, singulier correct ; après un paiement de 20 000 en Mobile Money depuis la fiche, « Aucune dette fournisseur en cours. » sans recharger la page ; journal de caisse cohérent (Dettes fournisseurs payées +20 000, Mobile Money +20 000). lint, build et 193 tests Vitest OK ; 7 mutations détectées.
- Suite : chantier « remboursements sur vente annulée et option B des ventes », terminé le 2026-10-05, voir plus bas.

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
   - Plan validé le 2026-10-03. Badge « Doit X » (`avec_dette`, ancienneté colorée comme pour les clients) ; bouton « Dettes et paiements » qui ouvre la fiche du fournisseur (calquée sur `FicheClient`) : achats à crédit avec total, payé à l'achat et son mode, reste dû, badges « Partiel », « Soldé », « Annulé » ; paiements avec montant effectif, mode et « Enregistré par » ; corrections avec écart et motif. Aucun montant calculé : valeurs de l'API, bornes vérifiées par le serveur.
   - `avec_dette` en échec : silencieux seulement pour un 404 (route absente, backend antérieur) ; toute autre erreur (réseau, 500) affiche « Impossible de charger les dettes fournisseurs », pour ne pas laisser croire qu'il n'y a aucune dette.
   - Achats soldés gardés dans la fiche (badge « Soldé »). Montant du paiement jamais prérempli. Mode de paiement obligatoire, sans valeur par défaut. Paiement : employé et propriétaire ; correction : propriétaire seulement, jamais sur un achat annulé (D3). Vue support : formulaire et « Corriger » masqués, comme dans la fiche client.
   - À 375 px, les lignes de paiement passent à la ligne au lieu d'être tronquées : « Enregistré par » reste lisible (D3).
8 bis. `feat(suppliers)` : total dû à tous les fournisseurs, calculé par le backend (le frontend ne fait pas la somme). Commit backend séparé, après le 8 (décidé le 2026-10-03).
   - Plan validé le 2026-10-03 : `GET fournisseurs/dette_totale/` renvoie `{"dette_totale": "X.XX", "nombre_fournisseurs": N}` (non paginé). Une requête d'agrégat sur le même queryset et le même filtre que `avec_dette` : le total vaut, par construction, la somme de leurs `dette_totale`. Montant en chaîne, `"0.00"` et `0` sans dette, jamais null. Accès comme `avec_dette` : isolation par boutique, vue support, employé (D3), lecture permise avec un abonnement expiré. Ni migration, ni frontend.
8 ter. `feat(frontend)` : affichage du total en haut de l'écran Fournisseurs (« Total dû : X à N fournisseurs »), après le déploiement du 8 bis sur Render (décidé le 2026-10-03). Même traitement des erreurs que `avec_dette` : silencieux sur un 404 (backend antérieur), message discret sur toute autre erreur.
   - Plan validé le 2026-10-03. Montant de l'API tel quel, jamais la somme des badges. Sans dette : « Aucune dette fournisseur en cours. ». Erreur du total : message distinct (« Impossible de charger le total dû aux fournisseurs. »), chaque appel gère sa propre erreur. Total rechargé après chaque paiement ou correction, comme les badges.
9. `feat(frontend)` : journal de caisse, sorties par mode, bandeau adapté. Vient **après le petit chantier « bouton flottant »** (décidé le 2026-10-03). Part **avant ou avec le commit 8** (décidé le 2026-10-03) : sans lui, l'ancien `JournalCaisse.jsx` afficherait « aucun mouvement » un jour où il n'y a que des paiements fournisseurs.
   - État vide : ajouter `sorties.nombre_paiements_fournisseurs` à la condition ; clé absente (backend antérieur) : pas d'état vide, comme `nombre_remboursements`.
   - Bandeau : achats = argent réellement versé (acomptes et paiements fournisseurs), par mode ; « non précisé » = achats enregistrés avant le suivi du mode ; les dépenses restent supposées payées comptant.
   - « À savoir » : `credit_fournisseur_obtenu` et `dette_fournisseurs_restante` ne portent que sur les achats de la période. Libellé comme pour les clients : « Acheté à crédit sur la période : X, dont encore dû aujourd'hui : Y ». La dette totale par fournisseur reste dans l'écran Fournisseurs.
   - Chaque nouveau champ peut être absent (ligne masquée).
   - Décisions du 2026-10-03 : « Acheté à crédit » toujours affiché, même à 0, comme « Vendu à crédit » (cohérence). Sous la ligne « Achats », deux sous-lignes : « Payé à l'achat » (`acomptes_achats`, `nombre_achats`) et « Dettes fournisseurs payées » (`paiements_fournisseurs`, `nombre_paiements_fournisseurs`). Dans « À savoir » : « Si un achat à crédit est annulé, ses paiements restent à leur date et s'annulent entre eux. »
   - Achats par mode : une seule liste ; les modes à 0 sont masqués sur téléphone seulement, comme pour les entrées.

## Petit chantier prioritaire : bouton flottant de l'assistant

Passé en priorité le 2026-10-03, avant le commit 9 : depuis le 7 bis, à 375 px, le bouton flottant recouvre un champ obligatoire (le sélecteur « Mode de paiement » du formulaire d'achat), en plus du « Montant Total ». Plan révisé validé le 2026-10-03. Correctif : `ed7c70c`.

- Décision (2026-10-03) : Iwi reste visible sur mobile (argument de vente, commerçants surtout sur téléphone). On essaie d'abord la solution la plus simple : agrandir la marge basse de `main` (`App.jsx`), sur mobile et en desktop, pour que la fin de toute page puisse défiler au-dessus du bouton. Les champs du milieu de page se dégagent en défilant, comme avec tout bouton flottant. Si ça ne suffit pas, on reparlera de l'en-tête.
- Décision (2026-10-03) : le cas « milieu de page » est accepté, y compris pour Valider à 375 px (il se dégage en défilant). On ne reparle de l'en-tête que si des commerçants s'en plaignent.
- Constat : `Assistant.jsx`, bouton de 56 px en `fixed bottom-20 right-4` (mobile), `md:bottom-6 md:right-6`. Son haut est à 136 px du bas de l'écran sur mobile, 80 px en desktop. La marge basse de `main` n'est que de 96 px (`pb-24`) sur mobile et 24 px (`md:pb-6`) en desktop : même tout en bas d'une page, les derniers 40 px (mobile) ou 56 px (desktop) du contenu restent sous le bouton.
- Correctif prévu : `pb-36` (144 px) sur mobile et `md:pb-24` (96 px) en desktop, soit 8 px et 16 px de marge au-dessus du bouton. Une seule ligne de `App.jsx`, valable pour toutes les pages.
- Mesure Playwright faite le 2026-10-03, avant correctif (API simulée, panier d'une ligne, historique de 2 achats puis vide) :
  - En fin de page, le bas du contenu est sous le haut du bouton : 716 px contre 676 px à 375 px (écran de 812 px), 876 px contre 820 px en desktop (écran de 900 px). En desktop, avec un historique, le bouton « Annuler l'achat #40 » est sous Iwi.
  - **Limite** : à 375 px, le formulaire d'achat n'est jamais en fin de page (l'historique le suit, même vide). Quand on fait défiler juste assez pour voir Valider au-dessus de la barre du bas, Valider est sous Iwi, avec ou sans le correctif. Il se dégage en défilant d'environ 70 px de plus (bas de Valider à 748 px, haut d'Iwi à 676 px). La marge seule ne change donc rien à ce cas : c'est le cas « milieu de page ».
- Preuves prévues :
  - Mesure Playwright, à 375 px et en desktop, sur Achats, vue échouer avant le correctif : défilement jusqu'en bas de la page, le bas du contenu de `main` est au-dessus du haut du bouton Iwi, et aucun champ ni bouton n'est sous Iwi (en desktop : plus de « Annuler l'achat #40 »).
  - Formulaire d'achat à 375 px : il existe une position de défilement où tous ses champs et Valider sont hors du bouton Iwi (vrai avant et après : constat, pas preuve du correctif).
  - Captures d'Achats à 375 px et en desktop, en fin de page.
- Résultat (2026-10-03) : la mesure échouait avant le correctif (4 échecs) et passe après. En fin de page, bas du contenu à 668 px pour un bouton à 676 px (375 px), 804 px pour 820 px en desktop, aucun élément sous le bouton. Le constat « milieu de page » passe avant et après. Le script Playwright n'est pas dans la CI (jsdom ne calcule pas la mise en page). Un commentaire dans `Assistant.jsx` rappelle le lien entre la position du bouton et la marge de `main`.

## Terminé le 2026-10-05 : remboursements sur vente annulée et option B des ventes

Analyse du code faite le 2026-10-04 (sans coder, bug non reproduit par un test). Plan validé le 2026-10-04 par Mahamadou. Chantier terminé le 2026-10-05 : les commits 1, 3, 2 et 2 bis sont poussés, CI verte, vérifiés en prod par Mahamadou. Suite : chantier « offre unique », voir plus bas.

- Commit 1 : `a04168d`, poussé le 2026-10-05, CI verte (run GitHub Actions 37280078868, succès). Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2) : vente à crédit V-AD91351B de 6 000 annulée, remboursement de 5 000 refusé avec « Impossible d'enregistrer un remboursement sur une vente annulée. », Payé reste à 0 ; l'ancien frontend affiche bien le message du serveur. Constat au passage : sur cette vente annulée, la fiche client affiche le badge « En attente » et « Dû 6 000 FCFA » en rouge, comme si le client devait encore 6 000 (à traiter par le commit 3). Contrôle du statut dans `enregistrer_remboursement`, sous le verrou. Deux tests vus échouer avant le correctif (201 au lieu de 400) : `RemboursementVenteAnnuleeTests` (0 ligne créée, `montant_du` et `statut_paiement` inchangés) et `AnnulationVenteRemboursementConcurrenceTests` (le remboursement attend le verrou de l'annulation, vérifié dans `pg_stat_activity`, puis est refusé). `check`, `makemigrations --check` et 578 tests backend OK. L'ordre inverse (remboursement d'abord, annulation ensuite) n'est pas testé ici : il change avec le commit 2 (option B).
- Commit 3 : plan validé le 2026-10-05 par Mahamadou (voir ci-dessous), `b61feee`, poussé le 2026-10-05 avec les commits doc `709eed1` et `59dae5f`, CI verte (run GitHub Actions 37284157391, succès). Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2, fiche de Bintou) : V-AD91351B carte grise, badge « Annulée », Dû « — » en gris, phrase affichée, aucun formulaire ; V-2F621063 inchangée (Partiel, Dû 10 000 en rouge, formulaire). Corps du `<li>` volontairement pas réindenté (diff lisible) ; pas de commit de style : extraction prévue en composant, voir les chantiers séparés.
  - Badge gris « Annulée » à la place du badge de paiement, carte grisée. « Dû » : « — » en gris au lieu de `montant_du` (pas de « 0 » inventé), et la phrase « Vente annulée : le client ne doit rien sur cette vente. ». Net et Payé inchangés.
  - Formulaire de remboursement et bannière Premium masqués ; « Corriger » l'était déjà ; les remboursements existants restent visibles.
  - `statut` absent (backend antérieur) : affichage d'avant, jamais d'annulation déduite d'un autre champ. En pratique `statut` est dans `HistoriqueClientSerializer` depuis `157e2c5`.
  - Preuves : 5 tests dans `Clients.test.jsx` ; 3 vus échouer avant le correctif, 2 de non-régression qui passaient déjà (statut absent, remboursements visibles sans « Corriger »). 7 mutations détectées. lint, build et 198 tests Vitest OK (287 s). Captures à 375 px et en desktop.
- Commit 2 : plan validé le 2026-10-05 par Mahamadou, avec son message de refus. `908513f`, poussé le 2026-10-05 avec les commits doc `c6139b7` et `af07675`, CI verte (run GitHub Actions 37291373031, succès). Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2, Bintou) : vente #28 (V-FB40E0D5) de 6 000 avec un remboursement de 5 000, annulation refusée avec « 5 000 FCFA de remboursements sont déjà enregistrés sur cette vente : corrigez-les à 0 avant de l'annuler. » ; remboursement corrigé à 0 (motif saisi), puis annulation acceptée ; fiche client : vente « Annulée », remboursement barré et correction −5 000 visibles en lecture seule ; journal de caisse du jour : +5 000 et −5 000 se compensent, les 2 lignes sont comptées.
  - Annulation : refusée seulement si le total net des remboursements (corrections comprises, lu sous le verrou de la vente) est différent de 0. Message : « X de remboursements sont déjà enregistrés sur cette vente : corrigez-les à 0 avant de l'annuler. » (« ont déjà été remboursés » écarté : on pourrait croire que la boutique a rendu l'argent au client).
  - Journal : filtre `vente__statut='VALIDEE'` retiré des remboursements, comptés à leur date. Sans effet sur les chiffres passés (requête du 2026-10-05 : 0 ligne).
  - Preuves : 5 tests vus échouer avant le correctif (message, correction partielle, correction à 0 puis annulation, journal, concurrence dans le sens « remboursement d'abord ») ; 3 de non-régression qui passaient déjà (acompte seul, sans remboursement, concurrence du commit 1). 5 mutations détectées, dont le total lu hors verrou. `check`, `makemigrations --check` et 583 tests backend OK. Sans migration.
  - Limites inchangées : l'acompte d'une vente annulée disparaît du jour de la vente (pas de `date_annulation`) ; corriger exige le Premium, donc une boutique redescendue ne peut ni ramener le total à 0 ni annuler (déjà le cas en option A, réglé par l'offre unique).
- Commit 2 bis : validé le 2026-10-05, `f8f88cc`, poussé le 2026-10-05 avec le commit doc `b3ca9af`, CI verte (run GitHub Actions 37293371621, succès). Vérifié en prod par Mahamadou le 2026-10-05 : la phrase s'affiche dans « À savoir » du journal de caisse, juste avant celle des achats. Affichée sans condition (le commit 2 n'a ajouté aucune clé qui permettrait de reconnaître un backend antérieur). Test dans le bloc principal de `JournalCaisse.test.jsx`, vu échouer sans la phrase ; lint, build et 199 tests Vitest OK. `feat(frontend)` séparé, après le commit 2 : phrase « À savoir » du journal de caisse, « Si une vente à crédit est annulée, ses remboursements restent à leur date et s'annulent entre eux. », comme celle des achats.

### Analyse

- Bug : un remboursement est accepté sur une vente annulée. Aucune couche ne vérifie le statut à la création : `RemboursementSerializer.validate` (montant > 0, ≤ `montant_du`), `RemboursementViewSet.perform_create` (accès, Premium, boutique), `enregistrer_remboursement` (verrou, montant). Seule la correction refuse une vente annulée (`corriger_remboursement`), comme `enregistrer_paiement` côté fournisseurs.
- Chemin réel : `VenteViewSet.annuler` ne change que `statut`, une vente à crédit annulée garde son `montant_du` > 0. La fiche client affiche le formulaire « Enregistrer un remboursement » dès que `montant_du` > 0 (`Clients.jsx`), sans regarder le statut, et n'affiche pas « Annulée » (seulement le badge de paiement).
- Conséquences : l'argent reçu n'apparaît pas au journal de caisse (`reports/caisse.py`, filtre `vente__statut='VALIDEE'`) ; le remboursement ne peut pas être corrigé. Les dettes affichées ne bougent pas (`dette_totale_client`, `avec_dette`, assistant, notifications excluent déjà les ventes annulées).
- Annulation des ventes : option A (`annuler` refuse dès que `vente.remboursements.exists()`, même corrigés à 0, message sans issue). Achats : option B (refus seulement si le total net versé ≠ 0, message qui dit quoi faire).
- Lien avec le journal : en option B, une vente annulée peut avoir des lignes de remboursement (+5000 puis -5000). Avec le filtre `vente__statut='VALIDEE'`, elles disparaîtraient après coup des jours passés : il faut les compter à leur date, comme les paiements fournisseurs. Le commentaire de `caisse.py` (« ne peut pas être annulée ») deviendra faux.
- Concurrence : `annuler`, `enregistrer_remboursement` et `corriger_remboursement` verrouillent la même vente (`select_for_update`) ; il manque seulement le contrôle du statut dans `enregistrer_remboursement`.
- Modèle pour le chantier « réponses périmées » : `SalesHistory.jsx` ignore déjà les réponses périmées (`let annule = false`).

### Plan validé (3 commits, ordre 1 → 3 → 2)

1. `fix(sales)` : refuser un remboursement sur une vente annulée. Contrôle seulement dans `enregistrer_remboursement`, sous le verrou (pas dans le serializer) : « Impossible d'enregistrer un remboursement sur une vente annulée. » Test vu échouer avant le correctif ; test de concurrence à deux threads (annulation contre remboursement). Déployable seul, sans migration.
3. `feat(frontend)` : fiche client, badge « Annulée » et formulaire de remboursement masqué sur une vente annulée (aujourd'hui seul « Corriger » l'est). Le message de refus d'annulation s'affiche déjà tel quel dans l'Historique des ventes.
2. `feat(sales)` : annulation des ventes en option B (refus seulement si le total net remboursé ≠ 0, message comme pour les achats ; l'acompte ne bloque pas, limite connue sans `date_annulation`) et journal de caisse qui compte les remboursements d'une vente annulée à leur date (retrait du filtre `vente__statut='VALIDEE'`). Les deux ensemble. Adapter `test_annulation_refusee_si_remboursement_deja_enregistre`, tests de non-régression du journal.
   - **Seulement après la requête SQL** que Mahamadou lancera lui-même avec psql, en lecture seule, sur la base de prod. 0 ligne : le retrait du filtre ne change aucun chiffre passé. Des lignes : décider ensemble avant de toucher au journal.
     ```sql
     SELECT v.boutique_id, COUNT(r.id) AS lignes, SUM(r.montant) AS total
     FROM sales_remboursement r JOIN sales_vente v ON v.id = r.vente_id
     WHERE v.statut = 'ANNULEE'
     GROUP BY v.boutique_id;
     ```
   - Résultat (2026-10-05) : requête lancée par Mahamadou sur la prod avec psql, en lecture seule (`BEGIN READ ONLY`, puis `ROLLBACK`). Remboursements sur ventes annulées : **0 ligne**. Contrôle du filtre : `SELECT statut, COUNT(*) FROM sales_vente GROUP BY statut` donne ANNULEE 3, VALIDEE 24 ; le filtre est juste, le 0 est réel. Conclusion : retirer le filtre `vente__statut='VALIDEE'` du journal ne change aucun chiffre passé. Le commit 2 est débloqué (plan à valider).

## Terminé le 2026-10-05 : offre unique

Décidé le 2026-10-02 : iWiShop passe à une offre unique. Un abonnement valide donne accès à toutes les fonctionnalités, sans palier Essentiel ou Premium. À faire après les dettes fournisseurs. Plan d'abord, rien de codé.

Chantier terminé le 2026-10-05 : les commits 1 à 4 sont poussés, CI verte, vérifiés en prod par Mahamadou ; le nettoyage (tests seuls, rien à vérifier en prod) part avec ce commit doc, qui est le 5. Plus aucun code ne lit le palier. La colonne `FormuleAbonnement.palier` n'est plus lue, mais reste en base et dans l'admin (décision 3) : une nouvelle formule exige toujours une valeur, n'importe laquelle. Suite : chantier « bandeau après l'expiration et code `ABONNEMENT_EXPIRE` », voir plus bas.

Prochaine étape (décidée le 2026-10-05) : analyse du code d'abord, sans coder, en commençant par le retrait de `verifier_acces_premium` du crédit client. Analyse faite et découpage validé le 2026-10-05 (ci-dessous).

### Analyse (2026-10-05)

- Une seule source côté backend : `Boutique.a_acces_premium()` (`tenants/models.py`), qui vaut abonnement valide **et** `formule.palier == 'PREMIUM'`, et faux sans abonnement. Utilisée par `verifier_acces_premium()` (`tenants/premium.py`, 403 avec le code `PALIER_INSUFFISANT`) dans 4 écritures du crédit client (voir le tableau plus bas), et exposée par `MonAbonnementView` (`a_acces_premium`). Le palier n'est lu nulle part ailleurs : ni achats à crédit (D1), ni notifications, ni assistant, ni PayDunya (`creer_facture` et `confirmer_paiement` ne lisent que la formule), ni page des tarifs (`FormuleAbonnementSerializer` n'expose que `id`, `nom`, `duree_jours`, `prix`).
- Frontend : tout passe par `aAccesPremium` (`SettingsContext.jsx`, `?? null`, ne bloque que sur un `false` confirmé) : `Sales.jsx`, `Clients.jsx`, `JournalCaisse.jsx` (colonne), `PremiumRequisBanner.jsx`, `CODE_PALIER_INSUFFISANT` (`errorUtils.js`), lien vers « Mon abonnement » (`App.jsx`).
- Stockage : `FormuleAbonnement.palier` (`ESSENTIEL` ou `PREMIUM`), NOT NULL sans `db_default` (migrations 0011 à 0013). Une boutique a au plus un `Abonnement` (OneToOne) ; son palier est celui de la formule de cet abonnement ; un renouvellement change la formule (`confirmer_paiement`).
- Expiration aujourd'hui (« valide » = statut `ACTIF` et `date_debut` ≤ aujourd'hui ≤ `date_fin` ; `EXPIRE` n'est jamais posé par le code) : toutes les écritures sont refusées (403 « Abonnement expiré. Merci de renouveler votre abonnement. », `_verifier_acces`, vérifié avant le Premium) ; une vente hors ligne synchronisée après coup passe en `ECHEC_AUTRE` et reste visible. Restent accessibles : connexion, lectures, rapports, journal, exports, « Mon abonnement » et paiement PayDunya, notifications, assistant. À l'écran, une boutique Premium expirée voit le crédit grisé avec le message « palier Premium » (trompeur).
- Prod (requêtes en lecture seule lancées par Mahamadou le 2026-10-05) : 3 formules, toutes en `PREMIUM` (« Essai gratuit » 3 000 / 14 j, « 1 MOIS » 15 000 / 30 j, « 3 MOIS » 45 000 / 90 j), chacune avec 1 abonnement en cours ; aucune formule Essentiel, l'offre unique ne change rien pour les clients actuels. Les 3 ont été passées en `PREMIUM` à la main dans l'admin pour contourner les paliers : **ne pas y toucher pendant la transition**. 1 boutique sans abonnement : id 1, « Ma Boutique », active (boutique d'administration).
- « Essai gratuit » : attribuée automatiquement à l'approbation d'une demande (`ApprouverDemandeView`), trouvée **par son nom** (la renommer bloque toute nouvelle inscription) ; son prix n'est pas lu à l'inscription. Seule une formule `actif=True` est en vente (`CreerPaiementView`).

### Décisions (2026-10-05)

1. Expiration : comportement actuel conservé (lecture seule : écritures bloquées ; lectures, exports et renouvellement accessibles).
2. `a_acces_premium()` renvoie exactement `abonnement_valide()`, y compris pour une boutique sans abonnement. Une seule règle partout.
3. La colonne `palier` et son champ dans l'admin restent (aucune suppression), pour pouvoir créer de vrais paliers plus tard dans un chantier dédié.
4. Hors de ce chantier : voir « En attente, côté code » (pas d'abonnement = accès autorisé, bandeau après expiration, assistant après expiration, `marquer_lue`, prix de l'essai).

### Commits prévus (découpage validé le 2026-10-05, chacun déployable seul, sans migration)

1. `feat(tenants)` : `a_acces_premium()` = `abonnement_valide()`, le palier n'est plus lu. L'ancien frontend se débloque seul (`a_acces_premium` passe à vrai pour une boutique valide). Tests `AccesPremiumTests` et `AccesPremiumCreditTests` inversés, vus échouer avant.
   - Fait : `1ae07bd`, poussé le 2026-10-05 avec le commit doc `e006075`, CI verte (run GitHub Actions 37300151394, succès). Vérifié en prod par Mahamadou le 2026-10-05 : « Ma Boutique » (id 1, sans abonnement), « Ajouter un client » cliquable et un client créé avec succès ; Boutique 2 inchangée (bouton actif, Bintou et ses ventes intactes). Preuves : 8 échecs sur 16 avant le correctif, 5 mutations détectées, 586 tests backend OK, sans migration. `MonAbonnementView` renvoie aussi `a_acces_premium()` dans la branche « sans abonnement » (au lieu de `False` en dur).
2. `refactor(sales)` : retrait des 4 appels à `verifier_acces_premium` et de `tenants/premium.py` (sans effet après le 1 : `_verifier_acces` contrôle déjà l'abonnement juste avant).
   - Fait : `6b7e1a7`, poussé le 2026-10-05 avec le commit doc `cb489b1`, CI verte (run GitHub Actions 37303618877, succès). Vérifié en prod par Mahamadou le 2026-10-05 : Render Live sur `6b7e1a7`, logs sans erreur 500, vente à crédit de 500 réussie dans « Ma Boutique ». Retrait sans effet sur le comportement (chaque appel était précédé de `_verifier_acces` sur la même boutique) ; le test d'expiration couvre maintenant les 4 écritures (remboursement et correction ne l'étaient pas), 4 mutations détectées (retrait de chaque `_verifier_acces`), 586 tests backend OK.
   - Nettoyage fait (petit commit séparé, juste avant ce commit doc) : `_donner_acces_premium` renommée `_donner_abonnement_valide` (`sales/tests.py`, 11 occurrences), puisque « Premium » ne veut plus rien dire ; 580 tests backend OK.
3. `feat(frontend)` : retrait de l'affichage Premium (`premiumRefuse`, `PremiumRequisBanner`, `CODE_PALIER_INSUFFISANT`, colonne du journal toujours visible, `aAccesPremium`). Après le 1 sur Render.
   - Plan validé le 2026-10-05. Retrait pur : une boutique expirée voit le refus du serveur (« Abonnement expiré. Merci de renouveler votre abonnement. ») en `alert()` pour l'ajout d'un client et la vente à crédit, dans la page pour le remboursement et la correction, comme pour ses autres écritures ; saisie et panier conservés. Un ancien backend qui renverrait `PALIER_INSUFFISANT` suit le même chemin (message `detail` affiché tel quel).
   - Décision (2026-10-05) : `abonnement` reste dans `SettingsContext` (plus lu par personne après ce commit), uniquement pour le chantier « bandeau après l'expiration ». `getErrorCode` reste aussi (servira au code `ABONNEMENT_EXPIRE`).
   - Fait : `46dfea7`, poussé le 2026-10-05 avec le commit doc `5798986`, CI verte (run GitHub Actions 37307392898, succès). Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2, après Ctrl+Shift+R) : case « Vente à crédit » active, « Ajouter un client » actif, formulaire de remboursement et « Corriger » présents dans la fiche de Bintou, colonne « Remboursements de dettes » visible dans la caisse, aucun « Premium » nulle part. Preuves : 7 tests vus échouer sur 57, 7 mutations détectées, lint, build et 204 tests Vitest OK, grep sans Premium ni PALIER hors des tests, captures (boutique expirée simulée).
4. `refactor(tenants)` : retrait du champ `a_acces_premium` de `mon-abonnement` et de la méthode. Après le 3 sur Vercel (un frontend en cache obtient `null`, qui ne bloque rien).
   - Fait : `c163c85`, poussé le 2026-10-05 avec le commit doc `138360e`, CI verte (run GitHub Actions 37309092226, succès). Vérifié en prod par Mahamadou le 2026-10-05 : Render Live sur `c163c85`, logs sans erreur 500, « Mon abonnement » s'affiche normalement (1 MOIS et 3 MOIS), « Ajouter un client » et la vente à crédit marchent. Grep avant de coder : plus aucun lecteur de `a_acces_premium` (backend, assistant, notifications, admin, frontend). `AccesPremiumTests` remplacée par `MonAbonnementOffreUniqueTests` (4 échecs sur 4 avant le retrait), 3 mutations détectées, 580 tests backend OK.
5. `docs` : section « Fonctionnalités réservées au Premium » marquée terminée ; colonne `palier` notée inutilisée.
   - Fait : ce commit doc.

- Retirer `verifier_acces_premium` du crédit client (les 4 appels : `sales/serializers.py` `VenteSerializer.create`, `sales/views.py` `ClientViewSet.perform_create`, `RemboursementViewSet.perform_create` et `RemboursementViewSet.corriger`), et l'affichage frontend lié (bannière, boutons grisés, colonne masquée du journal). Voir l'inventaire ci-dessous.
- Garder le contrôle d'abonnement valide (`_verifier_acces`).
- Inventorier ce qui dépend encore des paliers : formules en base, PayDunya, pages de prix, tests.
- Règle aussi le point « boutique redescendue du Premium » (section « En attente, côté code »).

## En cours : refus après l'expiration (option B) et code `ABONNEMENT_EXPIRE`

Décidé le 2026-10-05, juste après l'offre unique. Analyse et découpage validés le 2026-10-05 ; commits 1 à 3 poussés et vérifiés en prod.

Prochaine étape : coder le commit 5+6 (commits 5 et 6 regroupés : Achats, Fournisseurs et les autres écrans), plan validé le 2026-10-05 (ci-dessous).

Décision produit de Mahamadou (2026-10-05) :
- **Pas de bandeau permanent** après l'expiration : on ne harcèle pas le client.
- **Option B** : quand une boutique expirée essaie d'enregistrer quelque chose, le refus s'affiche **dans la page** (plus d'`alert()` pour ce refus), avec un bouton « Renouveler » qui ouvre Mon Abonnement **dans une fenêtre par-dessus l'écran** (décidé au commit 3, au lieu d'un passage à Paramètres → Mon Abonnement, qui démonterait l'écran et perdrait le panier).
- La saisie n'est jamais perdue (panier, formulaire).

Constat en prod de Mahamadou (2026-10-05, Boutique 2 mise expirée dans l'admin, puis remise) : aucun bandeau après l'expiration, « Expiré » visible seulement dans Mon Abonnement ; une vente comptant donne un `alert()` « Abonnement expiré. Merci de renouveler votre abonnement. » avec le panier intact.

### Analyse (2026-10-05)

- Une seule source côté serveur : `_verifier_acces` (`tenants/mixins.py`), 403 `{"detail": "Abonnement expiré. Merci de renouveler votre abonnement."}`, sans code.
- 25 écritures dans le frontend peuvent recevoir ce refus ; 21 l'affichent en `alert()`, 4 dans la page (remboursement et correction dans la fiche client, paiement et correction dans la fiche fournisseur), aucune avec un bouton « Renouveler ». Écrans : Ventes (vente, nouveau client à crédit), Historique (annulation), Clients (ajout, remboursement, correction), Achats (enregistrement, annulation), Fournisseurs (création, modification, suppression, paiement, correction), Dépenses (création, annulation), Produits (création, modification, prix par unité, suppression), Stock (mouvement), Catégories, Unités de vente, Paramètres (boutique), Employés (création, désactivation, réactivation). Saisie toujours conservée.
- Pas bloqués par l'expiration : connexion, « Mon abonnement » et paiement PayDunya, mot de passe, assistant (voir plus bas), `marquer_lue`.
- Code sans casser les anciens frontends : `PermissionDenied({"detail": <même texte>, "code": "ABONNEMENT_EXPIRE"})`, comme l'ancien `verifier_acces_premium`. Un ancien frontend lit `detail` (même texte) ; les `assertIn("Abonnement expiré", ...)` des tests restent valables.
- Solution réutilisable : `errorUtils.js` (`CODE_ABONNEMENT_EXPIRE`, `estAbonnementExpire`, `alerterErreur`, `messageErreur`) qui **signale** l'expiration (évènement de fenêtre) au lieu d'ouvrir une `alert` ; un composant `RefusAbonnementExpire.jsx` monté une seule fois dans `App.jsx`, invisible tant qu'aucun refus n'a eu lieu ; une ligne changée par endroit dans chaque écran. Pas de signal dans l'intercepteur d'`api.js` (un écran pas encore modifié afficherait l'`alert` et le message). Face à un ancien backend sans code, l'écran garde l'`alert` d'aujourd'hui.
- Ventes hors ligne : aujourd'hui, 403 à la synchronisation, vente en `ECHEC_AUTRE` (jamais perdue), bandeau « N ventes en attente » sans la raison, et toutes les ventes renvoyées à chaque relance. Proposé : statut `ECHEC_ABONNEMENT` relançable, arrêt de la boucle (comme le 401), raison et bouton dans le bandeau.
- Assistant Iwi : réservé au propriétaire (`IsOwner` côté serveur, bouton masqué aux employés). `AssistantView.post` n'appelle pas `_verifier_acces` : une boutique expirée peut poser des questions (coût en tokens, seul le quota quotidien limite). Où bloquer : appeler `self._verifier_acces(boutique)` en tête de `post`, avant le contrôle de la question, le quota et tout appel à Anthropic (aucune `RequeteAssistant` créée, donc le quota n'est pas consommé). Côté écran, l'erreur s'affiche déjà dans le panneau d'Iwi (`Assistant.jsx`, état `erreur`) : `messageErreur` suffit. Un ancien frontend affiche le `detail` dans le panneau.

### Décisions (2026-10-05)

1. Message fixé en haut de l'écran, couche `z-50` (visible même en bas d'une longue page ; rendu après le contenu, il passe devant une fenêtre ouverte).
2. Textes (validés mot pour mot) :
   - Propriétaire : « Abonnement expiré : rien n'a été enregistré. Votre saisie est conservée. », avec le bouton « Renouveler ».
   - Employés : « Abonnement expiré : prévenez le propriétaire de la boutique. », sans bouton « Renouveler ».
3. Vente hors ligne faite avant l'expiration et synchronisée après : règle actuelle gardée (refusée, puis envoyée après le renouvellement), car l'heure du téléphone (`horodatage_client`) est falsifiable.
4. L'assistant Iwi est bloqué après l'expiration (coût en tokens) : même code, même message, même bouton (propriétaire seulement, l'assistant lui étant réservé).

### Commits prévus (chacun déployable seul, sans migration)

1. `feat(tenants)` : code `ABONNEMENT_EXPIRE` dans `_verifier_acces`. Tests du code et du texte inchangé sur plusieurs écrans, vus échouer avant.
   - Fait : `0d9352c`, poussé le 2026-10-05 avec le commit doc `1eb7144`, CI verte (run GitHub Actions 37315236819, succès). Vérifié en prod par Mahamadou le 2026-10-05 : Render Live sur `0d9352c`, logs sans erreur 500, vente normale OK. `RefusAbonnementExpireCodeTests` : réponse exacte sur 6 écritures (création d'une catégorie et d'un client, modification d'un fournisseur et d'un produit, annulation d'une vente et d'une dépense), 6 échecs avant ; boutique désactivée sans code ; 4 mutations détectées ; 584 tests backend OK.
2. `feat(assistant)` : `_verifier_acces` en tête d'`AssistantView.post` (refus avant le quota et avant Anthropic).
   - Fait : `f7f04ec`, poussé le 2026-10-05, CI verte (run GitHub Actions 37317694337, succès). Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2) : expirée dans l'admin, Iwi affiche « Abonnement expiré. Merci de renouveler votre abonnement. » sans répondre ; date remise, Iwi répond normalement. `AssistantAbonnementExpireTests` (client Anthropic mocké) : refus sans appel à Anthropic ni `RequeteAssistant` créée, refus avant le quota (au lieu de 429), avant la question vide (au lieu de 400), avant la clé absente (au lieu de 503), 4 échecs avant ; `test_boutique_desactivee_refusee_sans_ce_code` (effet voulu : refus « Cette boutique a été désactivée. », sans code, Anthropic jamais appelé, 0 ligne), vu échouer sans le contrôle (200 au lieu de 403) ; 5 mutations détectées (contrôle retiré puis déplacé après chacun des contrôles) ; 590 tests backend OK.
3. `feat(frontend)` : socle (`errorUtils`, `RefusAbonnementExpire`, fenêtre « Renouveler », message employé) et Ventes.
   - Fait : `42c780d`, poussé le 2026-10-05 avec le commit doc `3fd1802`, CI verte (run GitHub Actions 37343145197, succès). Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2 expirée dans l'admin, puis remise) : message « Abonnement expiré : rien n'a été enregistré. Votre saisie est conservée. » avec « Renouveler », aucun `alert()` ; Mon Abonnement s'ouvre par-dessus l'écran, panier intact ; le bandeau orange J-3 (`AbonnementBanner`) marche toujours. Message employé non vérifié en prod (prouvé par les tests et les captures). Preuves : 13 tests (`errorUtils.test.js`, `RefusAbonnementExpire.test.jsx`), 5 échecs sur 7 avec l'ancien `Sales.jsx` ; 11 mutations détectées, dont « un message par refus » ; lint, build et 217 tests Vitest OK ; captures Playwright à 375 px et en desktop.
   - Décisions du commit 3 (2026-10-05) :
     - `errorUtils.js` : `CODE_ABONNEMENT_EXPIRE`, `estAbonnementExpire` (403 **et** code), `alerterErreur(err, fallback)`, qui remplace `alert(getErrorMessage(...))` dans les écrans : sur ce refus, un évènement de fenêtre au lieu de l'`alert` ; toute autre erreur, et l'ancien backend (même texte, sans code), gardent l'`alert` d'avant.
     - `RefusAbonnementExpire.jsx`, monté une seule fois à la fin d'`App.jsx` : message fixé en haut, `z-50`, textes de la décision 2, bouton « Fermer le message ». **Un seul message**, quel que soit le nombre de refus (deux refus presque en même temps n'en affichent qu'un) ; il revient au refus suivant s'il a été fermé.
     - « Renouveler » ouvre Mon Abonnement (`MonAbonnement.jsx` tel quel) dans une fenêtre `z-50`, rendue après le message (elle passe devant) ; l'écran reste monté dessous, panier et saisie conservés à la fermeture.
     - Utilisateur pas encore chargé (`est_proprietaire` inconnu) : texte du propriétaire, sans bouton.
     - Ventes : les deux `alert` d'erreur serveur (création du nouveau client à crédit, enregistrement de la vente) passent par `alerterErreur`.
     - `messageErreur` (erreurs affichées dans la page) reporté au commit 4, premier écran qui s'en sert.
   - Limites connues : choisir une formule envoie vers PayDunya (page quittée, comme aujourd'hui depuis Mon Abonnement) : le panier est alors perdu. En desktop, le message recouvre une partie de la navigation tant qu'il n'est pas fermé (décision 1). Le montage dans `App.jsx` n'est couvert par aucun test Vitest (pas de test d'`App`), seulement par les captures Playwright.
4. `feat(frontend)` : Historique et Clients.
   - Plan validé le 2026-10-05 par Mahamadou :
     - `messageErreur(err, fallback)` dans `errorUtils.js`, pour les erreurs affichées sous un formulaire : sur le refus `ABONNEMENT_EXPIRE`, même signal qu'`alerterErreur` et renvoie `''` ; sinon renvoie `getErrorMessage(...)` sans signal. Les erreurs sous les formulaires ne s'affichent que si le texte n'est pas vide : sur ce refus, rien sous le formulaire (l'erreur précédente de la même vente est effacée), seul le message du haut reste. Jamais deux messages.
     - Endroits : Historique, annulation d'une vente (`alerterErreur`, liste non rechargée) ; Clients, ajout d'un client (`alerterErreur`) ; fiche client, remboursement et correction (`messageErreur`). Inchangés : l'`alert` locale « Le téléphone est obligatoire. » (chantier des `alert`) et le `window.confirm` de l'annulation.
     - Fenêtre déjà ouverte (fiche client, ajout d'un client) : toutes en `z-50` dans `main`, le message et la fenêtre « Renouveler » rendus après `main` passent devant (à mesurer avec `elementFromPoint`). Saisie conservée : la fenêtre d'ajout ne se ferme qu'en cas de succès, montant et mode du remboursement ne sont remis à zéro qu'en cas de succès, le formulaire de correction reste ouvert ; ouvrir puis fermer « Renouveler » ne démonte rien. Employé (remboursement permis, D3) : texte employé, sans bouton.
     - Ancien backend (même texte, sans code) : comportement d'aujourd'hui (`alert` pour l'annulation et l'ajout, erreur sous le formulaire pour le remboursement et la correction). `Clients.test.jsx` (création et remboursement refusés en 403 sans code) restent tels quels comme non-régression ; ajout du même cas pour la correction et l'annulation.
     - Tests, chaque écran rendu avec `RefusAbonnementExpire` : `messageErreur` (unitaires) ; annulation, ajout (puis « Renouveler », fenêtre après la fenêtre d'ajout dans le DOM, saisie intacte après « Fermer »), remboursement (un seul `role="alert"`, aucune erreur sous le formulaire, montant et mode conservés), correction, employé. Dans chaque test de refus, le bouton revient à son état normal (cliquable, plus d'état « en cours »). Vus échouer avant.
     - Mutations : `messageErreur` renvoie le message sur ce refus (deux messages) ; pas de signal ; chacun des 4 endroits remis comme avant ; fenêtre d'ajout fermée sur une erreur ; montant remis à zéro sur une erreur ; état « en cours » laissé bloqué après le refus.
     - Captures Playwright à 375 px et en desktop avec `elementFromPoint` : message au premier plan au-dessus de la fiche client et de la fenêtre d'ajout, « Renouveler » devant elles, saisie relue après fermeture.
   - Fait : `78643c1`, poussé le 2026-10-05 avec les commits doc `0fa1d5c`, `0e1a6c9` et `40e4822`. CI : sur les runs #99 (37369517464, `0fa1d5c`) et #100 (37373059418, `0e1a6c9`), job frontend vert, job backend jamais démarré (« The job was not acquired by Runner of type hosted even after multiple attempts », annulé après 15 min, aucune étape lancée) : incident GitHub, pas un test en échec. Run #101 (37374761684, `40e4822`, qui contient le code du commit 4) **vert**, frontend et backend : le job backend a obtenu une machine après environ 13 min d'attente. Vérifié en prod par Mahamadou le 2026-10-05 (Boutique 2, date de fin au 04/10/2026, puis remise au 23/10/2026) : remboursement refusé dans la fiche client avec le message rouge en haut, rien enregistré, montant conservé ; « Renouveler » ouvre Mon Abonnement devant la fiche. Non vérifiés en prod (prouvés par les tests et les captures) : annulation dans l'Historique, ajout d'un client, correction, message employé. Preuves : 10 tests (2 unitaires de `messageErreur`, 8 dans `RefusAbonnementExpireHistoriqueClients.test.jsx`), 6 des 8 tests d'écran en échec sur l'ancien code ; 12 mutations détectées, dont 4 « état en cours bloqué » ; lint, build et 227 tests Vitest OK ; captures Playwright à 375 px et en desktop avec `elementFromPoint`.
   - Incident de test (2026-10-05, Boutique 2, prod) : un premier essai avec une date de fin au 06/10/2026 (abonnement encore valide) a réellement enregistré un remboursement de 100 sur V-2F621063, corrigé à 0 par Mahamadou (motif « test », correction chaînée : +100 et −100 dans le journal de caisse du jour), et annulé une vente de test. Leçon : avant un test d'expiration, vérifier que le bandeau orange J-3 a disparu. Plus sûr encore : vérifier que Mon Abonnement affiche « Expiré » (le bandeau est aussi absent pour un abonnement valide à plus de 3 jours de sa fin).
   - Limite connue (relevée sur les captures du 2026-10-05) : à 375 px, le message recouvre la croix de la fiche client tant qu'il n'est pas fermé (constaté quand la fiche a défilé). On le ferme avec sa propre croix.
5+6. `feat(frontend)` : commits 5 et 6 regroupés (décidé le 2026-10-05) : Achats, Fournisseurs (fiche comprise) et les autres écrans (Dépenses, Stock, Produits, Catégories, Unités de vente, Paramètres, Employés, panneau d'Iwi). Une seule raison de changer (même refus, même traitement) ; deux fichiers de tests (« Achats et Fournisseurs », « autres écrans ») pour garder chaque lancement court.
   - Plan validé le 2026-10-05 par Mahamadou (points 1 à 4) :
     - `alerterErreur` : Achats (enregistrement, annulation), Fournisseurs (création ou modification, suppression), Dépenses (création, annulation), Stock (mouvement), Produits (création ou modification, suppression), Catégories (création, suppression), Unités de vente (création ou modification, suppression, suppression forcée), Paramètres (boutique), Employés (création, désactivation, réactivation).
     - `messageErreur` : fiche fournisseur (paiement, correction) ; panneau d'Iwi (le cas 429 reste testé en premier, question conservée).
     - Inchangés : l'`alert` regroupé des prix par unité dans Produits (`Products.jsx`, « le produit a été enregistré, mais certains prix… ») : sur ce refus, l'enregistrement du produit est refusé d'abord et les prix ne sont jamais envoyés ; limite connue : expiration exactement entre deux requêtes, non traitée. Mon Compte (mot de passe, non bloqué par l'expiration). Les `alert` de validation locale (chantier des `alert`). Les `window.confirm`.
     - Fenêtres déjà ouvertes (toutes en `z-50`, rendues avant `RefusAbonnementExpire`) : message et « Renouveler » devant, à mesurer avec `elementFromPoint`.
     - Ancien backend : un test de non-régression par mécanisme (un `alert` : enregistrement d'un achat ; une erreur dans la page : paiement dans la fiche fournisseur ; le panneau d'Iwi), pas par endroit.
     - Tests, vus échouer avant, chaque écran rendu avec `RefusAbonnementExpire` : pour chacun des 21 endroits, message en haut, aucun `alert()`, aucune erreur dans la page (endroits en `messageErreur`), saisie conservée, bouton revenu à son état normal ; « Renouveler » devant la fenêtre produit et devant le panneau d'Iwi, saisie intacte après « Fermer » ; employé (paiement fournisseur).
     - Mutations (environ 40) : chacun des 21 endroits remis comme avant (2 pour la suppression forcée d'une unité) ; « en cours » laissé bloqué sur les 12 endroits qui ont cet état ; saisie perdue sur une erreur (panier d'achat, fenêtre produit, question d'Iwi). Chaque mutation ne lance que le fichier de tests concerné.
     - Captures Playwright à 375 px et en desktop avec `elementFromPoint` : Achats (panier conservé), fiche fournisseur (paiement refusé), fenêtre produit, panneau d'Iwi, Paramètres.
     - Unités de vente et Employés n'ont aucun état « en cours » : la vérification du bouton y est faible (toujours cliquable) ; pas ajouté dans ce commit (chantier séparé, voir « En attente, côté code »).
7. `feat(frontend)` : ventes hors ligne (`ECHEC_ABONNEMENT`, arrêt de la boucle, bandeau).
8. `docs` : `EN_COURS.md`.

Les commits frontend marchent aussi face à l'ancien backend (sans code, `alert` d'aujourd'hui).

- Aujourd'hui (constaté au plan du commit 3 de l'offre unique) : une boutique expirée ne voit le refus qu'après avoir rempli un formulaire, le plus souvent dans un `alert()`, sans lien vers « Mon abonnement » ; `AbonnementBanner` ne s'affiche qu'entre J-3 et J0, tant que l'abonnement est valide.
- Idées à étudier (le bandeau global permanent est écarté par la décision ci-dessus) : un code `ABONNEMENT_EXPIRE` à côté du message de `_verifier_acces` (backend), pour que le frontend reconnaisse ce refus sans lire le texte français (`getErrorCode` est gardé pour ça) ; `abonnement` du `SettingsContext` (gardé pour ça).

## Fonctionnalités réservées au Premium (historique : toutes retirées par l'offre unique, terminée le 2026-10-05)

État au 2026-10-02, gardé pour mémoire : plus rien de ce qui suit n'existe dans le code (`verifier_acces_premium`, `tenants/premium.py`, `a_acces_premium`, `PremiumRequisBanner.jsx`, `CODE_PALIER_INSUFFISANT` et `aAccesPremium` ont été retirés ; la colonne du journal est toujours affichée). Seule la colonne `FormuleAbonnement.palier` reste, sans être lue (décision 3).

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

- CI (relevé le 2026-10-05, annotation GitHub) : le libellé `ubuntu-latest` passera à Ubuntu 26 à partir du 19 octobre 2026. Surveiller la CI après cette date (versions de Python, de Node et de PostgreSQL de l'image).

- Petit défaut (relevé en prod le 2026-10-04) : couleurs des dettes à harmoniser, fournisseurs et clients. Le total de l'écran Fournisseurs est en rouge, alors que le badge « Doit X » peut être vert : `couleurBadgeDette` colore le badge selon l'ancienneté de la plus vieille dette (vert à moins de 7 jours, orange jusqu'à 30, rouge au-delà), c'est voulu, mais la juxtaposition avec le total rouge prête à confusion. « Reste dû 0 » (fiche fournisseur) et « Dû 0 » (fiche client) s'affichent en rouge. Décider d'une règle commune avant de corriger.
- Même défaut que la fiche client avant le commit 3 (relevé le 2026-10-05, par lecture du code, sans y toucher) : dans la fiche fournisseur (`FicheFournisseur.jsx`), un achat annulé a bien son badge « Annulé », mais « Reste dû » affiche toujours `montant_du` en rouge, comme si la dette restait due. À traiter avec le point précédent (couleurs des dettes), sur le modèle de la fiche client.
- Chantier séparé (relevé le 2026-10-03, par lecture du code, non reproduit) : réponses anciennes qui écrasent les plus récentes. Aucun rechargement n'ignore une réponse périmée (ni annulation, ni numéro de requête) : `fetchDettes` (`Suppliers.jsx`), `chargerHistorique` (`FicheFournisseur.jsx`), `fetchClients` et l'historique de `FicheClient` (`Clients.jsx`), et le total du 8 ter. Deux paiements rapides sur deux achats de la fiche fournisseur lancent deux rechargements ; si le premier répond en dernier, badges et historique montrent un état sans le second paiement, jusqu'au prochain rechargement. Plus gênant : en vue support, changer vite de boutique pourrait afficher un instant les dettes de la boutique précédente (affichage seulement, l'API reste isolée). Piste : ignorer toute réponse qui n'est pas celle de la dernière requête.
- Réglé par l'offre unique (2026-10-05) : une boutique redescendue du Premium ne pouvait plus enregistrer les remboursements de ses clients (`RemboursementViewSet.perform_create`), ce qui faussait sa caisse. Depuis `1ae07bd` et `6b7e1a7`, seul un abonnement valide est exigé.
- Chantier séparé : objets d'une autre boutique qui renvoient autre chose qu'un 404 identique à celui d'un objet inexistant (règle de `CLAUDE.md`, Sécurité). `RemboursementViewSet.perform_create` renvoie 403 (« Cette vente n'appartient pas à votre boutique », `sales/views.py`). Même problème relevé ailleurs, à inventorier : `products/views.py` (403 sur produit et unité), et des serializers qui répondent 400 « n'appartient pas à votre boutique », message différent de celui d'un id inexistant (`sales`, `purchases` dont `validate_fournisseur`, `inventory`, `products`). Modèle à suivre : `AchatDeLaBoutiqueField` (`purchases/serializers.py`).
- Petit défaut (relevé en prod le 2026-10-05, sans y toucher) : dans l'Historique des ventes, le refus d'annulation s'affiche dans un `alert()` du navigateur (« iwishop.vercel.app indique », `SalesHistory.jsx:95`), alors que le reste de l'app affiche les erreurs dans la page. Pas un cas isolé : 44 appels à `alert(` dans 13 fichiers du frontend (compte par grep, non examinés un par un). Décider d'une règle avant de corriger.
- Relevés par l'analyse de l'offre unique (2026-10-05), hors de ce chantier, à décider plus tard :
  - « Pas d'abonnement = accès autorisé » (`abonnement_valide()` vrai sans `Abonnement`) est un trou potentiel : seule la boutique d'administration (id 1) est dans ce cas aujourd'hui.
  - Aucun bandeau après l'expiration : `AbonnementBanner` ne s'affiche qu'entre J-3 et J0, tant que l'abonnement est valide. Devenu le chantier en cours (voir plus haut).
  - L'assistant répond après l'expiration (aucun contrôle d'abonnement dans `AssistantView`) : coût en tokens Anthropic, seul le quota quotidien limite. Pris dans le chantier en cours (commit 2, décision 4).
  - `NotificationViewSet.marquer_lue` est une écriture non contrôlée par `_verifier_acces`.
  - Réglé le 2026-10-05 (dans l'admin, pas dans le code) : « Essai gratuit » était en `actif=True` en prod avec un prix de 3 000 (créée à 0 et `actif=False` par la migration 0006), donc en vente sur « Mon abonnement » : un client pouvait racheter 14 jours à répétition. Mahamadou l'avait activée en pensant que « Actif » voulait dire « l'essai fonctionne ». Repassée à `actif=False` par Mahamadou : l'essai reste donné à l'inscription (`ApprouverDemandeView` ne filtre pas sur `actif`, prouvé par `EssaiGratuitApprouverDemandeTests`, qui tourne avec la formule de la migration en `actif=False`) et elle n'est plus en vente (`FormuleAbonnementListView` et `CreerPaiementView` exigent `actif=True`). Le prix de 3 000 n'a plus d'effet. Ne pas la renommer.
- Chantier séparé (relevé le 2026-10-05, trou d'autorisation) : `CreerPaiementView` (`tenants/creer-paiement/`) ne vérifie pas le rôle : un employé peut lancer le paiement de l'abonnement, et l'onglet « Mon Abonnement » lui est visible. Décider qui peut payer.
- Chantier séparé : « Essai gratuit » est trouvée par son nom exact (`FormuleAbonnement.objects.get(nom='Essai gratuit')`, `ApprouverDemandeView`), ce qui est fragile : la renommer dans l'admin bloque toute nouvelle inscription. La remplacer par un identifiant stable.
- Chantier séparé : `Clients.jsx` : le corps de la carte de vente (~200 lignes dans le map) est à extraire en composant `CarteVente`, avec ses tests inchangés.
- Chantier séparé : `Clients.jsx:55` (`grouperRemboursements`) calcule le montant effectif d'un remboursement côté frontend, en flottants avec arrondi, contrairement à `CLAUDE.md` (aucun calcul de montant dans le frontend). Le faire calculer par le backend, comme `montant_effectif` dans l'historique fournisseur.
- Chantier séparé : autres calculs de montants existants dans le frontend. `Purchases.jsx` (sous-totaux et « Montant Total » du panier) et `Sales.jsx` (« Restera dû » calculé pendant la saisie d'une vente à crédit). Nuance : un total provisoire pendant la saisie est acceptable si le serveur recalcule la valeur enregistrée ; le chantier vérifiera au cas par cas.
- Test instable à surveiller (relevé le 2026-10-03) : `PurchasesAchatACredit.test.jsx`, « achat comptant : mode obligatoire sans valeur par défaut, puis envoyé sans `montant_paye` » (ajouté par le 7 bis), a dépassé le délai dans la suite complète : 5117 ms pour 5000 ms. Suite de 399 s ; machine : 0,8 Go de RAM libre sur 7,9 Go, Chrome ouvert (19 processus), CPU au repos au moment du relevé. Le même jour, seul et 10 fois de suite dans le même état : 1220 à 1852 ms (médiane 1368 ms), 10 sur 10 OK. CI verte. Cause probable (avis de Mahamadou) : la mémoire de la machine (0,8 Go libre) ; Mahamadou fermera Chrome pendant les suites complètes. À surveiller : s'il échoue à nouveau, la méthode de `Clients.test.jsx` (20 passages sous charge). Pas d'augmentation de délai sans accord. Deuxième cas le même jour : `SubmissionStates.test.jsx`, « protège la validation d'une vente pendant une requête en cours », 5035 ms pour 5000 dans la suite complète (1,9 Go de RAM libre, Chrome ouvert, 16 processus) ; seul, 5 fois : 1239 à 2377 ms, 5 sur 5 OK. Même tableau : la piste de la mémoire se renforce.
- Constat (2026-10-03) : deux tests différents dépassent 5 s dans la suite complète sur la machine de Mahamadou, alors qu'ils passent seuls. Piste à mesurer après le 8 bis : limiter le nombre de workers Vitest en local, sans toucher aux délais.
- Chantier séparé : messages et exports du backend qui affichent un montant brut (`100.00 FCFA`) au lieu du rendu de l'app. Passer par `formater_montant` (`parametres/services.py`, même rendu que `formatCurrency`) : avertissement de plafond (`sales/services/credit.py`, `avertissement_plafond_credit`), notification de dette (`notifications/services.py`), export PDF du résumé financier et des ventes détaillées (`reports/views.py`, format `:.2f`). Les exports Excel (`#,##0.00` dans `reports/views.py`) sont des formats de cellule numériques : à examiner à part.
- `date_annulation` sur Vente/Achat/Dépense, avant toute vraie clôture de caisse (voir `reports/caisse.py`).
- Export PDF/Excel du journal de caisse.
- Montants JSON en float à migrer en chaînes : tous les rapports ensemble, jamais un par un.
- `/api/health/` qui renvoie `RENDER_GIT_COMMIT`, pour vérifier quel commit tourne sur Render.
- Vérifier `create_superuser_auto` : mot de passe en variable d'environnement, commande idempotente.
- Chantier séparé (relevé le 2026-10-05) : Unités de vente et Employés n'ont aucun état « en cours » (risque de double envoi).
- Sentry.

## En attente, côté Mahamadou

- Vérifier en prod Ctrl+P et l'état vide du journal de caisse.
- Activer Secret scanning et Push protection sur GitHub.
- Changer l'ancien mot de passe PostgreSQL local.
- Vérifier que la ligne `postgresql://` est supprimée de l'historique PowerShell.
