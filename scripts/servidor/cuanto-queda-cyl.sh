#!/bin/bash
# ── ¿CUÁNTO LE QUEDA A CyL? ─────────────────────────────────────────────────────────────────────────────
#
# CyL está partida entre las dos máquinas (decisión de diseño para que avance en paralelo). Esta cuenta mira
# LAS DOS colas y da el trabajo que queda, medido en trabajos y estimado en DÍAS según el ritmo real.
#
# El ritmo que se usa es el que se le pasa o el de las últimas horas, NO uno inventado: un cálculo de plazos
# con un ritmo optimista es peor que no tenerlo.
#
# SÓLO LEE.
set -u
echo "══ CyL EN EL SERVIDOR (/app/descargas-federacion) ══"
docker exec facylf-federacion-1 node /srv/ssd/facylf/scripts/cuenta-trabajo-pendiente.mjs \
  /app/descargas-federacion/recolector-local/cola-v2.sqlite "servidor" 2>&1
