#!/bin/bash
# Recrea el monitor de verdad: el contenedor que corre pertenece a otro proyecto de compose, así que hay que
# quitarlo para que el compose pueda crear el suyo con la configuración nueva.
cd /srv/data/facylf || exit 1
echo "=== ETIQUETAS DEL CONTENEDOR VIEJO ==="
docker inspect -f 'proyecto={{index .Config.Labels "com.docker.compose.project"}} ficheros={{index .Config.Labels "com.docker.compose.project.config_files"}}' facylf-monitor 2>&1
echo
echo "=== SE RETIRA Y SE VUELVE A CREAR CON compose ==="
docker rm -f facylf-monitor 2>&1 | tail -2
docker compose --env-file docker/.env -f docker/monitor.yml up -d 2>&1 | tail -4
sleep 8
echo
echo "=== ESTADO NUEVO ==="
docker ps --filter name=facylf-monitor --format '{{.Names}}  {{.Status}}'
docker inspect -f 'cuota_cpu_nano={{.HostConfig.NanoCpus}}  proyecto={{index .Config.Labels "com.docker.compose.project"}}' facylf-monitor 2>&1
echo -n "FACYLF_COLAS_POR_VUELTA="; docker exec facylf-monitor printenv FACYLF_COLAS_POR_VUELTA 2>&1
echo -n "FACYLF_EXCLUIR="; docker exec facylf-monitor printenv FACYLF_EXCLUIR 2>&1
echo
echo "=== PRIMERA VUELTA (no deben salir valencia, madrid ni cataluna) ==="
sleep 20
docker logs --tail 30 facylf-monitor 2>&1 | grep -E 'federación|trabajando|sin-trabajo|avisos|memoria|disco' | head -28
