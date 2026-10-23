/*
 * VALENCIA: ¿por qué los trabajos de acta se marcan como «hechos» sin que suban las actas guardadas?
 *
 * Los dos seguimientos dieron 6 actas y luego 0, y sin embargo en la última hora había 100 trabajos de tipo
 * `acta` en estado «hecho». O esas actas se están tirando, o las dos cifras cuentan cosas distintas. Aquí se
 * cruzan las dos: los trabajos marcados como hechos contra la tabla de actas guardadas.
 */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('descargas-valencia/recolector-local/cola-v2.sqlite', { readOnly: true });

console.log('=== LA TABLA `actas` ===');
const cols = db.prepare('pragma table_info(actas)').all();
console.log('  columnas:', cols.map((c) => c.name).join(', '));
const totalActas = db.prepare('select count(*) as n from actas').get();
console.log(`  filas en actas: ${totalActas.n}`);
for (const f of db.prepare('select temporada, count(*) as n from actas group by 1 order by 1').all()) {
  console.log(`    temporada ${f.temporada}: ${f.n}`);
}

console.log('\n=== TRABAJOS `acta` MARCADOS COMO HECHOS EN LAS ÚLTIMAS 2 HORAS ===');
const hechos = db.prepare(`select clave, actualizado_en from trabajos
  where tipo='acta' and estado='hecho' and actualizado_en > datetime('now','-2 hours')
  order by actualizado_en desc limit 12`).all();
console.log(`  ${hechos.length} (mostrando hasta 12)`);
let guardadas = 0;
let perdidas = 0;
for (const t of hechos) {
  // clave = acta|temporada|competicion|grupo|jornada|codigo_acta
  const partes = String(t.clave).split('|');
  const codigo = partes[5];
  const enActas = db.prepare('select count(*) as n from actas where codigo = ?').get(codigo);
  if (enActas.n > 0) guardadas += 1; else perdidas += 1;
  console.log(`  ${t.actualizado_en} acta ${codigo} -> ${enActas.n > 0 ? 'GUARDADA' : 'NO ESTÁ EN actas'}`);
}
console.log(`  resumen de la muestra: ${guardadas} guardadas, ${perdidas} sin guardar`);

console.log('\n=== TODOS LOS MOTIVOS DE ERROR, AGRUPADOS (sin filtrar) ===');
for (const f of db.prepare(`select substr(ultimo_error,1,64) as motivo, count(*) as n from trabajos
  where ultimo_error is not null group by 1 order by 2 desc limit 12`).all()) {
  console.log(`  ${String(f.n).padStart(7)}  ${f.motivo}`);
}

console.log('\n=== ¿POR QUÉ `indice_jornadas` VUELVE A PENDIENTE? ===');
for (const f of db.prepare(`select estado, count(*) as n, max(intentos) as max_int from trabajos
  where tipo='indice_jornadas' group by 1 order by 2 desc`).all()) {
  console.log(`  ${String(f.estado).padEnd(12)} ${String(f.n).padStart(6)} · intentos hasta ${f.max_int}`);
}
for (const t of db.prepare(`select clave, intentos, substr(coalesce(ultimo_error,'(sin error)'),1,80) as err
  from trabajos where tipo='indice_jornadas' and intentos > 0 order by intentos desc limit 5`).all()) {
  console.log(`  int=${t.intentos} ${t.clave}\n     ${t.err}`);
}

console.log('\n=== RITMO REAL: trabajos cerrados por hora y tipo (últimas 6 h) ===');
for (const f of db.prepare(`select strftime('%H', actualizado_en) as hora, tipo, count(*) as n from trabajos
  where estado in ('hecho','cancelado') and actualizado_en > datetime('now','-6 hours')
  group by 1,2 order by 1 desc, 3 desc`).all()) {
  console.log(`  ${f.hora}h  ${String(f.tipo).padEnd(18)} ${f.n}`);
}
db.close();
