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
#
# ── CON CERROJO Y CON TOPE DE TIEMPO, Y NO ES UN LUJO (medido el 23/09/2026) ─────────────────────────────
#
# `docker stats --no-stream` mira los cgroups de TODOS los contenedores y, con 20 vivos y la máquina cargada,
# tarda más de un minuto. Sin protección, cada minuto arrancaba otro sin esperar al anterior: se llegaron a ver
# **65 procesos `docker stats` a la vez**, y la carga subió a **227 sobre 4 núcleos** — con 87 hilos de
# `containerd-shim` y 73 de `docker` ejecutando, y sólo 17 de Chrome. La flota estaba SANA (las 19 federaciones
# con código 0) y aun así no podía recolectar: le faltaba procesador.
#
# Es un bucle que se alimenta solo: más carga → más tarda → más se apilan → más carga.
#
#   · `flock -n` → si ya hay una ejecución en marcha, la nueva NO se lanza (se salta ese minuto);
#   · `timeout 45` → una ejecución atascada muere antes de que llegue la siguiente.
#
# La línea de PostgreSQL de arriba no lo necesita: `docker exec psql` tarda milisegundos, no acumula.
* * * * * cd $RAIZ && flock -n /tmp/facylf-contenedores.lock timeout 45 docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.PIDs}}' > estado/contenedores.txt 2>/dev/null
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
