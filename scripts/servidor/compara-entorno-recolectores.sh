#!/usr/bin/env bash
# Compara el entorno de varios recolectores para detectar variables que se han perdido.
#
# Por qué existe: en `docker/compose.yml` los servicios usan `<<: *recolector` para heredar del ancla. Pero si
# un servicio declara su PROPIO bloque `environment:`, YAML **reemplaza el del ancla entero**, no lo fusiona.
# El 23/09/2026 eso dejó a Murcia sin `FACYLF_MEMORIA_GB` (y sin `FACYLF_CHROME_HEADLESS`): sin ese presupuesto
# la reserva de aire vuelve a 1,5 GB y el worker se queda en «esperando para abrir Chrome» para siempre, porque
# en un contenedor de 1,6 GB nunca caben 1,5 GB libres. La federación se queda SIN RECOLECTAR y el contenedor
# sigue «arriba», así que no se ve.
#
# SÓLO LEE.
#
# Uso: bash scripts/servidor/compara-entorno-recolectores.sh
set -uo pipefail

echo '════ ENTORNO DE CADA RECOLECTOR ════'
printf '  %-24s %-10s %-12s %-10s %s\n' contenedor MEMORIA_GB HEADLESS TURNO "otras"

for c in $(docker ps --filter name=facylf- --format '{{.Names}}' | grep -v -E 'importador|monitor|web|postgres' | sort); do
  entorno=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null)
  memoria=$(printf '%s' "$entorno" | sed -n 's/^FACYLF_MEMORIA_GB=//p')
  headless=$(printf '%s' "$entorno" | sed -n 's/^FACYLF_CHROME_HEADLESS=//p')
  turno=$(printf '%s' "$entorno" | sed -n 's/^FACYLF_TURNO_PLAZA_MIN=//p')
  otras=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | grep '^FACYLF_' | grep -v -E 'FACYLF_(MEMORIA_GB|CHROME_HEADLESS|TURNO_PLAZA_MIN)=' \
    | cut -d= -f1 | tr '\n' ' ')

  aviso=''
  [ -z "$memoria" ] && aviso='  ← SIN PRESUPUESTO DE MEMORIA'
  [ -z "$headless" ] && aviso="$aviso  ← SIN MODO SIN CABEZA"
  printf '  %-24s %-10s %-12s %-10s %s%s\n' "$c" "${memoria:-—}" "${headless:-—}" "${turno:-—}" "$otras" "$aviso"
done

echo
echo '  Las columnas vacías son variables PERDIDAS: el servicio declaró su propio bloque `environment:` y'
echo '  reemplazó el del ancla. Hay que repetir el ancla con la clave de fusión YAML (<<: *ambiente) o'
echo '  redeclarar las variables.'
