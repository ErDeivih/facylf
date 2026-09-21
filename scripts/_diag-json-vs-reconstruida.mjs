#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿la fila «A» del JSON es el equipo «B» de la cola?
 *
 * Es la prueba que decide si se puede resolver por nombre de club (sin la letra final) o si eso sería
 * inventar. Se compara CADA fila de la tabla oficial con la clasificación reconstruida del canónico
 * para ese mismo grupo: si el registro (jugados, ganados, empatados, perdidos) coincide equipo a
 * equipo bajo la correspondencia por nombre de club, la correspondencia queda demostrada.
 *
 * Uso: node scripts/_diag-json-vs-reconstruida.mjs <federacion> <etiqueta> <grupo> <rutaJson>
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [federacion, etiqueta, grupo, rutaJsonArg] = process.argv.slice(2);
const raiz = resolve(import.meta.dirname, '..');
process.loadEnvFile(join(raiz, '.env'));
const { creaPool } = await import('../packages/canonico/src/destino/pool.ts');

const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sinLetra = (s) => normaliza(s).replace(/\s+[a-z]$/, '');

const rutaJson = rutaJsonArg ?? join(raiz, `descargas-${federacion}`, 'recolector-local');
if (!existsSync(rutaJson)) { console.error(`no existe ${rutaJson}`); process.exit(1); }
const tabla = JSON.parse(readFileSync(rutaJson, 'utf8'));

const pool = creaPool();
const cliente = await pool.connect();
const { rows } = await cliente.query(
  `select te.nombre_en_fuente as equipo, s.jugados, s.ganados, s.empatados, s.perdidos, s.puntos
     from core.standing_snapshot s
     join core.team_entry te on te.id = s.team_entry_id
     join core.phase_group pg on pg.id = s.phase_group_id
    where s.origen = 'reconstruida' and pg.codigo_externo = $1
    order by s.posicion`, [grupo]);
cliente.release();
await pool.end();

console.log(`grupo ${grupo} (${etiqueta}): ${tabla.length} filas oficiales · ${rows.length} filas reconstruidas\n`);
const reconPorBase = new Map();
for (const r of rows) reconPorBase.set(sinLetra(r.equipo), r);
const reconPorNombre = new Map(rows.map((r) => [normaliza(r.equipo), r]));

console.log('oficial (json)                          | reconstruida (canónico)                 | J  G-E-P        | puntos | veredicto');
let identicos = 0, soloPuntos = 0, distintos = 0, sinPar = 0;
for (const fila of tabla) {
  const exacta = reconPorNombre.get(normaliza(fila.equipo));
  const porBase = reconPorBase.get(sinLetra(fila.equipo));
  const rec = exacta ?? porBase;
  const via = exacta ? 'nombre' : (porBase ? 'club sin letra' : '—');
  const registro = `${fila.jugados} ${fila.ganados}-${fila.empatados}-${fila.perdidos}`;
  const recRegistro = rec ? `${rec.jugados} ${rec.ganados}-${rec.empatados}-${rec.perdidos}` : '—';
  let veredicto;
  if (!rec) { veredicto = 'SIN PAR'; sinPar++; }
  else if (rec.jugados === fila.jugados && rec.ganados === fila.ganados && rec.empatados === fila.empatados && rec.perdidos === fila.perdidos) {
    if (rec.puntos === fila.puntos) { veredicto = `idéntica (${via})`; identicos++; }
    else { veredicto = `mismo registro, puntos ${fila.puntos} vs ${rec.puntos} (${via})`; soloPuntos++; }
  } else { veredicto = `DISTINTA (${via})`; distintos++; }
  console.log(`${String(fila.equipo).slice(0, 39).padEnd(39)} | ${String(rec?.equipo ?? '—').slice(0, 39).padEnd(39)} | ${registro.padEnd(15)} | ${String(fila.puntos).padStart(3)}/${String(rec?.puntos ?? '—').padStart(3)} | ${veredicto}`);
}
console.log(`\nidénticas: ${identicos} · mismo registro con puntos distintos: ${soloPuntos} · distintas: ${distintos} · sin par: ${sinPar}`);
