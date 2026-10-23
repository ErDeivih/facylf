/*
 * ── DESCUBIERTO NO ES INGESTADO ─────────────────────────────────────────────────────────────────────────
 *
 * El responsable lo ha puesto en duda y tiene razón en dudarlo: decir «100 % descubierto y 98 % de actas»
 * puede estar mezclando dos cosas muy distintas.
 *
 *   DESCUBIERTO es saber que la competición, el grupo y la jornada existen, y qué partidos tiene.
 *   INGESTADO   es tener el acta de cada partido descargada Y analizada, con sus alineaciones y sus eventos.
 *
 * Este guion mide las dos por separado, y añade una tercera que faltaba: cuántos partidos tienen su código de
 * acta identificado (`partidos.codigo_acta`) y cuántos de esos tienen el acta en la tabla `actas`, con su
 * estado — que es lo que dice si el acta está descargada, analizada o a medias.
 */
import { DatabaseSync } from 'node:sqlite';
const ruta = process.argv[2] ?? 'descargas-federacion/recolector-local/cola-v2.sqlite';
const db = new DatabaseSync(ruta, { readOnly: true });

const nombres = new Map();
try {
  for (const t of db.prepare('select codigo, etiqueta from temporadas').all()) nombres.set(String(t.codigo).trim(), t.etiqueta);
} catch { /* sin tabla */ }

console.log(`\n════════ ${ruta} ════════`);
console.log('=== ESTADOS DE LAS ACTAS (lo que dice la propia cola) ===');
for (const f of db.prepare(`select coalesce(estado, 'sin estado') as e, count(*) as n from actas group by 1 order by 2 desc`).all()) {
  console.log(`  ${String(f.e).padEnd(20)} ${f.n}`);
}
console.log('=== CALIDAD DE LAS ACTAS ===');
for (const f of db.prepare(`select coalesce(calidad, 'sin calidad') as c, count(*) as n from actas group by 1 order by 2 desc limit 8`).all()) {
  console.log(`  ${String(f.c).padEnd(28)} ${f.n}`);
}
console.log('=== ¿LAS ACTAS TIENEN DATOS ANALIZADOS? (columna `datos`) ===');
const conDatos = db.prepare("select count(*) as n from actas where datos is not null and length(datos) > 10").get().n;
const sinDatos = db.prepare("select count(*) as n from actas where datos is null or length(datos) <= 10").get().n;
console.log(`  con datos analizados: ${conDatos} · sin datos: ${sinDatos}`);

console.log('\n=== POR TEMPORADA: DESCUBIERTO vs INGESTADO ===');
console.log('temporada    partidos   con codigo_acta   actas_guardadas   % acta   trabajos   hechos   % hecho');
for (const t of ['22', '21', '20', '19', '18', '17', '16', '15', '14', '13', '12', '11', '10', '9', '8']) {
  const partidos = db.prepare('select count(*) as n from partidos where temporada = ?').get(t).n;
  const conCodigo = db.prepare(`select count(*) as n from partidos where temporada = ? and coalesce(codigo_acta, '') <> ''`).get(t).n;
  const guardadas = db.prepare('select count(*) as n from actas where temporada = ?').get(t).n;
  const trabajos = db.prepare('select count(*) as n from trabajos where temporada = ?').get(t).n;
  const hechos = db.prepare("select count(*) as n from trabajos where temporada = ? and estado = 'hecho'").get(t).n;
  if (partidos === 0 && trabajos === 0) continue;
  const pctActa = partidos > 0 ? Math.round((100 * guardadas) / partidos) : 0;
  const pctHecho = trabajos > 0 ? Math.round((100 * hechos) / trabajos) : 0;
  console.log(`${String(nombres.get(t) ?? `t${t}`).padEnd(11)} ${String(partidos).padStart(9)} ${String(conCodigo).padStart(16)} ${String(guardadas).padStart(17)} ${String(pctActa + ' %').padStart(8)} ${String(trabajos).padStart(10)} ${String(hechos).padStart(8)} ${String(pctHecho + ' %').padStart(8)}`);
}

console.log('\n=== LO INGESTADO DE VERDAD: apariciones y eventos por temporada ===');
for (const t of ['22', '21', '20', '19', '18', '17', '16', '15', '14', '13', '12', '11']) {
  const partidosConAlineacion = db.prepare(`select count(distinct p.codigo) as n from partidos p
    where p.temporada = ? and exists (select 1 from participaciones pa where pa.temporada = p.temporada and pa.partido = p.codigo)`).get(t).n;
  const eventos = db.prepare('select count(*) as n from eventos where temporada = ?').get(t).n;
  if (partidosConAlineacion === 0 && eventos === 0) continue;
  console.log(`  ${String(nombres.get(t) ?? `t${t}`).padEnd(11)} partidos con alineación: ${String(partidosConAlineacion).padStart(7)} · eventos: ${String(eventos).padStart(8)}`);
}
db.close();
