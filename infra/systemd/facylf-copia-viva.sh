#!/usr/bin/env bash
# Copia de la base VIVA (facylf): la que tiene todos los datos ingestados y la que sirve la web.
# Comprime, verifica que el volcado se puede leer y deja su sha256. Guarda los 7 ultimos.
set -u
BASE=/srv/data/facylf/backups-viva
LOG=$BASE/copia.log
mkdir -p "$BASE"
ahora=$(date +%Y-%m-%d-%H%M)
F="$BASE/facylf-$ahora.dump"
docker exec facylf-postgres pg_dump -U facylf_admin -Fc -Z 6 facylf > "$F" 2>>"$LOG" || { echo "$ahora FALLO el pg_dump" >> "$LOG"; rm -f "$F"; exit 1; }
# Verificacion: se copia el volcado dentro del contenedor y se lista su indice. Antes se intentaba con
# /dev/stdin y no funcionaba: daba el volcado por malo y lo borraba (18/11/2026, un volcado bueno perdido).
docker cp "$F" facylf-postgres:/tmp/verifica.dump >/dev/null 2>&1
if docker exec facylf-postgres pg_restore -l /tmp/verifica.dump 2>/dev/null | grep -qE "TABLE core (match|appearance)"; then
  docker exec facylf-postgres rm -f /tmp/verifica.dump >/dev/null 2>&1
  sha256sum "$F" > "$F.sha256"
  echo "$ahora OK $(du -h "$F" | cut -f1)" >> "$LOG"
else
  docker exec facylf-postgres rm -f /tmp/verifica.dump >/dev/null 2>&1
  echo "$ahora FALLO la verificacion (el indice no declara las tablas de core)" >> "$LOG"
  rm -f "$F"
  exit 1
fi
ls -1t "$BASE"/facylf-*.dump 2>/dev/null | tail -n +8 | while read -r f; do rm -f "$f" "$f.sha256"; done
