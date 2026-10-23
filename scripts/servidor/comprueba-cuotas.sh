#!/bin/bash
# ¿Están APLICADAS las cuotas de CPU y los turnos, o los contenedores corren sin freno?
# Si `NanoCpus` es 0, el contenedor no tiene límite: la cuota del fichero no se aplicó.
echo "=== CUOTA DE CPU REALMENTE APLICADA Y TURNO DECLARADO ==="
printf '%-28s %10s %12s %8s\n' contenedor nano_cpus cpu_equiv turno_min
for c in $(docker ps --format '{{.Names}}' | grep -E '^facylf-.*-1$' | sort); do
  nano=$(docker inspect -f '{{.HostConfig.NanoCpus}}' "$c" 2>/dev/null)
  turno=$(docker exec "$c" printenv FACYLF_TURNO_PLAZA_MIN 2>/dev/null)
  if [ -z "$nano" ] || [ "$nano" = "0" ]; then
    equiv="SIN TOPE"
  else
    equiv=$(awk -v n="$nano" 'BEGIN {printf "%.2f", n/1000000000}')
  fi
  printf '%-28s %10s %12s %8s\n' "$c" "${nano:-?}" "$equiv" "${turno:--}"
done
echo
echo "=== ¿CON QUE COMPOSE SE LEVANTARON? (etiqueta del proyecto) ==="
docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' facylf-murcia-1 2>/dev/null
echo
echo "=== MEMORIA DECLARADA Y LIMITE REAL ==="
docker inspect -f 'memoria_limite={{.HostConfig.Memory}} memoria_declarada={{range .Config.Env}}{{if eq (slice . 0 (min 18 (len .))) "FACYLF_MEMORIA_GB="}}{{.}}{{end}}{{end}}' facylf-murcia-1 2>/dev/null
docker exec facylf-murcia-1 printenv FACYLF_MEMORIA_GB FACYLF_RESERVA_GB 2>/dev/null
echo
echo "=== PLACAS DE NAVEGADOR OCUPADAS AHORA (volumen compartido) ==="
docker exec facylf-murcia-1 sh -c 'ls -la /app/.estado-workers/slots-chrome 2>/dev/null' | head -20
