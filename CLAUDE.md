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
- Migrations : par défaut additives (champs nullables, sans réécriture). Toute migration qui modifie ou supprime des données existantes doit être discutée avant.

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
