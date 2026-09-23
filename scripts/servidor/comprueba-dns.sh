#!/usr/bin/env bash
# ¿Resuelve el DNS el host y los contenedores? Es el fallo que deja a una federación SIN abrir un solo portal, y
# su síntoma dentro del contenedor es `net::ERR_NAME_NOT_RESOLVED` (documentado en el traspaso desde el 21/09).
#
# El compose pone resolutores explícitos en el ancla (`dns:`), porque el host tiene los de Tailscale y Tailscale
# tiene el DNS desactivado en esa máquina. Si un servicio pierde esa clave —o si los resolutores no contestan—,
# ese contenedor se queda sin resolver y su federación se cae en bucle sin decir por qué.
#
# SÓLO LEE.
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}

echo '── host ──'
echo -n '  resolv.conf: '; grep -E '^nameserver' /etc/resolv.conf 2>/dev/null | tr '\n' ' '; echo
if curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://github.com >/dev/null 2>&1; then
  echo '  https://github.com → responde'
else
  echo '  https://github.com → NO responde'
fi
echo

echo '── resolutores que declara el .env ──'
grep -E '^FACYLF_DNS' "$RAIZ/docker/.env" 2>/dev/null | sed 's/^/  /' || echo '  (no están en el .env: se usan los del compose)'
echo

echo '── dentro de los contenedores ──'
printf '  %-30s %-28s %s\n' contenedor resolv.conf "prueba de resolución"
for c in facylf-castilla-la-mancha-1 facylf-andalucia-1 facylf-murcia-1 facylf-navarra-1; do
  docker ps --filter "name=$c" --format '{{.Names}}' | grep -q . || { printf '  %-30s (no está en marcha)\n' "$c"; continue; }
  ns=$(docker exec "$c" grep -E '^nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}' | tr '\n' ' ')
  # Se prueba a resolver con `getent`, que usa el mismo camino que Chrome.
  if docker exec "$c" getent hosts www.ffcm.es >/dev/null 2>&1; then prueba='resuelve su portal'; else prueba='NO RESUELVE'; fi
  printf '  %-30s %-28s %s\n' "$c" "${ns:-—}" "$prueba"
done
echo
echo '  Si el host resuelve y un contenedor no, el problema son los resolutores de ESE contenedor: se miran con'
echo '  `docker inspect <c> --format "{{.HostConfig.Dns}}"`. Y si ninguno resuelve, es del host o de la red.'
