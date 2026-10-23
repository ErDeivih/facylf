#!/bin/bash
# ¿La web escucha y dónde? Y ¿está Tailscale vivo, que es lo que da el acceso de fuera?
echo "=== DONDE ESCUCHA LA WEB ==="
docker exec facylf-web sh -c 'printenv PORT HOSTNAME 2>/dev/null; cat /proc/net/tcp 2>/dev/null | awk "NR>1 {print \$2}" | head -5' 2>&1 | head -8
echo "  puertos publicados por el contenedor:"
timeout 25 docker port facylf-web 2>&1 | head -5
echo "  bind declarado en el .env:"; grep -E '^FACYLF_WEB_BIND' /srv/data/facylf/docker/.env
echo
echo "=== PRUEBAS DE ACCESO A LA WEB ==="
for u in http://127.0.0.1:3100 http://192.168.1.139:3100 http://100.117.58.93:3100; do
  code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$u" 2>/dev/null)
  printf '  %-30s %s\n' "$u" "${code:-sin respuesta}"
done
echo
echo "=== ULTIMAS LINEAS DE LA WEB ==="
docker logs --tail 8 facylf-web 2>&1 | tail -8
echo
echo "=== TAILSCALE EN EL SERVIDOR ==="
systemctl is-active tailscaled 2>&1
sudo tailscale status 2>&1 | head -6
echo "  ip de tailscale del servidor:"; sudo tailscale ip -4 2>&1 | head -2
echo
echo "=== IP ACTUAL DEL SERVIDOR ==="
ip -4 addr show 2>/dev/null | grep -E 'inet ' | grep -v '127.0.0.1' | awk '{print "  "$2" en "$NF}'
