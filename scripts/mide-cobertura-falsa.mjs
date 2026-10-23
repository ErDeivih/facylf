#!/usr/bin/env node
/*
 * MIDE LOS GRUPOS CUYA COBERTURA MIENTE: se declaran «completa` con muchos menos partidos de los que pide una
 * liga regular.
 *
 * Por qué. `ops.coverage_checkpoint` es la tabla que LEE la web para poner la insignia de estado, y hasta el
 * 25/09/2026 el cálculo de «completa hasta la jornada N» recorría sólo las jornadas PRESENTES: un grupo con la
 * jornada 30 y nada más —8 partidos de 240— salía `visibility_state = 'completa'` y `complete_through_matchday
 * = 30`. La ausencia se leía como «no hay más partidos», que es justo lo que el canónico no debe permitir.
 * El cálculo está arreglado en `packages/canonico/src/lote.ts` (la cadena empieza en la jornada 1 y se rompe
 * en la primera que falte o esté incompleta), pero las filas YA escritas siguen diciendo lo que decían.
 *
 * Esta herramienta no escribe: mide cuántas quedan y dónde, para poder reimportar esos grupos o recalcular su
 * cobertura sabiendo cuáles son. Escribe `pruebas/reconstruccion/cobertura-falsa.json`.
 *
 * Uso:
 *   node scripts/mide-cobertura-falsa.mjs
 *   node scripts/mide-cobertura-falsa.mjs --federacion cataluna --json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// `pg` vive en el paquete canónico, no en la raíz: desde `scripts/` se resuelve por su package.json.
const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const { Client } = requerir('pg');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'cobertura-falsa.json');

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
 * Los partidos que pide una liga regular: la mitad de los equipos del grupo por cada jornada prevista. Se
 * compara con lo que hay y se marca el grupo cuando no llega ni al 80 % —un margen para las ligas con
 * descansos y los grupos a los que les falta un partido suelto—.
 *
 * SÓLO ligas (`pg.tipo = 'liga'`): en una copa la fórmula no aplica y salen falsos positivos de verdad.
 * Medido el 25/09/2026: «La Nostra Copa» de Valencia, con 307 equipos y 7 jornadas previstas, encabezaba la
 * lista midiendo 303 partidos contra 1.071 «esperados». Un instrumento que exagera el daño no sirve.
 */
const SQL = `
with datos as (
  select pg.id, pg.codigo_externo as grupo, pg.nombre as fase, pg.jornadas_previstas, pg.tipo,
         cc.visibility_state, cc.complete_through_matchday, cc.partidos_conocidos, cc.partidos_esperados,
         cc.jornadas_descubiertas, cc.calculado_en,
         (select count(*)::int from core.team_entry te where te.phase_group_id = pg.id) as equipos,
         (select count(*)::int from core.match m where m.phase_group_id = pg.id) as partidos,
         f.nombre as federacion, f.codigo as federacion_codigo, s.etiqueta as temporada,
         e.nombre_publicado as competicion
    from core.phase_group pg
    join core.competition_edition e on e.id = pg.competition_edition_id
    join core.season s on s.id = e.season_id
    join core.federation f on f.id = e.federation_id
    left join ops.coverage_checkpoint cc on cc.phase_group_id = pg.id
   where ($1::text is null or f.codigo = $1)
)
select *, floor(equipos / 2.0) * jornadas_previstas as partidos_de_liga_regular
  from datos
 where tipo = 'liga' and visibility_state = 'completa' and equipos >= 4 and jornadas_previstas is not null
   and partidos < 0.8 * floor(equipos / 2.0) * jornadas_previstas
 order by (0.8 * floor(equipos / 2.0) * jornadas_previstas - partidos) desc`;

const cliente = new Client({ connectionString: url });
await cliente.connect();
const { rows } = await cliente.query(SQL, [federacionPedida]);
const { rows: totales } = await cliente.query(
  `select count(*) filter (where visibility_state = 'completa')::int completos,
          count(*)::int grupos
     from core.phase_group pg
     left join ops.coverage_checkpoint cc on cc.phase_group_id = pg.id
    where ($1::text is null or exists (
            select 1 from core.competition_edition e join core.federation f on f.id = e.federation_id
             where e.id = pg.competition_edition_id and f.codigo = $1))`, [federacionPedida]);
await cliente.end();

const porFederacion = new Map();
for (const r of rows) {
  const clave = `${r.federacion} ${r.temporada}`;
  porFederacion.set(clave, (porFederacion.get(clave) ?? 0) + 1);
}
const salida = {
  cuando: new Date().toISOString(),
  resumen: {
    gruposDeclaradosCompletos: totales[0].completos,
    gruposTotales: totales[0].grupos,
    sospechosos: rows.length,
    porFederacionYTemporada: [...porFederacion.entries()].map(([clave, n]) => ({ clave, grupos: n })).sort((a, b) => b.grupos - a.grupos),
  },
  grupos: rows,
};
writeFileSync(SALIDA, `${JSON.stringify(salida, null, 1)}\n`, 'utf8');

if (quiereJson) {
  console.log(JSON.stringify(salida, null, 1));
} else {
  const r = salida.resumen;
  console.log('COBERTURA QUE MIENTE · grupos «completa» con menos del 80 % de los partidos de una liga regular');
  console.log(`  ${r.gruposDeclaradosCompletos} grupo(s) declarados completos de ${r.gruposTotales} · `
    + `${r.sospechosos} no pueden estarlo`);
  for (const f of r.porFederacionYTemporada.slice(0, 12)) {
    console.log(`    ${String(f.grupos).padStart(5)} · ${f.clave}`);
  }
  if (r.porFederacionYTemporada.length > 12) {
    console.log(`    … y ${r.porFederacionYTemporada.length - 12} federación-temporada más (todas en el JSON)`);
  }
  console.log('\n  los peores, de más partidos ausentes a menos:');
  for (const g of rows.slice(0, 8)) {
    console.log(`    g${String(g.grupo).padEnd(10)} ${g.federacion.slice(0, 28).padEnd(28)} ${g.competicion.slice(0, 22).padEnd(22)} `
      + `${String(g.partidos).padStart(4)} partidos de ${g.partidos_de_liga_regular} · ${g.equipos} equipos · `
      + `se declara hasta la J${g.complete_through_matchday}`);
  }
  console.log(`\n  anotado en ${SALIDA.replace(`${RAIZ}\\`, '')}`);
  console.log('  para arreglarlo, reimportar esos grupos; el cálculo ya está corregido en packages/canonico/src/lote.ts');
}
