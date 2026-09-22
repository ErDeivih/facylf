#!/usr/bin/env bash
# Cuánto ocupa cada federación en el servidor y cuánto le falta por llegar (comparado con el PC, que es lo que
# dice el responsable). Sirve para seguir la copia del archivo de evidencia sin abrir nada más.
# Uso: bash /tmp/tamano-federaciones.sh
set -uo pipefail
RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
FEDERACIONES=(andalucia aragon asturias baleares canarias cantabria castilla-la-mancha cataluna ceuta euskadi \
  extremadura federacion galicia madrid melilla murcia navarra rioja valencia)

printf '%-22s %10s %10s\n' federación cola archivo
for f in "${FEDERACIONES[@]}"; do
  cola=$(du -sh "$RAIZ/descargas-$f/recolector-local/cola-v2.sqlite" 2>/dev/null | cut -f1)
  archivo=$(du -sh --exclude=perfil-chrome --exclude='*.sqlite*' "$RAIZ/descargas-$f" 2>/dev/null | cut -f1)
  printf '%-22s %10s %10s\n' "$f" "${cola:-—}" "${archivo:-—}"
done
echo
echo "total de descargas-* en el servidor: $(du -sh "$RAIZ" --exclude=descargas-* 2>/dev/null | cut -f1) (sin contar descargas)"
echo "espacio libre: $(df -h "$RAIZ" | awk 'NR == 2 { print $4 " de " $2 }')"
