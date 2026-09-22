#!/usr/bin/env bash
# ── Copia de seguridad de lo IRRECUPERABLE, cada noche ──────────────────────────────────────────────────────
#
# Lo que se salva y por qué:
#
#   · **las colas** (`descargas-*/recolector-local/cola-v2.sqlite`): son el estado del trabajo. Se copian con
#     `sqlite3 .backup`, que saca una instantánea coherente **en caliente** (los recolectores siguen trabajando).
#   · **el canónico** (PostgreSQL): con `pg_dump`.
#   · **los catálogos** (`*-por-temporada.json`): el descubrimiento hecho, que costó semanas.
#
# Lo que NO se toca nunca: los datos originales. Esto sólo LEE y escribe copias. La retención borra copias
# viejas (se regeneran cada noche), jamás datos de trabajo.
#
# Avisa por ntfy si algo falla: una copia que no se hace y nadie lo sabe no es una copia.
#
# Uso:  bash scripts/servidor/copias.sh [raiz] [destino]
set -uo pipefail

RAIZ="${1:-/srv/data/facylf}"
DESTINO="${2:-/srv/data/backups/facylf}"
RETENCION_DIAS="${RETENCION_DIAS:-7}"
NTFY="${FACYLF_NTFY:-http://127.0.0.1:8085/facylf}"
SELLO="$(date '+%F')"

avisar() {
  curl -fsS -m 10 -H "Title: $1" -H "Priority: high" -H "Tags: warning" -d "$2" "$NTFY" >/dev/null 2>&1 || true
}

mkdir -p "$DESTINO/colas" "$DESTINO/canónico"
FALLOS=0

echo "════ $(date '+%F %T') · copia de facylf ════"

# 1 · Las colas, con la instantánea coherente de SQLite.
#
# MEDIDO EL 22/09/2026: esto llevaba fallando las 19 colas TODAS las noches. Dos motivos, los dos arreglados:
#   · `sqlite3` no está instalado en el servidor (el host no tiene Node, ni pnpm, ni sqlite3);
#   · el respaldo de emergencia usaba `node:22-alpine`, donde `node:sqlite` exige `--experimental-sqlite`, así
#     que también fallaba.
# Ahora lo hace `copia-cola.mjs` con la imagen del recolector (Node 24, sin banderas), que además COMPRUEBA la
# copia abriéndola: si no abre, cuenta como fallo y avisa.
echo "── colas ──"
IMAGEN_COPIAS="${FACYLF_IMAGEN:-facylf-recolectores:local}"
for COLA in "$RAIZ"/descargas-*/recolector-local/cola-v2.sqlite; do
  [ -f "$COLA" ] || continue
  FEDERACION="$(basename "$(dirname "$(dirname "$COLA")")")"
  SALIDA="$DESTINO/colas/$FEDERACION-$SELLO.sqlite"
  # El contenedor corre con el usuario del servidor: si no, la copia quedaría de `root` y la retención (que va
  # con `find -delete` como este usuario) no podría borrar las viejas.
  if docker run --rm --user "$(id -u):$(id -g)" \
       -v "$RAIZ:/app" -v "$DESTINO:/copias" --entrypoint node "$IMAGEN_COPIAS" \
       /app/scripts/servidor/copia-cola.mjs \
       "/app/$FEDERACION/recolector-local/cola-v2.sqlite" \
       "/copias/colas/$FEDERACION-$SELLO.sqlite" 2>&1 | tail -1; then
    :
  else
    echo "  $FEDERACION: FALLO"
    FALLOS=$((FALLOS + 1))
  fi
done

# 2 · Los catálogos del descubrimiento.
echo "── catálogos ──"
for CATALOGO in "$RAIZ"/descargas-*/*-por-temporada.json; do
  [ -f "$CATALOGO" ] || continue
  cp -f "$CATALOGO" "$DESTINO/canónico/$(basename "$(dirname "$CATALOGO")")-$(basename "$CATALOGO")" || FALLOS=$((FALLOS + 1))
done
echo "  copiados"

# 3 · El canónico.
echo "── canónico ──"
if docker exec facylf-postgres pg_dump -U facylf_admin -d facylf -Fc > "$DESTINO/canónico/facylf-$SELLO.dump" 2>/dev/null; then
  echo "  $(du -h "$DESTINO/canónico/facylf-$SELLO.dump" | cut -f1)"
else
  echo "  FALLO"
  FALLOS=$((FALLOS + 1))
fi

# 4 · Retención: se borran SÓLO copias con más de N días (los datos de trabajo nunca se tocan).
find "$DESTINO" -type f -mtime "+$RETENCION_DIAS" -delete 2>/dev/null || true
echo "── retención: se conservan $RETENCION_DIAS días ──"

if [ "$FALLOS" -gt 0 ]; then
  echo "RESULTADO: $FALLOS fallo(s)"
  avisar "Copia de facylf con fallos" "La copia de seguridad de facylf terminó con $FALLOS fallo(s) el $SELLO.
Míralo en el servidor:
  tail -50 $RAIZ/estado/copias.log"
  exit 1
fi

echo "RESULTADO: copia correcta"
