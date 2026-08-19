#!/usr/bin/env tsx
/**
 * Worker de ingesta. Un ciclo = mirar las competiciones que toquen ahora mismo.
 *
 *   pnpm ingesta:una    --slug juvenil-primera-salamanca   (no escribe, sólo enseña)
 *   pnpm ingesta:todas                                     (ciclo completo)
 *
 * Estado: **sin conexión real todavía**. Falta la URL del botón "Calendario Excel"
 * (ver src/urls.ts). Hasta entonces `--una` trabaja sobre `datos-ejemplo/` para poder
 * probar el resto de la cadena de punta a punta.
 */
import { readFileSync } from 'node:fs';
import { parseaCalendario } from '../src/parsers/calendario.js';
import { validaCalendario } from '../src/validacion.js';
import { minutosEntreCiclos } from '../src/frecuencia.js';

const args = new Set(process.argv.slice(2));

function local(): void {
  const ruta = new URL('../../../datos-ejemplo/Calendario.xls', import.meta.url);
  const c = parseaCalendario(readFileSync(ruta));
  const problemas = validaCalendario(c.partidos);

  console.log(`equipos:   ${c.equipos.length}`);
  console.log(`jornadas:  ${c.jornadas}`);
  console.log(`partidos:  ${c.partidos.length}`);
  console.log(problemas.length
    ? `PROBLEMAS:\n${problemas.map((p) => `  · [${p.regla}] ${p.detalle}`).join('\n')}`
    : 'validación: correcta');
  console.log(`\nritmo ahora mismo: cada ${minutosEntreCiclos(new Date(), true)} min`);
  console.log('(en seco: no se ha escrito nada en la base de datos)');
}

if (args.has('--una') || args.has('--dry')) {
  local();
} else {
  console.error(
    'El ciclo completo todavía no está conectado: falta la URL real del botón\n' +
    '"Calendario Excel" de la federación (F12 → Red). Ver packages/ingesta/src/urls.ts\n' +
    'y PROYECTO.md §11. Mientras tanto: pnpm ingesta:una',
  );
  process.exit(1);
}
