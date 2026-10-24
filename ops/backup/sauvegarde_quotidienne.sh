#!/usr/bin/env bash
# Sauvegarde quotidienne de la base de prod (tâche planifiée Render, 03:00 UTC).
#
# pg_dump dans un dossier temporaire, contrôle par pg_restore --list,
# chiffrement age (clé publique seulement), envoi dans R2 sous daily/,
# taille de l'objet vérifiée dans R2, signal à Healthchecks.io.
# La moindre étape ratée arrête le script avec un code non nul et envoie
# le signal d'échec. Aucune valeur de variable n'est jamais affichée.
# La suppression des anciennes archives est faite par les règles de cycle
# de vie du bucket, jamais ici.
#
# Variables (saisies dans la tâche Render, jamais dans le dépôt) :
#   DATABASE_URL, R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY,
#   R2_BACKUP_ENDPOINT, R2_BACKUP_BUCKET, HEALTHCHECKS_PING_URL.
set -euo pipefail
umask 077

# Clé publique age créée le 2026-10-23. La clé privée n'est jamais ici :
# elle sert seulement à déchiffrer, hors de Render.
AGE_RECIPIENT="age1q9kz7w9m4lujlyf0pkl6drzjfjw2svcam0xz2t9f62h93s0l243sjjs24w"

VARIABLES_REQUISES=(
    DATABASE_URL
    R2_BACKUP_ACCESS_KEY_ID
    R2_BACKUP_SECRET_ACCESS_KEY
    R2_BACKUP_ENDPOINT
    R2_BACKUP_BUCKET
    HEALTHCHECKS_PING_URL
)

journal() {
    printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# $1 : "start", "fail" ou vide (réussite) ; $2 : message joint (optionnel).
# Un signal non envoyé ne fait jamais échouer la sauvegarde : sans signal
# de réussite, l'alarme « aucune nouvelle » de Healthchecks.io se déclenche.
signal() {
    local url="${HEALTHCHECKS_PING_URL}${1:+/$1}"
    curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "${2:-}" "$url" \
        || journal "Avertissement : signal Healthchecks.io non envoyé (${1:-réussite})."
}

echouer() {
    trap - ERR
    journal "ÉCHEC : $1"
    signal fail "$1"
    exit 1
}

manquantes=()
for nom in "${VARIABLES_REQUISES[@]}"; do
    if [[ -z "${!nom:-}" ]]; then
        manquantes+=("$nom")
    fi
done
if (( ${#manquantes[@]} > 0 )); then
    journal "ÉCHEC : variables absentes : ${manquantes[*]}"
    if [[ -n "${HEALTHCHECKS_PING_URL:-}" ]]; then
        signal fail "variables absentes : ${manquantes[*]}"
    fi
    exit 1
fi

trap 'echouer "commande en erreur à la ligne $LINENO (code $?)"' ERR

DOSSIER_TRAVAIL="$(mktemp -d)"
trap 'rm -rf -- "$DOSSIER_TRAVAIL"' EXIT

signal start

[[ "$AGE_RECIPIENT" == age1* ]] || echouer "clé publique age invalide"

NOM="$(date -u +%Y-%m-%dT%H%MZ).dump.age"
ARCHIVE="$DOSSIER_TRAVAIL/sauvegarde.dump"
ARCHIVE_AGE="$DOSSIER_TRAVAIL/$NOM"
DESTINATION="r2:${R2_BACKUP_BUCKET}/daily/${NOM}"

journal "Début de la sauvegarde $NOM."

pg_dump --format=custom --no-password --file="$ARCHIVE" --dbname="$DATABASE_URL"
[[ -s "$ARCHIVE" ]] || echouer "archive vide"
pg_restore --list "$ARCHIVE" > /dev/null
journal "Archive lisible ($(stat -c %s "$ARCHIVE") octets)."

age --encrypt --recipient "$AGE_RECIPIENT" --output "$ARCHIVE_AGE" "$ARCHIVE"
rm -f -- "$ARCHIVE"
[[ -s "$ARCHIVE_AGE" ]] || echouer "archive chiffrée vide"
TAILLE="$(stat -c %s "$ARCHIVE_AGE")"
EMPREINTE="$(sha256sum "$ARCHIVE_AGE" | cut -d ' ' -f 1)"
journal "Archive chiffrée : $TAILLE octets, SHA-256 $EMPREINTE."

# Configuration de rclone par variables, sans fichier. no_check_bucket :
# le jeton n'a de droits que sur les objets, pas sur le bucket. no_head :
# R2 répond 501 au HEAD ?versionId= que rclone 1.60 fait après l'envoi ;
# la taille est vérifiée plus bas par rclone lsf. Pas d'ACL : R2 ne les
# utilise pas (bucket privé) et l'en-tête X-Amz-Acl peut valoir un 501.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$R2_BACKUP_ENDPOINT"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_R2_NO_HEAD=true

rclone copyto "$ARCHIVE_AGE" "$DESTINATION"
TAILLE_R2="$(rclone lsf --format s "$DESTINATION")"
[[ "$TAILLE_R2" == "$TAILLE" ]] \
    || echouer "taille dans R2 différente (${TAILLE_R2:-absente} au lieu de $TAILLE)"

journal "Sauvegarde réussie : daily/$NOM, $TAILLE octets, SHA-256 $EMPREINTE."
signal "" "daily/$NOM $TAILLE octets SHA-256 $EMPREINTE"
