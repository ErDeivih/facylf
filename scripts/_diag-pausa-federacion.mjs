#!/usr/bin/env node
/** Lee los metadatos de pausa de una cola y lo que el visor dice de ellos. */
import { DatabaseSync } from 'node:sqlite';

const fed = process.argv[2] ?? 'canarias';
const db = new DatabaseSync(`descargas-${fed}/recolector-local/cola-v2.sqlite`, { readOnly: true });
console.log(`metadatos de descargas-${fed}:`);
for (const m of db.prepare(`select clave, valor from metadatos order by clave`).all()) {
  console.log(`   ${m.clave} = ${String(m.valor).slice(0, 80)}`);
}
db.close();
const visor = await (await fetch('http://127.0.0.1:3777/api/estado', { signal: AbortSignal.timeout(60_000) })).json();
const f = visor.find((x) => x.nombre === fed);
console.log(`\nel visor dice de ${fed}: pausado=${f?.pausado} hasta=${f?.pausaHasta} motivo=${f?.pausaMotivo}`);
