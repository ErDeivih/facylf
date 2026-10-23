#!/usr/bin/env node
/*
 * MIDE LAS IDENTIDADES PARTIDAS DEL CANÓNICO: la misma pareja con dos inscripciones en el mismo grupo.
 *
 * Señal. Dos inscripciones del mismo grupo cuyos nombres normalizados sólo se diferencian en el sufijo de
 * equipo (`A`–`D`), una CON código federativo y otra SIN él. Medido el 25/09/2026: 23 grupos de Cataluña y
 * 261 inscripciones, todas nacidas de importar un calendario reparado desde las actas (el acta escribe
 * «ARO, C.E.» y el calendario «ARO, C.E. A», que es el que publica el código 5081). La consecuencia es
 * silenciosa y grave: una consulta por el equipo con código responde 0 partidos, porque los partidos
 * quedaron colgados del duplicado.
 *
 * No escribe en el canónico. Uso:
 *   node scripts/mide-identidades-partidas.mjs
 *   node scripts/mide-identidades-partidas.mjs --federacion cataluna --json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// `pg` vive en el paquete canónico, no en la raíz: desde `scripts/` hay que resolverlo por su package.json,
// que es como lo hacen las demás herramientas que hablan con el canónico.
const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const { Client } = requerir('pg');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'identidades-partidas.json');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const quiereJson = argumentos.includes('--json');
const federacionPedida = arg('federacion');

const url = (() => {
  const m = /^DATABASE_URL_LECTOR=(.*)$/m.exec(readFileSync(join(RAIZ, '.env'), 'utf8'));
  return m[1].trim().replace(/^"|"$/g, '');
})();

/*
 * La normalización es la del canónico (`core.normaliza_nombre`), no una copia en JavaScript: dos
 * normalizadores distintos harían que la herramienta y el importador no hablaran del mismo equipo.
 *
 * La inscripción mala NO tiene que acabar en algo distinto de una letra: «CASSA, U.D.» termina en «d», y
 * esa «d» es la abreviatura de «Unión Deportiva», no un sufijo de equipo. Excluirla por eso escondía cuatro
 * parejas reales del grupo 55458432 —el medidor decía 0 mientras el grupo tenía las cuatro—.
 */
const SQL = `
with candidatas as (
  select te.id, te.phase_group_id, te.nombre_en_fuente, te.codigo_externo, te.metodo_resolucion,
         core.normaliza_nombre(te.nombre_en_fuente) as norm,
         (select count(*) from core.match m where m.home_team_entry_id = te.id or m.away_team_entry_id = te.id) as partidos
    from core.team_entry te
)
select pg.codigo_externo as grupo, pg.nombre as fase, e.nombre_publicado as competicion,
       s.etiqueta as temporada, f.nombre as federacion,
       mala.nombre_en_fuente as nombre_sin_sufijo, mala.partidos as partidos_sin_sufijo,
       buena.nombre_en_fuente as nombre_con_sufijo, buena.codigo_externo as codigo, buena.partidos as partidos_con_sufijo
  from candidatas mala
  join candidatas buena
    on buena.phase_group_id = mala.phase_group_id
   and buena.codigo_externo is not null
   and buena.norm ~ ' [a-d]$'
   and regexp_replace(buena.norm, ' [a-d]$', '') = mala.norm
  join core.phase_group pg on pg.id = mala.phase_group_id
  join core.competition_edition e on e.id = pg.competition_edition_id
  join core.season s on s.id = e.season_id
  join core.federation f on f.id = e.federation_id
 where mala.codigo_externo is null
   and ($1::text is null or f.codigo = $1)
 order by f.nombre, s.etiqueta, pg.codigo_externo, mala.nombre_en_fuente`;

const cliente = new Client({ connectionString: url });
await cliente.connect();
const { rows } = await cliente.query(SQL, [federacionPedida]);
const { rows: sinPartidos } = await cliente.query(
  `select count(*)::int n from core.team_entry te
    where not exists (select 1 from core.match m where m.home_team_entry_id = te.id or m.away_team_entry_id = te.id)`);
await cliente.end();

const porFederacion = new Map();
for (const r of rows) porFederacion.set(r.federacion, (porFederacion.get(r.federacion) ?? 0) + 1);
const salida = {
  cuando: new Date().toISOString(),
  resumen: {
    parejas: rows.length,
    grupos: new Set(rows.map((r) => `${r.federacion}|${r.temporada}|${r.grupo}`)).size,
    federaciones: [...porFederacion.keys()],
    inscripcionesSinNingunPartido: sinPartidos[0].n,
  },
  parejas: rows,
};
writeFileSync(SALIDA, `${JSON.stringify(salida, null, 1)}\n`, 'utf8');

if (quiereJson) {
  console.log(JSON.stringify(salida, null, 1));
} else {
  console.log('IDENTIDADES PARTIDAS · la misma pareja con dos inscripciones en el mismo grupo');
  console.log(`  ${rows.length} pareja(s) en ${salida.resumen.grupos} grupo(s) · `
    + `federaciones: ${salida.resumen.federaciones.join(', ') || '(ninguna)'}`);
  console.log(`  inscripciones sin ningún partido en todo el canónico: ${sinPartidos[0].n}`);
  for (const r of rows.slice(0, 12)) {
    console.log(`    · ${r.federacion} ${r.temporada} ${r.grupo} (${r.competicion}): `
      + `«${r.nombre_sin_sufijo}» (${r.partidos_sin_sufijo} partidos) frente a `
      + `«${r.nombre_con_sufijo}» (código ${r.codigo}, ${r.partidos_con_sufijo} partidos)`);
  }
  if (rows.length > 12) console.log(`    … y ${rows.length - 12} más (todas en el JSON)`);
  console.log(`\n  anotado en ${SALIDA.replace(`${RAIZ}\\`, '')}`);
  if (rows.length > 0) console.log('  para arreglarlo: node scripts/fusiona-inscripciones-partidas.mjs');
}
