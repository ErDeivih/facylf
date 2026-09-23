#!/usr/bin/env bash
# ── ¿ESTÁ EL IMPORTADOR ATASCADO EN UNA UNIDAD? ───────────────────────────────────────────────────────────
#
# El importador no recolecta, pero come de la misma máquina y **retiene la cola** de la federación que importa.
# Cuando una unidad tarda muchísimo, esa federación lo nota: se queda sin poder escribir en su propia cola y su
# ritmo se hunde sin que nada esté roto.
#
# Este guion mira lo que hace falta para distinguir «una unidad grande» de «un bucle atascado»:
#   · cuánto TIEMPO DE CPU lleva el proceso (no de reloj: de procesador, que es lo que le quita a la flota);
#   · cuánto tiempo de reloj lleva vivo;
#   · si hay consultas activas en PostgreSQL o está pensando en local, sin tocar la base;
#   · qué unidad es y cuándo se completó la anterior.
#
# SÓLO LEE.
#
# Uso: bash scripts/servidor/diagnostica-importador.sh
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}

echo '── procesos del importador (tiempo de CPU y de reloj) ──'
docker exec facylf-importador ps -eo pid,etime,time,stat,comm --sort=-time 2>/dev/null | head -8 | sed 's/^/  /'
echo

echo '── la unidad que está importando ──'
docker exec facylf-importador ps -eo etime,time,args 2>/dev/null \
  | grep -m1 -- '--federacion' | sed 's/^/  /'
echo

echo '── ¿está trabajando en PostgreSQL o sólo en local? ──'
docker exec facylf-postgres psql -U facylf_admin -d facylf -t -c \
  "select coalesce(string_agg(distinct state, ', '), 'sin consultas activas') from pg_stat_activity
   where datname = 'facylf' and pid <> pg_backend_pid()" 2>/dev/null | sed 's/^/  estados: /'
docker exec facylf-postgres psql -U facylf_admin -d facylf -t -c \
  "select count(*) from pg_stat_activity where datname='facylf' and state='active' and pid <> pg_backend_pid()" 2>/dev/null \
  | sed 's/^/  consultas activas: /'
echo

echo '── últimas unidades completadas (para comparar) ──'
grep -E 'hecho|fallo|tanda|masiva' "$RAIZ/estado/importacion.log" 2>/dev/null | tail -8 | sed 's/^/  /'
echo

echo '── ¿cuánto lleva sin escribir en el registro? ──'
if [ -f "$RAIZ/estado/importacion.log" ]; then
  modificado=$(stat -c %Y "$RAIZ/estado/importacion.log")
  ahora=$(date +%s)
  echo "  el registro no se toca desde hace $(( (ahora - modificado) / 60 )) min"
fi
