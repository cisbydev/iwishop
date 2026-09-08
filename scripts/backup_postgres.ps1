[CmdletBinding()]
param(
    [string]$PgDumpPath = 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe',
    [string]$PgRestorePath = 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe',
    [string]$BackupDirectory = (Join-Path $PSScriptRoot '..\backups')
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    throw 'DATABASE_URL est absente. Aucun backup n’a été créé.'
}

if (-not (Test-Path -LiteralPath $PgDumpPath -PathType Leaf)) {
    throw 'pg_dump.exe est introuvable. Vérifiez PgDumpPath.'
}

if (-not (Test-Path -LiteralPath $PgRestorePath -PathType Leaf)) {
    throw 'pg_restore.exe est introuvable. Vérifiez PgRestorePath.'
}

New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$archivePath = Join-Path $BackupDirectory "iwishop_postgres_$timestamp.dump"

$pgDumpArguments = @(
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    "--file=$archivePath",
    "--dbname=$env:DATABASE_URL"
)
& $PgDumpPath @pgDumpArguments
if ($LASTEXITCODE -ne 0) {
    throw 'pg_dump a échoué. L’archive doit être considérée comme non valide.'
}

if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    throw 'pg_dump n’a produit aucun fichier de sauvegarde.'
}

if ((Get-Item -LiteralPath $archivePath).Length -le 0) {
    throw 'L’archive produite est vide et n’est pas valide.'
}

& $PgRestorePath '--list' '--file=NUL' $archivePath
if ($LASTEXITCODE -ne 0) {
    throw 'pg_restore --list a échoué. L’archive doit être considérée comme non valide.'
}

Write-Output "Archive PostgreSQL vérifiée : $archivePath"
