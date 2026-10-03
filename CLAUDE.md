# CLAUDE.md

Règles permanentes du projet iWiShop (nom interne des dossiers : sorashop) : backend Django à la racine, frontend React dans `sorashop-frontend/`.
L'état du travail en cours est dans `docs/EN_COURS.md`, pas ici.

## Discipline

- Ordre : plan, puis diff, puis « oui, commit », puis « oui, push ». Chaque étape attend un accord explicite.
- Toujours montrer le diff avant de commiter, même si un message semble autoriser plus.
- Début de session : lire `docs/EN_COURS.md`. Fin d'étape : le mettre à jour.

## Vérifications locales (les mêmes que la CI)

- Frontend (`sorashop-frontend/`) : `npm run lint`, `npm test`, `npm run build`.
  Sur cette machine, Vitest se lance sous PowerShell (pas sous Bash).
- Backend (racine) : `python manage.py check`, `python manage.py makemigrations --check --dry-run`, `python manage.py test`.

## Multi-boutique

- Toute donnée est filtrée par boutique.
- Tester l'isolation entre boutiques et la vue support.

## Argent

- Mouvements append-only : on ne modifie ni ne supprime, on corrige par un mouvement chaîné à l'original.
- `montant_du` et le statut de paiement sont recalculés, jamais saisis.
- `select_for_update` sur les écritures concurrentes.
- Les clés étrangères Django sont vérifiées au commit : pour protéger une ligne liée pendant une écriture, il faut la verrouiller explicitement.

## Migrations

- Par défaut additives (champs nullables, sans réécriture). Toute migration qui modifie ou supprime des données existantes doit être discutée avant.
- La base doit accepter l'ancien et le nouveau code pendant un déploiement : sur Render, `build.sh` lance `migrate` pendant que l'ancien code sert encore les requêtes.
- Donc un NOT NULL, une suppression ou un renommage se fait en deux temps (expand / contract), dans deux déploiements séparés : d'abord l'ajout nullable et le code qui remplit ; puis, une fois ce code en ligne, la contrainte, avec un nouveau backfill des lignes restées vides.
- Un `default=` Django n'est pas un défaut de base de données : il est appliqué par Python, et l'ancien code n'envoie pas la colonne. Une colonne NOT NULL ajoutée prend un `db_default=` (en plus de `default=`).
- Le test de compatibilité imite l'ancien code pour de vrai : un INSERT en SQL brut avec seulement les anciennes colonnes, vu échouer sans le correctif.

## Frontend

- Aucun calcul de montant : afficher les valeurs renvoyées par l'API.
- Supporter un champ absent (Render et Vercel se déploient de façon décalée).

## Commits

- Un commit = une seule raison de changer. Le style (formatage) va dans un commit séparé, vérifié avec `git show -w`.
- Le message dit ce qui est prouvé, pas ce qu'on espère.

## Tests

- Pour savoir s'il s'est passé quelque chose, compter les lignes, pas additionner les montants.
- Test instable : mesurer la marge par rapport au délai, sous charge, en notant l'état de la machine. Ne pas augmenter un délai sans accord.

## Sécurité (dépôt public)

- Ne jamais contourner le hook de secrets (`scripts/git-hooks/pre-commit`) sans accord.
- Exceptions du hook limitées aux valeurs exactes.
- Aucun secret dans ce fichier.
- Un objet d'une autre boutique renvoie 404, jamais 403 : même code et même message qu'un objet inexistant, sinon la réponse révèle qu'il existe ailleurs.
