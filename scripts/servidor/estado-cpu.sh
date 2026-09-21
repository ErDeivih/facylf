#!/usr/bin/env bash
# ¿Quién se lleva la CPU del servidor y a qué ritmo van las federaciones que ya recolectan aquí?
set -uo pipefail

echo "── CPU y memoria por contenedor ──"
docker stats --no-stream --format '  {{.Name}} · CPU {{.CPUPerc}} · MEM {{.MemUsage}} · PIDS {{.PIDs}}' | sort

echo
echo "── núcleos y carga ──"
echo "  núcleos: $(nproc) · carga: $(cut -d' ' -f1-3 /proc/loadavg) · RAM libre: $(free -m | awk 'NR==2 {print $7" MB"}')"

echo
echo "── peticiones de las federaciones (ventana de 30 min del monitor) ──"
if [ -f /srv/data/facylf/estado/facylf.json ]; then
  node -e '
    const fs = require("fs");
    const d = JSON.parse(fs.readFileSync("/srv/data/facylf/estado/facylf.json", "utf8"));
    for (const f of d.federaciones ?? []) {
      console.log(`  ${f.federacion.padEnd(20)} ${String(f.peticionesVentana).padStart(6)} pet/30min · ${String(f.fallosVentana).padStart(3)} fallos · ${f.minutosSinPedir ?? "?"} min sin pedir · ${f.estado}`);
    }
  ' 2>/dev/null || echo "  (el monitor no ha escrito el json todavía)"
else
  echo "  (sin estado del monitor)"
fi
