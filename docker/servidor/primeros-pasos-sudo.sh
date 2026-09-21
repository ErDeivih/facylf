#!/usr/bin/env bash
# ── Primeros pasos del servidor que necesitan `sudo` ────────────────────────────────────────────────────────
#
# Son dos cosas, y las dos se hacen UNA vez:
#
#   1. ARREGLAR EL DNS. El servidor tiene en /etc/resolv.conf los resolutores de Tailscale (100.100.1.1 y
#      100.90.1.1) pero Tailscale tiene el DNS DESACTIVADO en esa máquina (`tailscale dns status` →
#      "Tailscale DNS: disabled"), así que no resuelve nada: ni `apt`, ni `docker pull`, ni el `git fetch` del
#      autodeploy de RadioPV (que lleva fallando desde el reinicio de las 14:24 del 21/09/2026). Los que sí
#      responden, medidos: el router de casa (192.168.1.1), 1.1.1.1 y 8.8.8.8.
#
#   2. INSTALAR EL TOPE DE 10 GB del proyecto (`facylf.slice`), que es el techo duro de memoria para todo
#      facylf: los 19 recolectores, PostgreSQL, el importador y la web.
#
# Se puede ejecutar más de una vez sin problema (todo es idempotente). **Ojo**: al recargar la conexión de red
# la sesión SSH puede parpadear un segundo (Tailscale reconecta), así que conviene lanzarlo desacoplado:
#
#   ssh david@servidor.local 'sudo nohup bash /tmp/primeros-pasos-sudo.sh > /tmp/primeros-pasos.log 2>&1 &'
#   ssh david@servidor.local 'cat /tmp/primeros-pasos.log'
#
set -uo pipefail

RAIZ_FACYLF="${RAIZ_FACYLF:-/srv/data/facylf}"

echo "════════════════ 1 · DNS ════════════════"
echo "antes:"
getent hosts github.com >/dev/null 2>&1 && echo "  github.com ya resuelve" || echo "  github.com NO resuelve"

# Se apunta cada conexión activa a resolutores que existen de verdad. `ignore-auto-dns` evita que el DHCP
# vuelva a poner los de Tailscale (que están desactivados como servidor).
for CONEXION in $(nmcli -t -f NAME,DEVICE connection show --active | cut -d: -f1); do
  echo "  configurando la conexión: $CONEXION"
  nmcli connection modify "$CONEXION" ipv4.dns "192.168.1.1,1.1.1.1" ipv4.ignore-auto-dns yes || true
  nmcli connection up "$CONEXION" || true
done

sleep 3
echo "después:"
if getent hosts github.com >/dev/null 2>&1; then
  echo "  github.com resuelve: $(getent hosts github.com | head -1)"
  DNS_OK=1
else
  echo "  SIGUE SIN RESOLVER — prueba: sudo tailscale set --accept-dns=true"
  DNS_OK=0
fi

echo
echo "════════════════ 2 · Tope de 10 GB (facylf.slice) ════════════════"
if [ -f "$RAIZ_FACYLF/docker/servidor/facylf-slice.conf" ]; then
  mkdir -p /etc/systemd/system/facylf.slice.d
  cp "$RAIZ_FACYLF/docker/servidor/facylf-slice.conf" /etc/systemd/system/facylf.slice.d/limite.conf
  systemctl daemon-reload
  echo "  instalado desde $RAIZ_FACYLF/docker/servidor/facylf-slice.conf"
else
  echo "  NO se encuentra $RAIZ_FACYLF/docker/servidor/facylf-slice.conf (¿aún no está el repositorio?)"
fi
echo "  $(systemctl show facylf.slice -p MemoryMax 2>/dev/null || echo 'MemoryMax no disponible')"
echo "  $(systemctl show facylf.slice -p MemorySwapMax 2>/dev/null || true)"

echo
echo "════════════════ resumen ════════════════"
[ "$DNS_OK" = "1" ] && echo "DNS: correcto" || echo "DNS: PENDIENTE"
echo "Tope: $(systemctl show facylf.slice -p MemoryMax --value 2>/dev/null || echo '?') bytes"
