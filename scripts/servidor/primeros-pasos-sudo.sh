#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════════════════════════════════
#  LO QUE HACE FALTA CON `sudo`, DE UNA VEZ
# ══════════════════════════════════════════════════════════════════════════════════════════════════════════
#
# Se ejecuta COMO ROOT en el servidor y hace tres cosas. Las tres están pensadas para poder deshacerse:
#
#   1. **DNS del host.** Ahora mismo `/etc/resolv.conf` apunta a los resolutores de Tailscale (100.100.1.1 y
#      100.90.1.1) y Tailscale tiene el DNS desactivado en esta máquina, así que el HOST no resuelve nada: ni
#      `apt`, ni `git`, ni `docker pull`, ni el autodeploy de RadioPV. Los contenedores sí resuelven (por eso la
#      recolección funciona). Se ponen el router de casa (192.168.1.1) y Cloudflare (1.1.1.1), que sí contestan.
#
#      PARA NO QUEDARSE SIN RED: no se baja ninguna interfaz. Se prefiere `systemd-resolved` (reiniciar el
#      servicio de nombres no toca el enlace) y, si no existe, se aplica con `nmcli device reapply`, que
#      tampoco baja el enlace. Si ninguna de las dos cosas está disponible, se escribe `/etc/resolv.conf` a pelo
#      dejando copia del anterior.
#
#   2. **DNS del demonio de Docker**, para que `docker build` y `docker pull` funcionen aunque el host siga
#      resolviendo mal: se añade `"dns"` a `/etc/docker/daemon.json`. Esto SÓLO se aplica si se pasa
#      `--reiniciar-docker`, porque reiniciar Docker reinicia TODOS los contenedores de la máquina (los de
#      facylf vuelven solos: llevan `restart: unless-stopped`). Medido el 22/09/2026: sin esto, construir la
#      imagen falla con `lookup registry-1.docker.io on 100.90.1.1:53: i/o timeout`.
#
#   3. **Tope de memoria de la rebanada de facylf** (`facylf.slice`), que es el techo duro de todo el proyecto
#      dentro de la máquina: ahora está en `infinity`. Se pone en 13 GB —el presupuesto que usa la flota— para
#      que un navegador desbocado no se lleve por delante a PostgreSQL ni al resto del servidor. Se aplica en
#      caliente y además se deja escrito para que sobreviva a un reinicio.
#
# Uso (como root):
#   bash /tmp/primeros-pasos-sudo.sh                    # DNS del host + tope de memoria
#   bash /tmp/primeros-pasos-sudo.sh --reiniciar-docker # y además el DNS del demonio de Docker
#   bash /tmp/primeros-pasos-sudo.sh --seco             # dice qué haría, sin tocar nada
#
# Nada de esto borra datos ni toca la recolección: los recolectores siguen con sus colas y sus plazas.
set -uo pipefail

SECO=0
REINICIAR_DOCKER=0
DNS1=${FACYLF_DNS_1:-192.168.1.1}
DNS2=${FACYLF_DNS_2:-1.1.1.1}
MEMORIA=${FACYLF_MEMORIA_TOPE:-13G}
SELLO=$(date '+%F-%H%M')
REGISTRO="/var/log/facylf-sudo-$SELLO.log"

for a in "$@"; do
  case "$a" in
    --seco) SECO=1 ;;
    --reiniciar-docker) REINICIAR_DOCKER=1 ;;
    *) echo "opción no reconocida: $a"; exit 1 ;;
  esac
done

[ "$(id -u)" = "0" ] || { echo "hay que ejecutarlo como root (sudo)"; exit 1; }

# Todo lo que se dice por pantalla queda también en un registro, para poder mirarlo después.
exec > >(tee -a "$REGISTRO") 2>&1

ejecuta() {
  if [ "$SECO" = "1" ]; then echo "  [seco] $*"; else echo "  + $*"; "$@"; fi
}

echo "════════════════════════════════════════════════════════════════════════"
echo "  facylf · lo que hace falta con sudo · $(date '+%F %T')"
echo "  registro: $REGISTRO"
[ "$SECO" = "1" ] && echo "  MODO SECO: no se cambia nada"
echo "════════════════════════════════════════════════════════════════════════"

# ── 0 · Cómo está ahora ──────────────────────────────────────────────────────────────────────────────────
echo
echo "── cómo está ahora ──"
echo "  /etc/resolv.conf:"; sed 's/^/    /' /etc/resolv.conf
echo "  ¿resuelve el host?: $(getent hosts github.com >/dev/null 2>&1 && echo SÍ || echo NO)"
echo "  systemd-resolved: $(systemctl is-active systemd-resolved 2>/dev/null || echo 'no está')"
echo "  NetworkManager:   $(systemctl is-active NetworkManager 2>/dev/null || echo 'no está')"
echo "  tope de facylf.slice: $(systemctl show facylf.slice -p MemoryMax --value 2>/dev/null || echo '?')"

# ── 1 · DNS del host ─────────────────────────────────────────────────────────────────────────────────────
echo
echo "── 1 · DNS del host ($DNS1, $DNS2) ──"
if getent hosts github.com >/dev/null 2>&1; then
  echo "  el host ya resuelve: no se toca nada"
