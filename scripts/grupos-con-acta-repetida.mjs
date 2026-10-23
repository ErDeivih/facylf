#!/usr/bin/env node
/*
 * GRUPOS DEL CANÓNICO CUYO CALENDARIO ESTÁ INVENTADO, Y CUÁNTO DATO DE JUGADOR ARRASTRAN.
 *
 * Por qué existe esto. El recolector de Cataluña repetía la misma jornada en todas las demás (§3.11 de la
 * guía), y el importador escribió esos partidos. La huella queda en el canónico y es fácil de leer: en
 * `core.match_source.codigo_acta` está el acta que respalda cada partido, así que **si un grupo tiene muchos
 * más partidos que códigos de acta distintos, esos partidos son copias**. En una liga de verdad cada partido
 * tiene su acta: la proporción es 1.
 *
 * Medido el 24/09/2026 en el grupo catalán 58161925: 306 partidos, 34 jornadas, **9 parejas distintas y 9
 * códigos de acta**, 1.083 apariciones. La misma acta escrita en 34 partidos, y las apariciones de sus
 * jugadores contadas varias veces.
 *
 * Para qué sirve la cifra: para saber CUÁNTO hay que rehacer. Un informe sobre un equipo de esos grupos no
 * puede contar partidos ni enfrentamientos, y sus totales de jugador están inflados. Antes de decir «el
 * canónico está completo» hay que saber cuántos grupos son estos.
 *
 * Es de SÓLO LECTURA.
 *
 * Uso:
 *   node scripts/grupos-con-acta-repetida.mjs                 · resumen por federación y los peores casos
 *   node scripts/grupos-con-acta-repetida.mjs --umbral 1.5    · proporción a partir de la cual se sospecha
 *   node scripts/grupos-con-acta-repetida.mjs --todos         · la lista entera, en JSON
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const umbral = Number(arg('umbral') ?? 1.5);
const todos = argumentos.includes('--todos');

const rutaEnv = join(RAIZ, '.env');
try { process.loadEnvFile(rutaEnv); } catch { /* sin .env no hay a dónde preguntar */ }
const url = (process.env.DATABASE_URL_LECTOR ?? '').trim();
if (url === '') { console.error('Falta DATABASE_URL_LECTOR.'); process.exit(1); }

const cliente = new Client({ connectionString: url, statement_timeout: 300_000 });
await cliente.connect();

/*
 * Un grupo entra en la lista si tiene partidos, tiene actas citadas y la proporción partidos/actas distintas
 * pasa del umbral.
 *
 * ── DOS SEÑALES, Y NO VALEN LO MISMO ─────────────────────────────────────────────────────────────────────
 *
 * La proporción de actas es una SOSPECHA, no una prueba: hay competiciones que publican **un acta por jornada
 * que cubre varios partidos** (fútbol sala, actas de jornada completa), y ahí la proporción es alta sin que
 * haya nada inventado. Medido el 24/09/2026: por proporción salen 228 grupos, pero por la huella exacta del
 * defecto —**todas las jornadas con las mismas parejas** (`parejas × jornadas = partidos`), que no lo produce
 * ninguna liga— salen 186 catalanes y 3 de grupos mínimos.
 *
 * Por eso se calculan las dos y cada grupo se etiqueta:
 *   · `confirmado`   — cumple la huella: el calendario está repetido, esto no es una liga;
 *   · `sospechoso`   — sólo la proporción: puede ser un acta que cubre varios partidos. Hay que mirarlo.
 * Las apariciones que arrastran se cuentan aparte, porque sólo las del primer grupo están claramente infladas.
 */
const { rows } = await cliente.query(`
  with porGrupo as (
    select f.codigo as federacion, s.etiqueta as temporada, pg.codigo_externo as grupo, pg.id as grupo_id,
           count(distinct m.id) as partidos,
           count(distinct m.matchday_id) as jornadas,
           count(distinct (least(m.home_team_entry_id, m.away_team_entry_id),
                           greatest(m.home_team_entry_id, m.away_team_entry_id))) as parejas,
           count(distinct ms.codigo_acta) as actas_distintas
      from core.phase_group pg
      join core.competition_edition ce on ce.id = pg.competition_edition_id
      join core.federation f on f.id = ce.federation_id
      join core.season s on s.id = ce.season_id
      join core.match m on m.phase_group_id = pg.id
      join core.match_source ms on ms.match_id = m.id
     where pg.codigo_externo is not null
     group by 1, 2, 3, 4
  ), sospechosos as (
    /*
     * confirmado son DOS formas de imposible, y las dos se comprobaron contra datos reales:
     *   · todas las jornadas con las mismas parejas (parejas x jornadas = partidos), la huella exacta del
     *     defecto de copia;
     *   · más de cuatro partidos por pareja, que no lo hace ninguna liga ni a cuatro vueltas. Es lo que
     *     delata a los 41 grupos que repetían DOS jornadas en vez de una (240 partidos, 16 parejas).
     */
    select *, partidos::numeric / actas_distintas as proporcion,
           (jornadas > 1 and parejas * jornadas = partidos) or (partidos > 4 * parejas) as confirmado
      from porGrupo
     where actas_distintas > 0 and partidos::numeric / actas_distintas >= $1
  )
  select s.federacion, s.temporada, s.grupo, s.partidos, s.jornadas, s.parejas, s.actas_distintas,
         round(s.proporcion, 1) as por_acta, s.confirmado,
         (select count(*) from core.appearance a join core.match m on m.id = a.match_id
           where m.phase_group_id = s.grupo_id) as apariciones,
         (select count(distinct a.person_id) from core.appearance a join core.match m on m.id = a.match_id
           where m.phase_group_id = s.grupo_id) as personas
    from sospechosos s order by s.confirmado desc, s.proporcion desc, s.partidos desc`, [umbral]);

