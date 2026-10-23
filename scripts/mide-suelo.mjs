/*
 * ¿Cuánto trabajo queda ELEGIBLE con el suelo puesto y con el suelo bajo?
 *
 * Usa la librería de verdad (`lib/temporada-minima.mjs`) y no una copia de su lógica: si midiera con una
 * consulta escrita a mano, comprobaría mi idea del suelo en vez del suelo que aplica el recolector.
 *
 * El 06/10/2026 se bajó el suelo de 2023-24 a 2010-11 para retomar el histórico. Esto enseña lo que eso
 * desbloquea, sin tocar nada.
 *
 * Uso:  node scripts/mide-suelo.mjs <cola.sqlite>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { TEMPORADA_MINIMA, sqlExcluyeTemporadasViejas } from './lib/temporada-minima.mjs';

const ruta = process.argv[2];
if (!ruta || !existsSync(ruta)) { console.error(`no existe la cola: ${ruta}`); process.exit(2); }
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const ahora = new Date().toISOString();

try {
  const cuenta = (filtro, ...extra) => Number(db.prepare(`select count(*) n from trabajos
    where estado in ('pendiente','bloqueado') and (siguiente_intento is null or siguiente_intento <= ?)
      and ${filtro}`).get(ahora, ...extra)?.n ?? 0);

  const conSuelo = cuenta(sqlExcluyeTemporadasViejas('trabajos'), TEMPORADA_MINIMA);
  const sinSuelo = cuenta('1=1');

  console.log(`  ${ruta}`);
  console.log(`    suelo en vigor          : ${TEMPORADA_MINIMA}`);
  console.log(`    elegible CON el suelo   : ${conSuelo}`);
  console.log(`    elegible SIN el suelo   : ${sinSuelo}`);
  console.log(`    → el suelo deja fuera   : ${sinSuelo - conSuelo}`);

  // Y qué temporadas son esas, para no hablar en abstracto.
  console.log('    las temporadas que el suelo excluye:');
  for (const f of db.prepare(`select t.etiqueta, count(*) n from trabajos w
      join temporadas t on t.codigo = w.temporada
    where w.estado in ('pendiente','bloqueado')
      and (w.siguiente_intento is null or w.siguiente_intento <= ?)
      and t.etiqueta < ?
    group by 1 order by 1 desc`).all(ahora, TEMPORADA_MINIMA)) {
    console.log(`      ${f.etiqueta}  ${String(f.n).padStart(7)}`);
  }
} finally {
  db.close();
}
