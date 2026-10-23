/*
 * incidencias-por-categoria.mjs — ¿las incidencias son un fallo nuestro o una limitación de la fuente?
 *
 * ── LA PREGUNTA QUE RESPONDE (24/09/2026) ───────────────────────────────────────────────────────────────
 *
 * El muestreo al azar dio porcentajes de incidencias altísimos en varias federaciones (Valencia 60 %, Madrid
 * 58 %, Asturias 58 %) con el aviso `descuadre_goles`, que significa «el marcador dice N goles y no hay ni un
 * goleador publicado». Ante eso hay dos explicaciones y son MUY distintas:
 *
 *   · si la fuente SÍ publica los goleadores y no los leemos, es un fallo grave nuestro, con miles de actas
 *     afectadas y datos perdidos;
 *   · si la fuente publica el marcador pero NO los goleadores, el aviso es honesto: estamos señalando un hueco
 *     de la fuente en vez de inventarnos los autores.
 *
 * Se distingue mirando el HTML/JSON archivado —que es la respuesta cruda del portal— y, sobre todo, mirando
 * DÓNDE se concentran: el fútbol base (alevín, infantil, cadete) es donde los portales suelen no publicar
 * goleadores, y la cola guarda esa distinción en la columna `menores`.
 *
 * Este guion parte las incidencias por categoría: si se concentran en las de base, la explicación es la fuente.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/incidencias-por-categoria.mjs <ruta-cola.sqlite>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta || !existsSync(ruta)) {
  console.error('uso: incidencias-por-categoria.mjs <ruta-cola.sqlite>');
  process.exit(2);
}
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const n = (x) => Number(x ?? 0).toLocaleString('es-ES');

const resumen = db.prepare(`select
    case when menores = 1 then 'base (menores)' else 'adultos' end categoria,
    count(*) hechas,
    sum(case when incidencias is not null and trim(incidencias) not in ('','[]') then 1 else 0 end) conIncidencia,
    sum(case when incidencias like '%descuadre_goles%' then 1 else 0 end) descuadre,
    sum(case when incidencias like '%sin_alineaciones%' then 1 else 0 end) sinAlineaciones,
    sum(case when incidencias like '%no_distingue_titulares%' then 1 else 0 end) sinTitulares
  from actas where estado='hecha' group by categoria order by categoria`).all();

if (!resumen.length) { console.log('no hay actas hechas en esta cola'); process.exit(0); }

console.log(`cola: ${ruta}\n`);
console.log('  categoría        hechas    con incid.   descuadre   sin alineac.   no distingue');
for (const r of resumen) {
  const pct = (v) => `${((Number(v) / Math.max(1, Number(r.hechas))) * 100).toFixed(1)} %`;
  console.log(`  ${String(r.categoria).padEnd(16)} ${String(n(r.hechas)).padStart(8)}   ${pct(r.conIncidencia).padStart(6)}`
    + `      ${pct(r.descuadre).padStart(6)}       ${pct(r.sinAlineaciones).padStart(6)}        ${pct(r.sinTitulares).padStart(6)}`);
}

// Y la prueba directa: ¿cuántos goleadores publica la fuente en cada categoría?
// Si en base no hay ninguno y en adultos sí, la incidencia es de la fuente, no nuestra.
console.log('\n  ¿cuántos goles trae cada acta de media? (0 = la fuente no los publica)');
for (const r of resumen) {
  const media = db.prepare(`select avg(case when datos is null then null
      else coalesce(json_array_length(json_extract(datos, '$.goles_local')), 0) end) m
    from actas where estado='hecha' and (menores = 1) = ?`).get(r.categoria.startsWith('base') ? 1 : 0)?.m;
  console.log(`     ${String(r.categoria).padEnd(16)} ${media === null ? '(sin datos)' : Number(media).toFixed(2)} goles por acta`);
}
db.close();
