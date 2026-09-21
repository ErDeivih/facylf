#!/usr/bin/env bash
# ── Estado del despliegue de facylf en el servidor, de un vistazo ───────────────────────────────────────────
#
# Reúne lo que hay que mirar para saber por dónde va: el DNS (que es lo que bloquea las descargas), el tope de
# memoria, la copia de datos, los contenedores y el espacio. Sólo LEE: no cambia nada.
#
# Uso:  bash scripts/servidor/estado.sh [raiz]
set -uo pipefail

RAIZ="${1:-/srv/data/facylf}"

echo "════════════════════════════════════════════════════════"
echo " facylf en el servidor · $(date '+%F %T')"
echo "════════════════════════════════════════════════════════"

echo "── DNS ──"
if getent hosts github.com >/dev/null 2>&1; then
  echo "  resuelve (github.com: $(getent hosts github.com | head -1 | awk '{print $1}'))"
else
  echo "  SIN DNS: no se puede clonar, ni hacer docker pull, ni el autodeploy"
fi
echo "  resolv.conf: $(grep -c nameserver /etc/resolv.conf) servidores → $(grep nameserver /etc/resolv.conf | awk '{print $2}' | tr '\n' ' ')"

echo "── tope de memoria del proyecto ──"
echo "  facylf.slice MemoryMax: $(systemctl show facylf.slice -p MemoryMax --value 2>/dev/null)"
echo "  facylf.slice MemorySwap: $(systemctl show facylf.slice -p MemorySwapMax --value 2>/dev/null)"
if [ -f /etc/systemd/system/facylf.slice.d/limite.conf ]; then echo "  limite instalado: sí"; else echo "  limite instalado: NO"; fi

echo "── repositorio ──"
if [ -d "$RAIZ/.git" ]; then
  echo "  $RAIZ · commit $(git -C "$RAIZ" rev-parse --short HEAD) · $(git -C "$RAIZ" ls-files | wc -l) ficheros"
  echo "  remoto: $(git -C "$RAIZ" remote get-url origin)"
else
  echo "  no hay repositorio en $RAIZ"
fi

echo "── copia de datos ──"
echo "  tamaño copiado: $(du -sh "$RAIZ" 2>/dev/null | cut -f1)"
FEDERACIONES=$(ls -1d "$RAIZ"/descargas-* 2>/dev/null | wc -l)
COPIADAS=$(ls -1 "$RAIZ"/.copiado-* 2>/dev/null | wc -l)
echo "  federaciones presentes: $FEDERACIONES · marcadas como copiadas: $COPIADAS"
for f in "$RAIZ"/.copiado-*; do [ -f "$f" ] && echo "    $(basename "$f" | sed 's/^\.copiado-//')"; done
echo "  disco: $(df -h / | tail -1 | awk '{print $4 " libres (" $5 " usado)"}')"

echo "── contenedores de facylf ──"
NUESTROS=$(docker ps -a --filter "name=facylf" --format '{{.Names}} | {{.Status}}' 2>/dev/null)
if [ -n "$NUESTROS" ]; then echo "$NUESTROS" | sed 's/^/  /'; else echo "  ninguno todavía"; fi

echo "── memoria del servidor ──"
free -m | awk 'NR==2 {printf "  RAM: %s MB usados de %s MB (%s MB disponibles)\n", $3, $2, $7}'
echo "  carga: $(cut -d' ' -f1-3 /proc/loadavg)"
