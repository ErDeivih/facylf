#!/usr/bin/env node
/*
 * grupos-pareja-repetida.mjs — SÓLO LEE. Busca grupos cuyo calendario es UN solo partido entre los MISMOS dos
 * equipos repetido jornada tras jornada (una jornada = un partido, como mucho dos parejas, ninguna acta).
 *
 * Por qué existe: en La Rioja, las ligas nacionales (2ª B, 3ª…) se publican con los rivales de fuera pintados
 * como «Descansa»; sólo los equipos riojanos llevan enlace. Con dos riojanos en el grupo, el extractor clásico
 * leía la tabla EXTERIOR (que junta los dos enlaces) como si fuera un partido, y cada jornada salía
 * «S.D. Logroñés - U.D. Logroñés». 15 grupos de Rioja (petición 151, 16/10/2026). Arreglado en
 * `extraePartidos` (scripts/lib/recolector-local.mjs). Este guion dice qué grupos hay que REPROCESAR (sin red)
 * en cada cola y escribe la orden exacta.
 *
 * Uso:   node scripts/claude/grupos-pareja-repetida.mjs [federación…]     (FACYLF_RAIZ=/app por defecto)
 * En el servidor: docker exec -e FACYLF_RAIZ=/app facylf-monitor node /app/scripts/claude/grupos-pareja-repetida.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const pedidas = process.argv.slice(2);
const carpetas = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
  .filter((n) => !/prueba|sondeo|multideporte/.test(n))
  .filter((n) => !pedidas.length || pedidas.some((p) => n === `descargas-${p}` || (p === 'castilla-leon' && n === 'descargas-federacion')))
  .sort();

let total = 0;
for (const carpeta of carpetas) {
  const ruta = join(RAIZ, carpeta, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  let db;
  try {
    db = new DatabaseSync(`file:${ruta}?immutable=1`, { readOnly: true });
  } catch (e) { console.log(`${carpeta}: no se pudo abrir (${e.message})`); continue; }
  try {
    const filas = db.prepare(`select temporada, competicion, grupo, count(*) partidos, count(distinct jornada) jornadas,
        count(distinct local||'|'||visitante) parejas, count(codigo_acta) actas, min(local) l, min(visitante) v
      from partidos group by temporada, competicion, grupo
      having count(*) >= 4 and count(*) = count(distinct jornada) and count(codigo_acta) = 0
        and count(distinct local||'|'||visitante) <= 2`).all();
    const fed = carpeta === 'descargas-federacion' ? 'castilla-leon' : carpeta.replace('descargas-', '');
    console.log(`${fed}: ${filas.length} grupos sospechosos`);
    for (const f of filas) {
      total++;
      console.log(`  t${f.temporada} c${f.competicion} g${f.grupo}: ${f.partidos} jornadas con 1 partido · ${f.parejas} parejas · «${f.l} - ${f.v}»`);
      console.log(`     reprocesar: node scripts/recolector-local.mjs reprocesar --temporada ${f.temporada} --competicion ${f.competicion} --grupo ${f.grupo}`);
    }
  } catch (e) {
    console.log(`${carpeta}: error (${e.message}) — si dice «malformed», la cola se estaba escribiendo: repetir.`);
  } finally { db.close(); }
}
console.log(`TOTAL: ${total} grupos.`);
