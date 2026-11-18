#!/usr/bin/env bash
# Copia diaria del canónico + métrica para Prometheus. Ejecutar con cron/systemd timer.
# Uso: DATABASE_URL_ADMIN=postgres://... BACKUP_DIR=/srv/backups bash deploy/backup.sh
set -euo pipefail
: "${DATABASE_URL_ADMIN:?falta DATABASE_URL_ADMIN}"
: "${BACKUP_DIR:=/srv/backups}"
mkdir -p "$BACKUP_DIR"
fecha="$(date -u +%Y%m%dT%H%M%SZ)"
archivo="$BACKUP_DIR/facylf-$fecha.dump"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL_ADMIN" > "$archivo"
# Retención: 14 diarias.
find "$BACKUP_DIR" -name 'facylf-*.dump' -mtime +14 -delete
# Métrica para la alerta BackupAntiguo.
mkdir -p /var/lib/node_exporter/textfile
printf 'facylf_backup_ultimo_segundos %s\n' "$(date +%s)" > /var/lib/node_exporter/textfile/facylf_backup.prom
echo "copia: $archivo"