else
  cp -a /etc/resolv.conf "/etc/resolv.conf.antes-de-facylf-$SELLO" 2>/dev/null && echo "  copia de resolv.conf guardada"
  if systemctl is-active systemd-resolved >/dev/null 2>&1; then
    echo "  vía systemd-resolved (no toca la red)"
    if [ "$SECO" = "0" ]; then
      mkdir -p /etc/systemd/resolved.conf.d
      printf '[Resolve]\nDNS=%s %s\nFallbackDNS=%s\n' "$DNS1" "$DNS2" "$DNS2" > /etc/systemd/resolved.conf.d/facylf.conf
      systemctl restart systemd-resolved
    else
      echo "  [seco] escribiría /etc/systemd/resolved.conf.d/facylf.conf y reiniciaría systemd-resolved"
    fi
  elif command -v nmcli >/dev/null 2>&1; then
    echo "  vía NetworkManager (con `device reapply`: NO baja el enlace)"
    CONEXION=$(nmcli -t -f NAME con show --active 2>/dev/null | head -1)
    DISPOSITIVO=$(nmcli -t -f DEVICE,STATE device status 2>/dev/null | awk -F: '$2 == "connected" { print $1; exit }')
    echo "    conexión: ${CONEXION:-?} · dispositivo: ${DISPOSITIVO:-?}"
    if [ -n "$CONEXION" ] && [ "$SECO" = "0" ]; then
      nmcli con mod "$CONEXION" ipv4.dns "$DNS1 $DNS2" ipv4.ignore-auto-dns yes
      [ -n "$DISPOSITIVO" ] && nmcli device reapply "$DISPOSITIVO"
    fi
  else
    echo "  ni systemd-resolved ni NetworkManager: se escribe /etc/resolv.conf"
    if [ "$SECO" = "0" ]; then
      printf 'nameserver %s\nnameserver %s\n' "$DNS1" "$DNS2" > /etc/resolv.conf
    fi
  fi
  sleep 2
  echo "  ¿resuelve ahora?: $(getent hosts github.com >/dev/null 2>&1 && echo SÍ || echo 'todavía NO')"
fi

# ── 2 · DNS del demonio de Docker ────────────────────────────────────────────────────────────────────────
echo
echo "── 2 · DNS del demonio de Docker ──"
FICHERO=/etc/docker/daemon.json
if [ -f "$FICHERO" ] && grep -q '"dns"' "$FICHERO"; then
  echo "  ya está puesto: $(tr -d '\n' < "$FICHERO" | cut -c1-120)"
elif [ "$REINICIAR_DOCKER" = "0" ]; then
  echo "  no se toca (haría falta reiniciar Docker; repite con --reiniciar-docker si el host sigue sin resolver)"
else
  echo "  añadiendo \"dns\" a $FICHERO (habrá copia .antes-de-facylf-$SELLO)"
  if [ "$SECO" = "0" ]; then
    [ -f "$FICHERO" ] && cp -a "$FICHERO" "$FICHERO.antes-de-facylf-$SELLO"
    # Se conserva lo que hubiera: se añade `dns` con un script de node que corre en un contenedor (aquí no hay
    # node en el host)… o simplemente con python3, que en Debian sí está.
    python3 - "$FICHERO" "$DNS1" "$DNS2" <<'PY'
import json, os, sys
ruta, d1, d2 = sys.argv[1], sys.argv[2], sys.argv[3]
datos = {}
if os.path.exists(ruta):
    with open(ruta) as f:
        texto = f.read().strip()
    if texto:
        datos = json.loads(texto)
datos["dns"] = [d1, d2]
with open(ruta, "w") as f:
    json.dump(datos, f, indent=2)
    f.write("\n")
print("    daemon.json:", json.dumps(datos))
PY
    echo "  reiniciando Docker (los contenedores vuelven solos)"
    systemctl restart docker
    sleep 8
  fi
fi

# ── 3 · Tope de memoria de la rebanada ───────────────────────────────────────────────────────────────────
echo
echo "── 3 · tope de memoria de facylf.slice ($MEMORIA) ──"
echo "  antes: $(systemctl show facylf.slice -p MemoryMax --value 2>/dev/null || echo '?')"
if [ "$SECO" = "0" ]; then
  systemctl set-property --runtime facylf.slice MemoryMax="$MEMORIA" 2>/dev/null || echo "  aviso: no se pudo aplicar en caliente"
  mkdir -p /etc/systemd/system/facylf.slice.d
  printf '[Slice]\nMemoryMax=%s\n' "$MEMORIA" > /etc/systemd/system/facylf.slice.d/limite.conf
  systemctl daemon-reload
fi
echo "  después: $(systemctl show facylf.slice -p MemoryMax --value 2>/dev/null || echo '?')"
echo "  (queda escrito en /etc/systemd/system/facylf.slice.d/limite.conf para el próximo arranque)"

# ── 4 · Comprobación final ───────────────────────────────────────────────────────────────────────────────
echo
echo "── 4 · comprobación ──"
echo "  host resuelve github.com:      $(getent hosts github.com >/dev/null 2>&1 && echo SÍ || echo NO)"
echo "  contenedor resuelve el registro: $(docker run --rm alpine nslookup registry-1.docker.io >/dev/null 2>&1 && echo SÍ || echo NO)"
echo "  tope de la rebanada:           $(systemctl show facylf.slice -p MemoryMax --value 2>/dev/null)"
echo "  memoria del sistema:           $(free -m | awk 'NR == 2 { printf "%s MB usados de %s · %s MB disponibles", $3, $2, $7 }')"
echo
echo "── cómo deshacerlo ──"
echo "  · DNS del host:      restaurar /etc/resolv.conf.antes-de-facylf-$SELLO o el fichero de systemd/NetworkManager"
echo "  · DNS de Docker:     borrar la clave \"dns\" de /etc/docker/daemon.json y reiniciar docker"
echo "  · tope de memoria:   systemctl set-property --runtime facylf.slice MemoryMax=infinity"
echo "                       y quitar /etc/systemd/system/facylf.slice.d/limite.conf"
echo
echo "  registro completo: $REGISTRO"
