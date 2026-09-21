#!/usr/bin/env bash
# ── Instala en el servidor las tareas periódicas de facylf (cron del usuario `david`, sin `sudo`) ───────────
#
# El servidor NO tiene Node instalado, así que las tareas corren en contenedor con `node:22-alpine` (ya
# descargada) y el cron del host sólo deja preparados dos ficheros que el monitor lee:
#
#   · `estado/canonico.txt`     → tamaño del canónico y estado de los lotes del importador
#   · `estado/contenedores.txt` → consumo de cada contenedor (por si el socket no está disponible)
#
# Se puede ejecutar más de una vez: sustituye las líneas de facylf y deja las demás del crontab en paz.
#
# Uso:  bash scripts/servidor/instalar-cron.sh [raiz]     (por defecto /srv/data/facylf)
set -euo pipefail

RAIZ="${1:-/srv/data/facylf}"
IMAGEN_NODE="node:22-alpine"

if [ ! -d "$RAIZ" ]; then
  echo "No existe $RAIZ: primero hay que clonar el repositorio." >&2
  exit 1
fi

mkdir -p "$RAIZ/estado"

# Las líneas nuevas. Ojo con las comillas: el cron las pasa a `sh -c`, así que aquí sí se pueden usar tal cual.
NUEVAS="$(cat <<EOF
# ── facylf (instalado por scripts/servidor/instalar-cron.sh) ──────────────────────────────────────────────
# El canónico y el importador, para que el monitor no necesite cliente de PostgreSQL dentro del contenedor.
* * * * * cd $RAIZ && docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc "select pg_size_pretty(pg_database_size(current_database())); select count(*) from ops.batch; select count(*) from ops.batch where estado = 'validado'; select count(*) from ops.batch where terminado_en is null;" > estado/canonico.txt 2>/dev/null
# Consumo de contenedores (red de seguridad por si el socket no se puede leer desde el contenedor).
* * * * * cd $RAIZ && docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.PIDs}}' > estado/contenedores.txt 2>/dev/null
# La flota suelta capacidad: la federación que termina su trabajo apaga su contenedor y la que vuelve lo enciende.
*/15 * * * * cd $RAIZ && docker run --rm -v $RAIZ:/app -w /app $IMAGEN_NODE node scripts/ajustar-flota.mjs --aplicar >> estado/ajustar-flota.log 2>&1
# Vigilancia periódica con las herramientas del proyecto.
0 * * * * cd $RAIZ && docker run --rm -v $RAIZ:/app -w /app $IMAGEN_NODE node scripts/vigilar-docker.mjs --cada-min 1 --duracion-min 1 >> estado/vigilancia.log 2>&1
# Copias de seguridad de lo irrecuperable (colas + canónico).
30 3 * * * cd $RAIZ && bash scripts/servidor/copias.sh >> estado/copias.log 2>&1
EOF
)"

# Se quitan las líneas anteriores de facylf (entre el rótulo y la siguiente línea en blanco o el final) y se añade el bloque nuevo.
crontab -l 2>/dev/null | sed '/# ── facylf (instalado por/,/^$/d' > /tmp/crontab-sin-facylf || true
{ cat /tmp/crontab-sin-facylf; echo "$NUEVAS"; } | crontab -
rm -f /tmp/crontab-sin-facylf

echo "cron instalado. Reglas de facylf:"
crontab -l | grep -A0 -E 'facylf|ajustar-flota|vigilar-docker|copias.sh' | sed 's/^/  /'
