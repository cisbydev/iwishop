# Sauvegarde hebdomadaire chiffrée (export Render)

Solution provisoire, décidée par Mahamadou le 2026-10-23, en attendant la
sauvegarde quotidienne automatique (tâche planifiée Render, commit 4 du
chantier « sauvegarde de la base » dans `docs/EN_COURS.md`).

Principes :
- On utilise l'export de Render (page Recovery), jamais `pg_dump` : l'adresse
  secrète de la base n'est jamais nécessaire.
- Le fichier est chiffré avec `age` dès son arrivée sur le PC. Aucune copie en
  clair ne reste après la procédure.
- Ce fichier ne contient aucun secret. La clé publique ci-dessous n'en est pas
  un : elle sert seulement à chiffrer.
- La base Render n'est jamais touchée : tout se passe dans le navigateur et sur
  le PC.

Une sauvegarde n'est validée que par une restauration réussie (voir
`docs/postgresql-backup-restore.md`).

## Matériel

- `age` (v1.3.2) dans `C:\Tools\age` (`age.exe`, `age-keygen.exe`).
- Clé publique, dans `C:\Tools\age\iwishop-backup.pub` :
  `age1q9kz7w9m4lujlyf0pkl6drzjfjw2svcam0xz2t9f62h93s0l243sjjs24w`
- Clé privée : un seul exemplaire, sur la clé USB (rangée à la maison, ne sert
  à rien d'autre ; décision du 2026-10-23). Jamais sur le PC, ni dans le
  dépôt, ni dans une conversation. Elle n'est nécessaire que pour déchiffrer
  (vérification et restauration). Une clé morte est détectée par le test de
  restauration mensuel : voir « En cas de problème ».
- Outils PostgreSQL : pas dans le PATH, à appeler par leur chemin complet
  (`C:\Program Files\PostgreSQL\18\bin\psql.exe`, `pg_restore.exe`,
  `createdb.exe`, `dropdb.exe`).
- Dossier de travail : `C:\Sauvegardes\iwishop`.

## Chaque semaine

1. Render, base `iwishop-db`, page **Recovery** : **Create export**, attendre
   qu'il soit terminé, puis **Download**. Fichier `AAAA-MM-JJTHH_MMZ.dir.tar.gz`
   (Render le garde 7 jours).
2. Le déplacer (pas le copier) dans le dossier de travail :
   `Move-Item "$env:USERPROFILE\Downloads\<fichier>.dir.tar.gz" C:\Sauvegardes\iwishop\`
3. Vérifier le format, sans rien extraire : `tar -tzf <fichier>` doit lister un
   `toc.dat` et des fichiers `.dat` numérotés (format « directory » de
   `pg_dump`). Sinon, s'arrêter.
4. Chiffrer :
   `& C:\Tools\age\age.exe -R C:\Tools\age\iwishop-backup.pub -o <fichier>.age <fichier>`
5. Prouver le déchiffrement avant de supprimer quoi que ce soit : déchiffrer
   vers une copie avec la clé privée (`age.exe -d -i <clé privée> -o <copie> <fichier>.age`),
   puis comparer les empreintes `Get-FileHash` de la copie et de l'original.
   Si elles diffèrent, ne rien supprimer.
6. Supprimer l'original en clair et la copie déchiffrée.
7. Déposer le `.age` sur Google Drive, dossier `iwishop-sauvegardes`.
   (R2 `weekly/` : prévu, pas encore mis en place.)
8. Noter dans le journal ci-dessous : date, nom du fichier, taille.

## Chaque mois : test de restauration (base locale seulement)

Dans un dossier à part, supprimé à la fin (par exemple
`C:\Sauvegardes\restauration`) :

1. Déchiffrer le dernier `.age` vers `export.dir.tar.gz`.
2. Extraire : `tar -xzf export.dir.tar.gz -C dump --strip-components=2`.
   Le dossier de l'archive contient des « : » (`2026-10-23T21:11Z`),
   interdits sous Windows, et le `tar` de Windows ne connaît pas `-s`.
   `--strip-components=2` retire ce dossier : on obtient
   `dump\iwishop_db_knfa\toc.dat`.
3. Lire la structure : `pg_restore.exe --list dump\iwishop_db_knfa`
   (format DIRECTORY, version de la base source).
4. Vérifier que la base `iwishop_restore_test_AAAAMMJJ` n'existe pas
   (`psql.exe ... -tAc "SELECT count(*) FROM pg_database WHERE datname = '...'"`
   doit répondre 0), puis la créer avec `createdb.exe -h localhost -U postgres`.
5. Restaurer :
   `pg_restore.exe -h localhost -U postgres -d iwishop_restore_test_AAAAMMJJ --no-owner --no-privileges --exit-on-error dump\iwishop_db_knfa`
   Code de sortie attendu : 0. `--no-owner` et `--no-privileges` : l'utilisateur
   de la base Render n'existe pas en local.
6. Compter :
   `psql.exe -h localhost -U postgres -d iwishop_restore_test_AAAAMMJJ -tA -F ';' -f scripts\comptage_restauration.sql -o C:\Sauvegardes\iwishop\comptage_AAAAMMJJ.txt`
   Contrôles : les deux ventes témoins (`V-2F621063`, `V-AD91351B`) présentes ;
   boutiques, ventes et produits non nuls et jamais en baisse d'un mois sur
   l'autre ; nombre de boutiques égal à celui de la page d'administration.
   Limite : sans accès à la prod, les comptes ne sont pas comparés à la base
   Render au même moment.
7. Supprimer la base de test (`dropdb.exe -h localhost -U postgres -i`, nom
   relu avant de confirmer ; vérifier ensuite que le compte vaut 0), puis le
   dossier de travail et tout ce qu'il contient.

## En cas de problème

- Clé privée perdue : toutes les sauvegardes chiffrées avec elle sont
  illisibles, définitivement. Créer une nouvelle paire (`age-keygen -o` vers la
  clé USB), remplacer la clé publique ici et dans `iwishop-backup.pub`, refaire
  tout de suite une sauvegarde. Restent la prod et la restauration à un instant
  passé de Render (3 jours).
- Clé privée exposée (affichée, copiée sur le PC, envoyée) : nouvelle paire de
  clés, comme ci-dessus.

## Journal

| Date | Fichier | Taille | Restauration |
|---|---|---|---|
| 2026-10-23 | `2026-10-23T21_11Z.dir.tar.gz.age` | 118 536 o (en clair : 118 320 o) | Réussie le 2026-10-23 : code de sortie 0 ; 4 boutiques, 59 ventes, 7 produits, 5 catégories ; ventes témoins présentes ; 38 tables, 36 séquences, 126 index, 355 contraintes. |
