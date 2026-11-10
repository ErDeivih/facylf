/**
 * estado-rotacion.mjs — ¿qué grupos de la temporada en rotación están cerca de poder importarse?
 *
 * Solo lee la cola SQLite (rápido, no toca el canónico ni el worker). Para cada grupo con datos de la temporada
 * indicada enseña: jornadas conocidas frente a las previstas (calendario), partidos conocidos, actas hechas y
 * actas pendientes. Un grupo está "listo para probar importación" cuando el calendario está completo, hay partidos
 * y todas las actas están hechas. Sirve para no perder tiempo reimportando temporadas a medias: la validación del
 * importador rechaza el grupo mientras el origen traiga menos que el canónico.
 *
 * Uso:
 *   node scripts/claude/estado-rotacion.mjs                     (2018-19, la que está en rotación)
 *   node scripts/claude/estado-rotacion.mjs --temporada 2016-17
 *   node scripts/claude/estado-rotacion.mjs --cola E:/.../cola-v2.sqlite
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const argumentos = process.argv.slice(2);
const valor = (bandera, porDefecto) => {
  const i = argumentos.indexOf(bandera);
  return i >= 0 ? argumentos[i + 1] : porDefecto;
};

const COLA = valor('--cola', 'E:/facylf-datos/descargas-federacion/recolector-local/cola-v2.sqlite');
const ETIQUETA = valor('--temporada', '2018-19');
if (!existsSync(COLA)) {
  console.error(`no existe la cola: ${COLA}`);
  process.exit(1);
}

const db = new DatabaseSync(COLA, { readOnly: true, timeout: 20000 });
const fila = db.prepare('select codigo from temporadas where etiqueta = ?').get(ETIQUETA);
if (!fila) {
  console.error(`la cola no conoce la temporada ${ETIQUETA}`);
  process.exit(1);
}
const temporada = String(fila.codigo);

const grupos = db.prepare(`
  select g.competicion, g.codigo, g.nombre, g.jornadas as jornadas_previstas,
         (select count(*) from jornadas j
           where j.temporada = g.temporada and j.competicion = g.competicion and j.grupo = g.codigo) jornadas_conocidas,
         (select count(*) from partidos p
           where p.temporada = g.temporada and p.competicion = g.competicion and p.grupo = g.codigo) partidos,
         (select count(*) from actas a
           where a.temporada = g.temporada and a.competicion = g.competicion and a.grupo = g.codigo
             and a.estado = 'hecha') actas_hechas,
         (select count(*) from actas a
           where a.temporada = g.temporada and a.competicion = g.competicion and a.grupo = g.codigo
             and a.estado = 'pendiente') actas_pendientes
  from grupos g where g.temporada = ?
`).all(temporada);

const conDatos = grupos.filter((g) => g.partidos > 0 || g.actas_hechas > 0 || g.jornadas_conocidas > 0);
const calendarioCompleto = conDatos.filter((g) => g.jornadas_previstas > 0 && g.jornadas_conocidas >= g.jornadas_previstas);
const listos = calendarioCompleto.filter((g) => g.partidos > 0 && g.actas_hechas >= g.partidos);
const sinCalendario = conDatos.filter((g) => g.jornadas_previstas > 0 && g.jornadas_conocidas < g.jornadas_previstas);

console.log(`temporada ${ETIQUETA} (código ${temporada} de la cola)`);
console.log(`  grupos: ${grupos.length} · con datos: ${conDatos.length}`);
console.log(`  calendario completo: ${calendarioCompleto.length} · sin calendario completo: ${sinCalendario.length}`);
console.log(`  listos para probar importación (calendario + partidos + actas): ${listos.length}`);
console.log('  los 10 con más actas hechas:');
for (const g of [...conDatos].sort((a, b) => b.actas_hechas - a.actas_hechas).slice(0, 10)) {
  const pctJ = g.jornadas_previstas ? Math.round((g.jornadas_conocidas / g.jornadas_previstas) * 100) : 0;
  const pctA = g.partidos ? Math.round((g.actas_hechas / g.partidos) * 100) : 0;
  console.log(`    ${g.competicion}/${g.codigo} ${g.nombre}: jornadas ${g.jornadas_conocidas}/${g.jornadas_previstas} (${pctJ} %) · partidos ${g.partidos} · actas ${g.actas_hechas}/${g.partidos} (${pctA} %) · ${g.actas_pendientes} pendientes`);
}
db.close();