const porFederacion = new Map();
let apariciones = 0;
let partidos = 0;
let confirmados = 0;
let confirmadosApariciones = 0;
for (const r of rows) {
  const f = porFederacion.get(r.federacion) ?? { grupos: 0, confirmados: 0, partidos: 0, apariciones: 0 };
  f.grupos += 1;
  f.partidos += Number(r.partidos);
  f.apariciones += Number(r.apariciones);
  if (r.confirmado) { f.confirmados += 1; confirmados += 1; confirmadosApariciones += Number(r.apariciones); }
  porFederacion.set(r.federacion, f);
  apariciones += Number(r.apariciones);
  partidos += Number(r.partidos);
}

console.log(`grupos sospechosos (partidos / actas distintas ≥ ${umbral}): ${rows.length}`);
console.log(`  arrastran ${partidos.toLocaleString('es-ES')} partidos y ${apariciones.toLocaleString('es-ES')} apariciones`);
console.log(`  de ellos, CONFIRMADOS por la huella (todas las jornadas con las mismas parejas): ${confirmados} grupos, `
  + `${confirmadosApariciones.toLocaleString('es-ES')} apariciones`);
console.log('');
console.log(`  ${'federación'.padEnd(20)} ${'sospechosos'.padStart(11)} ${'confirmados'.padStart(12)} ${'partidos'.padStart(9)} ${'apariciones'.padStart(12)}`);
for (const [federacion, f] of [...porFederacion].sort((a, b) => b[1].confirmados - a[1].confirmados || b[1].grupos - a[1].grupos)) {
  console.log(`  ${federacion.padEnd(20)} ${String(f.grupos).padStart(11)} ${String(f.confirmados).padStart(12)} `
    + `${String(f.partidos).padStart(9)} ${String(f.apariciones).padStart(12)}`);
}
console.log('\nlos peores confirmados (los que más partidos falsos tienen):');
for (const r of rows.filter((x) => x.confirmado).slice(0, 10)) {
  console.log(`  ${r.temporada} ${r.federacion.padEnd(12)} g${String(r.grupo).padEnd(10)} `
    + `${String(r.partidos).padStart(4)} partidos · ${String(r.jornadas).padStart(3)} jornadas · `
    + `sólo ${String(r.parejas).padStart(3)} parejas y ${String(r.actas_distintas).padStart(3)} actas · `
    + `${r.por_acta} partidos por acta · ${r.apariciones} apariciones`);
}
const soloSospechosos = rows.filter((x) => !x.confirmado);
if (soloSospechosos.length > 0) {
  console.log(`\nlos ${soloSospechosos.length} que SÓLO son sospechosos (aquí puede haber actas que cubren varios`);
  console.log('partidos sin que haya nada inventado: hay que mirarlos antes de tocar nada):');
  for (const r of soloSospechosos.slice(0, 10)) {
    console.log(`  ${r.temporada} ${r.federacion.padEnd(12)} g${String(r.grupo).padEnd(10)} `
      + `${String(r.partidos).padStart(4)} partidos · ${String(r.jornadas).padStart(3)} jornadas · `
      + `${String(r.parejas).padStart(3)} parejas · ${String(r.actas_distintas).padStart(3)} actas · ${r.por_acta} por acta`);
  }
}

const destino = join(RAIZ, 'pruebas', 'reconstruccion', 'grupos-con-acta-repetida.json');
writeFileSync(destino, `${JSON.stringify({ cuando: new Date().toISOString(), umbral,
  grupos: rows.length, confirmados, partidos, apariciones, confirmadosApariciones,
  porFederacion: Object.fromEntries(porFederacion),
  lista: todos ? rows : rows.slice(0, 200) }, null, 2)}\n`);
console.log(`\n  la lista en pruebas/reconstruccion/grupos-con-acta-repetida.json${todos ? '' : ' (los 200 peores; usa --todos para la entera)'}`);
await cliente.end();
