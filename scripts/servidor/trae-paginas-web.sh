#!/usr/bin/env bash
# Trae las páginas de la plataforma para poder comprobarlas de verdad (no «da 200»: qué pone dentro).
#
# El diagnóstico del traspaso era que la portada, /federaciones y /competiciones leían el repositorio local
# SQLite —que dentro de la imagen de la web no existe— y por eso salían a cero. Que una página devuelva 200 no
# dice nada: el síntoma era precisamente un 200 con ceros bonitos. Aquí se guardan los HTML para mirarlos.
#
# SÓLO LEE. No modifica nada.
#
# Uso: bash scripts/servidor/trae-paginas-web.sh [carpeta_destino]
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
DESTINO=${1:-/tmp/paginas-web}
BIND=$(grep -E '^FACYLF_WEB_BIND=' "$RAIZ/docker/.env" 2>/dev/null | cut -d= -f2)
BIND=${BIND:-127.0.0.1:3100}

mkdir -p "$DESTINO"
echo "plataforma en http://$BIND → $DESTINO"
echo

for ruta in "/" "/federaciones" "/competiciones" "/canonico"; do
  # El nombre del fichero sale de la ruta: «/» → «portada».
  nombre=$(printf '%s' "$ruta" | sed 's|^/$|portada|; s|^/||; s|/|_|g')
  fichero="$DESTINO/$nombre.html"
  codigo=$(curl -s -o "$fichero" -w '%{http_code}' --max-time 30 "http://$BIND$ruta" 2>/dev/null)
  bytes=$(stat -c %s "$fichero" 2>/dev/null || echo 0)
  printf '  %-16s HTTP %s · %s bytes\n' "$ruta" "${codigo:-000}" "$bytes"

  # Señales de que la página está diciendo la verdad, y de que no:
  if grep -qi 'no se puede leer el canónico\|sin canónico\|no disponible' "$fichero" 2>/dev/null; then
    echo '      ← dice que NO puede leer el canónico'
  fi
  # Los ceros del síntoma: «0 partidos», «0 grupos»… Si aparecen muchos, sigue el problema.
  ceros=$(grep -o -i '>\s*0\s*<' "$fichero" 2>/dev/null | wc -l)
  echo "      celdas con cero exacto: $ceros"
done

echo
echo '── comprobación de que hay datos de verdad ──'
for f in "$DESTINO"/*.html; do
  [ -f "$f" ] || continue
  # Los números grandes (con separador de miles) son la huella de que hay recuentos reales.
  grandes=$(grep -o -E '[0-9]{1,3}(\.[0-9]{3})+' "$f" 2>/dev/null | sort -u | head -4 | tr '\n' ' ')
  nombre=$(basename "$f")
  echo "  $nombre → números con separador de miles: ${grandes:-(ninguno)}"
done
