#!/usr/bin/env bash
# Diagnóstico de por qué falla la construcción de la imagen en el servidor: DNS del host frente al de
# BuildKit. Sólo lee: no construye ni cambia nada.
echo "── imágenes locales ──"
docker images --format '{{.Repository}}:{{.Tag}}  {{.Size}}' | head -20
echo
echo "── opciones de docker build relacionadas con red ──"
docker build --help 2>&1 | grep -iE 'dns|add-host|network' || echo "  (ninguna)"
echo
echo "── /etc/resolv.conf ──"
cat /etc/resolv.conf
echo
echo "── ¿resuelve el HOST? (cada resolutor por separado) ──"
for s in 100.100.1.1 100.90.1.1 192.168.1.1 1.1.1.1; do
  printf '  %-14s ' "$s"
  if timeout 4 getent hosts registry-1.docker.io >/dev/null 2>&1; then echo "getent ok (usa el de resolv.conf)"; else echo "getent falla"; fi
  if command -v dig >/dev/null 2>&1; then
    r=$(timeout 4 dig +short +time=2 +tries=1 "@$s" registry-1.docker.io 2>/dev/null | head -1)
    printf '    dig @%s -> %s\n' "$s" "${r:-sin respuesta}"
  fi
done
echo
echo "── ¿resuelve un contenedor suelto con cada resolutor? ──"
for c in 100.100.1.1 100.90.1.1 192.168.1.1 1.1.1.1; do
  printf '  --dns %-14s ' "$c"
  docker run --rm --dns "$c" alpine nslookup registry-1.docker.io >/dev/null 2>&1 && echo ok || echo falla
done
echo
echo "── ¿resuelven las herramientas de node dentro de un contenedor? ──"
docker run --rm alpine nslookup registry.npmjs.org 2>&1 | tail -3
