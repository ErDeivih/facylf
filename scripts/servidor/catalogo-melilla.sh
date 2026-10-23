#!/bin/bash
# ¿Qué temporadas dice el CATÁLOGO de Melilla que existen? Sin navegador, sin adivinar URLs y sin pedir nada.
#
# El 08/10/2026 se midió que Melilla tiene 5 temporadas VACÍAS (2015-16 a 2019-20: con 0 competiciones en la
# cola). La pregunta es si su portal las publica o no.
#
# Y no hace falta ir al portal: **el descubrimiento ya fue** y dejó su resultado en
# `competiciones-por-temporada.json`. Si esas temporadas aparecen ahí con cero competiciones, es que el
# descubridor las visitó y no encontró nada. Si aparecen con competiciones, entonces el problema está después
# —al encolar los grupos— y es nuestro.
#
# SÓLO LEE.
set -u
for f in melilla canarias; do
  echo "════════ ${f}: su catálogo de competiciones"
  docker exec "facylf-${f}-1" node -e "
    const { readFileSync } = require('node:fs');
    const rutas = ['/app/descargas-${f}/competiciones-por-temporada.json'];
    for (const r of rutas) {
      try {
        const d = JSON.parse(readFileSync(r, 'utf8'));
        const temps = Array.isArray(d) ? d : (d.temporadas ?? Object.keys(d));
        console.log('  fichero:', r);
        if (Array.isArray(temps)) {
          for (const t of temps.slice(0, 20)) {
            const n = Array.isArray(t?.competiciones) ? t.competiciones.length
              : (typeof t?.n === 'number' ? t.n : JSON.stringify(t).slice(0, 60));
            console.log('   ', (t?.temporada ?? t?.etiqueta ?? t?.codigo ?? '?'), '→', n);
          }
        } else {
          console.log('  (estructura:', JSON.stringify(temps).slice(0, 200), ')');
        }
      } catch (e) { console.log('  no se pudo leer', r, '·', e.message); }
    }
  " 2>&1 | head -28
done
