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

## Contrôles après restauration

Dans un shell où `DATABASE_URL` pointe uniquement vers la base temporaire :

```powershell
python manage.py check
python manage.py showmigrations
```

Ne pas lancer `migrate`. Effectuer ensuite uniquement des comptages en lecture
des utilisateurs, boutiques, produits, ventes, achats, dépenses, et, si les
modules existent, abonnements/paiements, `OutstandingToken` et
`BlacklistedToken`.

Avec `psql` connecté uniquement à la base temporaire, vérifier aussi le nombre
de tables utilisateur, séquences, contraintes et index. Les archives custom
complètes sont censées contenir schéma et données, y compris les migrations
Django, mais seule une restauration suivie de ces contrôles le confirme.

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
