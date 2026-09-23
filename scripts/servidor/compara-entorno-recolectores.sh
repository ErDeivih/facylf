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
printf '  %-26s %-8s %-8s %-6s %-10s %s\n' contenedor MEMORIA HEADLES TURNO SINCRONO "CACHE_MB otras"

for c in $(docker ps --filter name=facylf- --format '{{.Names}}' | grep -v -E 'importador|monitor|web|postgres' | sort); do
  entorno=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null)
  memoria=$(printf '%s' "$entorno" | sed -n 's/^FACYLF_MEMORIA_GB=//p')
  headless=$(printf '%s' "$entorno" | sed -n 's/^FACYLF_CHROME_HEADLESS=//p')
  turno=$(printf '%s' "$entorno" | sed -n 's/^FACYLF_TURNO_PLAZA_MIN=//p')
  sincrono=$(printf '%s' "$entorno" | sed -n 's/^FACYLF_SINCRONO=//p')
  cache=$(printf '%s' "$entorno" | sed -n 's/^FACYLF_CACHE_MB=//p')
  otras=$(printf '%s' "$entorno" \
    | grep '^FACYLF_' \
    | grep -v -E 'FACYLF_(MEMORIA_GB|CHROME_HEADLESS|TURNO_PLAZA_MIN|SINCRONO|CACHE_MB)=' \
    | cut -d= -f1 | tr '\n' ' ')

  aviso=''
  [ -z "$memoria" ] && aviso='  ← SIN PRESUPUESTO DE MEMORIA'
  [ -z "$headless" ] && aviso="$aviso  ← SIN MODO SIN CABEZA"
  printf '  %-26s %-8s %-8s %-6s %-10s %-8s %s%s\n' "$c" "${memoria:-—}" "${headless:-—}" \
    "${turno:-—}" "${sincrono:-FULL}" "${cache:-—}" "$otras" "$aviso"
done

echo
echo '  SINCRONO «FULL» es el valor por defecto de SQLite (sincroniza en cada confirmación); «NORMAL» es el'
echo '  ajuste probado el 23/09/2026 para toda la flota. CACHE_MB vacío significa que se deja la caché que trae'
echo '  SQLite (2 MB), que en colas de 400-500 MB es el 0,5 %: casi todo va al disco.'
echo
echo '  Las columnas vacías de MEMORIA o HEADLESS son variables PERDIDAS: el servicio declaró su propio bloque'
echo '  `environment:` y reemplazó el del ancla. Hay que repetir el ancla con la clave de fusión YAML.'
echo '  Hay una herramienta para comprobarlo: este mismo guion.'
