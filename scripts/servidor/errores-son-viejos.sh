#!/bin/bash
# ¿El ERR_MODULE_NOT_FOUND de estos cuatro es de AHORA o es historia vieja del registro?
#
# La pregunta importa: el registro guarda todo, y «la última línea que dice error» encuentra errores de antes
# del arreglo. Lo que lo resuelve es comparar la línea del error con el total de líneas del registro: si el
# error está muy atrás y después el registro siguió escribiendo, es historia.
set -u
for f in ceuta euskadi melilla rioja aragon; do
  c="facylf-${f}-1"
  log="/app/descargas-${f}/recolector-local/worker-programado.log"
  tot=$(docker exec "$c" sh -c "wc -l < $log" 2>/dev/null)
  lin=$(docker exec "$c" sh -c "grep -nE 'ERR_MODULE_NOT_FOUND' $log | tail -1 | cut -d: -f1" 2>/dev/null)
  fecha_err=$(docker exec "$c" sh -c "grep -B200 'ERR_MODULE_NOT_FOUND' $log | grep -oE '^2026-[0-9-]+ [0-9:]+' | tail -1" 2>/dev/null)
  ult=$(docker exec "$c" sh -c "tail -1 $log | cut -c1-16" 2>/dev/null)
  mod=$(docker exec "$c" sh -c 'test -f /app/scripts/lib/temporadas-asignadas.mjs && echo si || echo NO' 2>/dev/null)
  echo "  ${f}: modulos=${mod}  lineas=${tot}  error_en=${lin:-ninguno}  fecha_error=${fecha_err:-?}  ultima_linea=${ult}"
done
