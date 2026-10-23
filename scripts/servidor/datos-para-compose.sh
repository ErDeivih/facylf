#!/bin/bash
# 1) Datos para la reserva de IP en el router (MAC del servidor y router).
# 2) TODO lo que hace falta para clonar el contenedor de Postgres en un compose, sin suponer nada.
echo "=== DATOS PARA LA RESERVA DHCP ==="
echo "  interfaces y MAC:"
for i in enp2s0 wlp3s0; do
  mac=$(cat "/sys/class/net/$i/address" 2>/dev/null)
  ip=$(ip -4 addr show "$i" 2>/dev/null | awk '/inet /{print $2}')
  [ -n "$mac" ] && printf '    %-8s %s   %s\n' "$i" "$mac" "${ip:-sin ip}"
done
echo -n "  router (puerta de enlace): "; ip route 2>/dev/null | awk '/^default/{print $3; exit}'
echo -n "  DNS que usa el servidor:   "; grep -m1 nameserver /etc/resolv.conf 2>/dev/null | awk '{print $2}'
echo
echo "=== POSTGRES: LO QUE HAY QUE CLONAR ==="
echo -n "  imagen:   "; timeout 25 docker inspect -f '{{.Config.Image}}' facylf-postgres 2>/dev/null
echo -n "  comando:  "; timeout 25 docker inspect -f '{{.Config.Cmd}}' facylf-postgres 2>/dev/null
echo -n "  entrypoint: "; timeout 25 docker inspect -f '{{.Config.Entrypoint}}' facylf-postgres 2>/dev/null
echo -n "  reinicio: "; timeout 25 docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' facylf-postgres 2>/dev/null
echo -n "  shm:      "; timeout 25 docker inspect -f '{{.HostConfig.ShmSize}}' facylf-postgres 2>/dev/null
echo -n "  red:      "; timeout 25 docker inspect -f '{{.HostConfig.NetworkMode}}' facylf-postgres 2>/dev/null
echo -n "  usuario:  "; timeout 25 docker inspect -f '{{.Config.User}}' facylf-postgres 2>/dev/null
echo "  variables de entorno:"
timeout 25 docker inspect -f '{{range .Config.Env}}    {{.}}
{{end}}' facylf-postgres 2>/dev/null | grep -viE '^    (PATH|PG_VERSION|LANG|GOSU)' | head -20
echo "  montajes:"
timeout 25 docker inspect -f '{{range .Mounts}}    {{.Type}} {{.Source}} -> {{.Destination}} (rw={{.RW}})
{{end}}' facylf-postgres 2>/dev/null
echo "  puertos publicados:"
timeout 25 docker inspect -f '{{json .NetworkSettings.Ports}}' facylf-postgres 2>/dev/null
echo "  healthcheck:"
timeout 25 docker inspect -f '{{json .Config.Healthcheck}}' facylf-postgres 2>/dev/null
echo "  redes:"
timeout 25 docker inspect -f '{{range $n, $v := .NetworkSettings.Networks}}    {{$n}} ip={{$v.IPAddress}} aliases={{$v.Aliases}}
{{end}}' facylf-postgres 2>/dev/null
echo "  etiquetas de compose:"
timeout 25 docker inspect -f '{{json .Config.Labels}}' facylf-postgres 2>/dev/null | head -c 400
echo
