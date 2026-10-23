#!/bin/bash
# La ingesta semanal del servidor: el contenedor estaba en `created`, o sea creado y NUNCA arrancado.
echo "=== ESTADO ANTES ==="
docker inspect -f '  {{.Name}} {{.State.Status}}' facylf-fin-de-semana-1 2>&1
echo
echo "=== ARRANCÁNDOLO ==="
docker start facylf-fin-de-semana-1 2>&1 | sed 's/^/  /'
sleep 15
docker inspect -f '  {{.Name}} {{.State.Status}} desde {{.State.StartedAt}}' facylf-fin-de-semana-1 2>&1
echo
echo "=== SU CONFIGURACIÓN (qué federaciones y cuándo) ==="
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' facylf-fin-de-semana-1 2>/dev/null | grep -iE 'FACYLF' | sed 's/^/  /'
echo "  --- comando ---"
docker inspect -f '  cmd={{.Config.Cmd}}' facylf-fin-de-semana-1 2>&1
echo "  --- política de reinicio ---"
docker inspect -f '  {{.HostConfig.RestartPolicy.Name}}' facylf-fin-de-semana-1 2>&1
echo
echo "=== LO QUE DICE AL ARRANCAR ==="
sleep 10
docker logs --tail 15 facylf-fin-de-semana-1 2>&1 | tail -15 | sed 's/^/  /'
