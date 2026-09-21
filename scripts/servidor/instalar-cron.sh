#!/usr/bin/env bash
# ── Instala en el servidor las tareas periódicas de facylf (cron del usuario `david`, sin `sudo`) ───────────
#
# ── QUÉ PUEDE CORRER AQUÍ Y QUÉ NO (medido el 21/09/2026) ──────────────────────────────────────────────────
#
# El servidor **no tiene Node** en el host (y no se puede instalar sin DNS/apt), pero sí tiene el cliente de
# Docker y la imagen `node:22-alpine`. De ahí salen tres casos:
#
#   · lo que sólo necesita DOCKER → corre en el host directamente (leer el canónico, medir contenedores);
#   · lo que sólo necesita NODE → corre en un contenedor `node:22-alpine` con el repositorio montado;
#   · lo que necesita NODE **Y** DOCKER a la vez (`ajustar-flota.mjs`, `vigilar-docker.mjs`, que paran y
#     levantan contenedores) → **aquí no se puede** con lo que hay: haría falta una imagen con Node y el cliente
#     de Docker. Quedan documentadas abajo y se pueden lanzar desde el PC por `ssh` mientras tanto.
#
# Se puede ejecutar más de una vez: sustituye las líneas de facylf y deja las demás del crontab en paz.
#
# Uso:  bash scripts/servidor/instalar-cron.sh [raiz]     (por defecto /srv/data/facylf)
set -euo pipefail

RAIZ="${1:-/srv/data/facylf}"

if [ ! -d "$RAIZ" ]; then
  echo "No existe $RAIZ: primero hay que clonar el repositorio." >&2
  exit 1
fi

mkdir -p "$RAIZ/estado"

NUEVAS="$(cat <<EOF
# ── facylf (instalado por scripts/servidor/instalar-cron.sh) ──────────────────────────────────────────────
# El canónico y el importador, para que el monitor no necesite cliente de PostgreSQL dentro del contenedor.
* * * * * cd $RAIZ && docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc "select pg_size_pretty(pg_database_size(current_database())); select count(*) from ops.batch; select count(*) from ops.batch where estado = 'validado'; select count(*) from ops.batch where terminado_en is null;" > estado/canonico.txt 2>/dev/null
# Consumo de contenedores (red de seguridad por si el socket no se puede leer desde el contenedor del monitor).
* * * * * cd $RAIZ && docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.PIDs}}' > estado/contenedores.txt 2>/dev/null
# Copias de seguridad de lo irrecuperable (colas + canónico + catálogos).
30 3 * * * cd $RAIZ && bash scripts/servidor/copias.sh >> estado/copias.log 2>&1
# ── PENDIENTES: necesitan Node y el cliente de Docker en la misma máquina (aquí no hay Node) ─────────────
# */15 * * * * cd $RAIZ && node scripts/ajustar-flota.mjs --aplicar >> estado/ajustar-flota.log 2>&1
# 0 * * * * cd $RAIZ && node scripts/vigilar-docker.mjs --cada-min 1 --duracion-min 1 >> estado/vigilancia.log 2>&1
EOF
)"

crontab -l 2>/dev/null | sed '/# ── facylf (instalado por/,/^$/d' > /tmp/crontab-sin-facylf || true
{ cat /tmp/crontab-sin-facylf; echo "$NUEVAS"; } | crontab -
rm -f /tmp/crontab-sin-facylf

echo "cron instalado. Reglas de facylf:"
crontab -l | grep -E 'facylf|canonico|copias.sh' | sed 's/^/  /'
