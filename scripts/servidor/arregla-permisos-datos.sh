#!/usr/bin/env bash
# ── ARREGLA EL DUEÑO DE LAS CARPETAS DE DATOS DEL SERVIDOR ──────────────────────────────────────────────
#
# El problema que resuelve, medido el 21/09/2026:
#
#   Los recolectores corren como **root** dentro de su contenedor (el compose no declara `user:`), así que las
#   carpetas que crean ellos —`descargas-<fed>/recolector-local` y todo lo que cuelga— quedan de `root`. El
#   usuario que despliega (`david`) puede LEERLAS (modo 644), pero no escribir en ellas. Síntoma: la copia de
#   traspaso desde el PC falla al enviar la instantánea de la cola con
#
#       scp: dest open "/srv/data/facylf/descargas-galicia/recolector-local/cola-v2.sqlite": Permission denied
#
#   y, de paso, el `tar` de la pasada de estado falla al extraer en el servidor.
#
#   No hace falta `sudo`: se hace el `chown` desde un contenedor efímero que SÍ es root y tiene la carpeta
#   montada. Para los contenedores en marcha no cambia nada: root escribe igual con o sin el permiso.
#
# Uso:
#   bash scripts/servidor/arregla-permisos-datos.sh --comprobar   # sólo informa
#   bash scripts/servidor/arregla-permisos-datos.sh               # arregla todo lo que haga falta
#   bash scripts/servidor/arregla-permisos-datos.sh galicia murcia
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
DUENO=${FACYLF_DUENO:-$(id -u):$(id -g)}
IMAGEN=${FACYLF_IMAGEN_LIGERA:-alpine}
COMPROBAR=0
if [ "${1:-}" = "--comprobar" ]; then COMPROBAR=1; shift; fi

if [ "$#" -gt 0 ]; then
  CARPETAS=()
  for f in "$@"; do CARPETAS+=("$RAIZ/descargas-$f"); done
else
  CARPETAS=()
  for d in "$RAIZ"/descargas-*; do [ -d "$d" ] && CARPETAS+=("$d"); done
fi

echo "dueño de destino: $DUENO   ·   raíz: $RAIZ   ·   carpetas: ${#CARPETAS[@]}"
if [ "$COMPROBAR" = "1" ]; then
  echo "── modo comprobación: no se cambia nada ──"
  for c in "${CARPETAS[@]}"; do
    ruta="$c/recolector-local"
    [ -d "$ruta" ] || continue
    dueno_actual=$(stat -c '%U:%G' "$ruta")
    if [ "$dueno_actual" = "$(id -un):$(id -gn)" ]; then estado="ok"
    else estado="HAY QUE ARREGLAR"; fi
    printf '  %-22s %-16s %s\n' "$(basename "$c")" "$dueno_actual" "$estado"
  done
  exit 0
fi

# El chown va dentro de un contenedor: es la única vía sin `sudo`. Se pasa la lista de rutas por un fichero
# para no pelearse con las comillas del shell de fuera.
for c in "${CARPETAS[@]}"; do
  [ -d "$c" ] || continue
  # Sólo se toca lo que NO es del dueño ya: así el segundo arranque es instantáneo aunque haya 35 GB.
  pendientes=$(find "$c" ! -user "${DUENO%%:*}" 2>/dev/null | head -1)
  if [ -z "$pendientes" ]; then
    printf '  %-22s ya estaba bien\n' "$(basename "$c")"
    continue
  fi
  montaje="/datos/$(basename "$c")"
  salida=$(docker run --rm -v "$RAIZ:/datos" "$IMAGEN" chown -R "$DUENO" "$montaje" 2>&1)
  if [ $? -eq 0 ]; then
    printf '  %-22s arreglado (%s)\n' "$(basename "$c")" "$(stat -c '%U:%G' "$c")"
  else
    printf '  %-22s FALLO: %s\n' "$(basename "$c")" "$salida"
  fi
done

echo
echo "── comprobación final ──"
quedan=0
for c in "${CARPETAS[@]}"; do
  [ -d "$c" ] || continue
  ajenos=$(find "$c" ! -user "${DUENO%%:*}" 2>/dev/null | wc -l)
  if [ "$ajenos" -gt 0 ]; then
    printf '  %-22s quedan %s ficheros de otro dueño\n' "$(basename "$c")" "$ajenos"
    quedan=$((quedan + 1))
  fi
done
[ "$quedan" = "0" ] && echo "  todo es de $DUENO: la copia desde el PC ya puede escribir" \
  || echo "  aviso: $quedan carpeta(s) siguen con ficheros ajenos"
