[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$ArchivePath,

    [Parameter(Mandatory)]
    [switch]$ConfirmTemporaryRestore,

    [string]$PgRestorePath = 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe'
)

$ErrorActionPreference = 'Stop'

function Get-PostgresTarget {
    param(
        [Parameter(Mandatory)]
        [string]$ConnectionUrl,
        [Parameter(Mandatory)]
        [string]$VariableName
    )

    try {
        $uri = [System.Uri]$ConnectionUrl
    }
    catch {
        throw "$VariableName n’est pas une URL PostgreSQL valide."
    }

    if ($uri.Scheme -notin @('postgres', 'postgresql')) {
        throw "$VariableName doit utiliser le schéma postgres:// ou postgresql://."
    }

    $databaseName = [System.Uri]::UnescapeDataString($uri.AbsolutePath.Trim('/'))
    if ([string]::IsNullOrWhiteSpace($uri.Host) -or [string]::IsNullOrWhiteSpace($databaseName)) {
        throw "$VariableName doit contenir un hôte et un nom de base."
    }

    [PSCustomObject]@{
        Host = $uri.Host.ToLowerInvariant()
        Port = if ($uri.IsDefaultPort) { 5432 } else { $uri.Port }
        Database = $databaseName
    }
}

if ([string]::IsNullOrWhiteSpace($env:TEMP_DATABASE_URL)) {
    throw 'TEMP_DATABASE_URL est absente. Aucune restauration n’a été effectuée.'
}

if (-not $ConfirmTemporaryRestore.IsPresent) {
    throw 'La confirmation -ConfirmTemporaryRestore est obligatoire.'
}

if (-not (Test-Path -LiteralPath $PgRestorePath -PathType Leaf)) {
    throw 'pg_restore.exe est introuvable. Vérifiez PgRestorePath.'
}

if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
    throw 'L’archive indiquée est introuvable. Aucune restauration n’a été effectuée.'
}

if ((Get-Item -LiteralPath $ArchivePath).Length -le 0) {
    throw 'L’archive indiquée est vide. Aucune restauration n’a été effectuée.'
}

$temporaryTarget = Get-PostgresTarget -ConnectionUrl $env:TEMP_DATABASE_URL -VariableName 'TEMP_DATABASE_URL'
if (-not $temporaryTarget.Database.StartsWith('iwishop_restore_test_', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'La base cible doit commencer par iwishop_restore_test_. Aucune restauration n’a été effectuée.'
}

if (-not [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    $productionTarget = Get-PostgresTarget -ConnectionUrl $env:DATABASE_URL -VariableName 'DATABASE_URL'
    if (
        $temporaryTarget.Host -eq $productionTarget.Host -and
        $temporaryTarget.Port -eq $productionTarget.Port -and
        $temporaryTarget.Database -eq $productionTarget.Database
    ) {
        throw 'La cible correspond à DATABASE_URL. Aucune restauration n’a été effectuée.'
    }
}

& $PgRestorePath '--list' '--file=NUL' $ArchivePath
if ($LASTEXITCODE -ne 0) {
    throw 'pg_restore --list a échoué. Aucune restauration n’a été effectuée.'
}

$pgRestoreArguments = @(
    '--exit-on-error',
    '--no-owner',
    '--no-privileges',
    "--dbname=$env:TEMP_DATABASE_URL",
    $ArchivePath
)
& $PgRestorePath @pgRestoreArguments
if ($LASTEXITCODE -ne 0) {
    throw 'pg_restore a échoué. Vérifiez la base temporaire avant toute autre action.'
}

Write-Output 'Restauration terminée dans la base temporaire confirmée.'
