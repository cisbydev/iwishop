# Sauvegarde et restauration PostgreSQL

## Portée et prérequis

Cette procédure concerne PostgreSQL uniquement. Les médias stockés dans R2 ne
font pas partie d'un dump PostgreSQL et doivent suivre leur propre stratégie.

Prérequis Windows : PostgreSQL client installé, avec `pg_dump.exe`,
`pg_restore.exe`, `psql.exe`, `createdb.exe` et `dropdb.exe`. Les scripts
acceptent un chemin explicite vers les outils ; leur chemin par défaut est
`C:\Program Files\PostgreSQL\18\bin`.

Ne placez jamais `DATABASE_URL` ou `TEMP_DATABASE_URL` dans un fichier
versionné. Définissez-les seulement dans le processus PowerShell concerné et
ne les affichez pas.

> Un fichier de sauvegarde n'est pas considéré comme validé tant qu'une
> restauration complète n'a pas réussi.

## Créer une archive

Définir `DATABASE_URL` dans un shell sécurisé, puis lancer :

```powershell
.\scripts\backup_postgres.ps1
```

Le script crée une archive custom horodatée dans `backups/`, vérifie qu'elle
est non vide et valide sa structure avec `pg_restore --list`. Il ne restaure
rien.

## Vérifier une archive existante

Utiliser `pg_restore --list` avec le même client PostgreSQL, sans fournir
d'URL de production. Une liste lisible confirme la structure de l'archive,
pas une restauration valide.

## Créer et restaurer une base temporaire

Créer manuellement une nouvelle base locale dont le nom commence par
`iwishop_restore_test_`. Avant de la créer, vérifier qu'elle n'existe pas.
Ne jamais réutiliser ni supprimer une base existante.

Définir `TEMP_DATABASE_URL` uniquement pour cette base, puis lancer :

```powershell
.\scripts\restore_postgres_temp.ps1 `
  -ArchivePath .\backups\iwishop_postgres_YYYYMMDD_HHMMSS.dump `
  -ConfirmTemporaryRestore
```

Le script refuse une cible sans préfixe temporaire, une URL manquante, une
archive absente ou vide, et une cible identique à `DATABASE_URL` sur l'hôte,
le port et la base. Il ne crée ni ne supprime de base.

## Saisir une adresse sans l'afficher

Ne jamais taper une adresse de base en clair dans la ligne de commande : elle
resterait dans l'historique de PowerShell. La saisir masquée :

```powershell
$s = Read-Host "Adresse de la base" -AsSecureString
$env:DATABASE_URL = [System.Net.NetworkCredential]::new('', $s).Password
Remove-Variable s
```

Vérifier ensuite sans l'afficher, par exemple
`([uri]$env:DATABASE_URL).Host -like '*render.com'` (doit donner `True`).

## Contrôles après restauration

`scripts/comptage_restauration.sql` compte, en lecture seule, les lignes de
chaque table, la dernière valeur de chaque séquence, le nombre de tables,
séquences, index et contraintes, et les deux ventes témoins. Une ligne par
élément, au format `cle;valeur`, sans donnée de client hormis les numéros des
deux ventes témoins.

```powershell
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$comptage = '.\scripts\comptage_restauration.sql'
```

1. Compter la source juste avant et juste après la sauvegarde. Une base en
   service peut changer pendant `pg_dump` : sans ces deux comptages égaux,
   l'archive n'a rien de fixe à quoi être comparée.

   ```powershell
   & $psql -X -q -A -t -F ';' -v ON_ERROR_STOP=1 -d $env:DATABASE_URL -f $comptage -o .\backups\comptage_source_avant.txt
   .\scripts\backup_postgres.ps1
   & $psql -X -q -A -t -F ';' -v ON_ERROR_STOP=1 -d $env:DATABASE_URL -f $comptage -o .\backups\comptage_source_apres.txt
   Compare-Object (Get-Content .\backups\comptage_source_avant.txt) (Get-Content .\backups\comptage_source_apres.txt)
   ```

   `Compare-Object` ne doit rien afficher. Sinon, refaire la sauvegarde. Les
   tables `django_cache_table`, `django_session` et `token_blacklist_*`
   changent à chaque connexion ou requête limitée, même sans activité visible.

2. Après la restauration, compter la base temporaire et comparer :

   ```powershell
   & $psql -X -q -A -t -F ';' -v ON_ERROR_STOP=1 -d $env:TEMP_DATABASE_URL -f $comptage -o .\backups\comptage_restauree.txt
   Compare-Object (Get-Content .\backups\comptage_source_apres.txt) (Get-Content .\backups\comptage_restauree.txt)
   ```

   `Compare-Object` ne doit rien afficher.

3. Faire pointer la session sur la base temporaire seulement (l'adresse de la
   source est alors remplacée), et relire l'hôte et le nom avant de continuer :

   ```powershell
   $env:DATABASE_URL = $env:TEMP_DATABASE_URL
   ([uri]$env:DATABASE_URL).Host
   ([uri]$env:DATABASE_URL).AbsolutePath
   ```

4. Contrôles Django, sans `migrate` :

   ```powershell
   $env:SENTRY_DSN = ''
   python manage.py check
   python manage.py showmigrations | Select-String '\[ \]'
   (python manage.py showmigrations | Select-String '\[X\]').Count
   ```

   `check` sans problème et aucune migration non appliquée (`[ ]`). Comparer
   le nombre de migrations appliquées à la ligne `table:django_migrations` du
   comptage (126 et 126 à l'étape B ; un écart peut venir d'une migration
   supprimée du code depuis, à examiner).

Ces contrôles comparent des nombres de lignes, pas leur contenu. Premier
passage réussi : étape B du 2026-10-14 (voir `docs/EN_COURS.md`).

## Destruction de la base temporaire

La destruction n'est jamais automatisée. Après inspection, elle doit être
faite manuellement, uniquement après confirmation indépendante de l'hôte, du
port et du nom préfixé `iwishop_restore_test_` de la cible.

## Politique à mettre en place après validation manuelle

- fréquence : au minimum quotidienne, à préciser selon le volume et le RPO ;
- rétention : plusieurs points datés, à définir selon contraintes légales ;
- stockage : emplacement externe privé et chiffré ;
- test : restauration périodique dans une nouvelle base temporaire ;
- preuve : journal daté du backup, du test de restauration et des contrôles.
