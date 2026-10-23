#!/usr/bin/env bash
# para-build-web.sh — suelta la compilación de la web en el SERVIDOR para devolver la CPU a la recolección
#
# ── POR QUÉ ─────────────────────────────────────────────────────────────────────────────────────────────
#
# Medido el 24/09/2026: `next build` en el servidor consumía **0,5 s de CPU por cada 60 s** (0,8 % de un núcleo),
# porque compite con dieciséis recolectores y sus Chromium por CUATRO núcleos. A ese paso tardaría muchísimas
# horas. La compilación se ha movido al PC, que tiene doce núcleos y tres recolectores ligeros, y desde aquí se
# traerá la imagen ya construida.
#
# Con el build parado, esos pocos por cientos de CPU vuelven a la recolección, que es lo que el responsable quiere
# que esté funcionando.
#
# ── LA REGLA DEL TRASPASO QUE SE RESPETA AQUÍ ────────────────────────────────────────────────────────────
#
# El patrón de búsqueda va DENTRO del fichero, nunca en la línea de órdenes de `ssh`: escrito ahí, el patrón
# aparecería en la propia línea de `pkill` y el comando se mataría a sí mismo (y cortaría la sesión). Por eso esto
# es un guion y no una orden suelta.
#
# SÓLO mata procesos de COMPILACIÓN. No toca ningún recolector ni ningún contenedor de la flota.
set -uo pipefail
export LC_ALL=C

echo "── compilación de la web antes ──"
pgrep -af 'next build' | sed 's/^/  /' || echo '  ninguna'

# 1. El cliente de docker que compila.
pkill -f 'docker build -f apps/web/Dockerfile' 2>/dev/null && echo '  cliente de build parado' || echo '  no había cliente'
# 2. El proceso de Next dentro del contenedor de compilación (es el que consume CPU de verdad).
pkill -f 'next/dist/bin/next build' 2>/dev/null && echo '  proceso de Next parado' || echo '  no había proceso de Next'
# 3. Y el lanzador de pnpm dentro del contenedor.
pkill -f "pnpm --filter '@facylf/web...' build" 2>/dev/null && echo '  pnpm del build parado' || echo '  no había pnpm'

sleep 3
echo
echo "── compilación de la web después ──"
pgrep -af 'next build' | sed 's/^/  /' || echo '  ninguna (correcto)'
echo
echo "── los recolectores siguen en pie ──"
docker ps --format '{{.Names}}' 2>/dev/null | grep -c '^facylf-' | sed 's/^/  contenedores facylf en marcha: /'
echo "  carga: $(cut -d' ' -f1-3 /proc/loadavg)"
