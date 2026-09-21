#!/usr/bin/env node
/**
 * Medición de SÓLO LECTURA: desacuerdos calendario ↔ acta **sólo en los grupos ya importados** al
 * canónico. Es el alcance que hoy puede estar mal en la web.
 *
 * Uso: node scripts/_diag-desacuerdos-importados.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve, join } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');
// El `.env` del proyecto no se carga solo fuera de la CLI: aquí se lee a mano para no depender de nada.
const { readFileSync, existsSync: existe } = await import('node:fs');
for (const linea of readFileSync(join(raiz, '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linea);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { canonicoDisponible, creaPool } = await import('../packages/canonico/src/destino/pool.ts');

if (!(await canonicoDisponible(process.env))) {
  console.log('no hay canónico disponible; se omite');
  process.exit(0);
}
const pool = creaPool(process.env);
const cliente = await pool.connect();
const { rows } = await cliente.query(
  `select f.codigo as federacion, s.etiqueta as temporada, pg.codigo_externo as grupo,
          ce.codigo_externo as competicion, pg.id
     from core.phase_group pg
     join core.competition_edition ce on ce.id = pg.competition_edition_id
     join core.season s on s.id = ce.season_id
     join core.federation f on f.id = ce.federation_id
    order by 1, 2, 4`);
cliente.release();

const carpeta = (federacion) => federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const porCola = new Map();
for (const g of rows) {
  const clave = g.federacion;
  if (!porCola.has(clave)) porCola.set(clave, []);
  porCola.get(clave).push(g);
}

let totalFuga = 0, totalOtro = 0, totalInvertido = 0;
console.log('federación            temporada  grupo       actas  fuga  invertido  otro  veredicto');
for (const [federacion, grupos] of porCola) {
  const ruta = join(raiz, carpeta(federacion), 'recolector-local', 'cola-v2.sqlite');
  const { existsSync } = await import('node:fs');
  if (!existsSync(ruta)) { console.log(`${federacion}: sin cola en ${ruta}`); continue; }
  const db = new DatabaseSync(ruta, { readOnly: true });
  for (const g of grupos) {
    // La cola indexa por el código interno de temporada: se resuelve por la etiqueta, que sí es comparable.
    const t = db.prepare('select codigo from temporadas where etiqueta = ?').get(g.temporada);
    if (!t) { console.log(`${federacion} ${g.temporada} grupo ${g.grupo}: temporada no encontrada en la cola`); continue; }
    const filas = db.prepare(`select a.codigo, a.datos, p.jornada, p.orden, p.local as plocal, p.visitante as pvisitante
      from actas a join partidos p on p.temporada=a.temporada and p.competicion=a.competicion
        and p.grupo=a.grupo and p.codigo_acta=a.codigo
      where a.temporada=? and a.competicion=? and a.grupo=? and a.datos is not null`)
      .all(t.codigo, g.competicion, g.grupo);
    let fuga = 0, invertido = 0, otro = 0;
    const detalles = [];
    for (const f of filas) {
      let d; try { d = JSON.parse(f.datos); } catch { continue; }
      if (!d?.local || !d?.visitante) continue;
      const cL = normaliza(f.plocal), cV = normaliza(f.pvisitante), aL = normaliza(d.local), aV = normaliza(d.visitante);
      if (cL === aL && cV === aV) continue;
      if (cV === aL && cL !== aV) { fuga++; detalles.push(`J${f.jornada} ord ${f.orden} acta ${f.codigo}: ${f.plocal} vs ${f.pvisitante} → debería ser ${d.local} vs ${d.visitante}`); }
      else if (cL === aV && cV === aL) invertido++;
      else { otro++; detalles.push(`J${f.jornada} ord ${f.orden} acta ${f.codigo}: ${f.plocal} vs ${f.pvisitante} · acta ${d.local} vs ${d.visitante}`); }
    }
    totalFuga += fuga; totalInvertido += invertido; totalOtro += otro;
    const mal = fuga + invertido + otro;
    console.log(`${federacion.padEnd(20)} ${g.temporada.padEnd(10)} ${String(g.grupo).padEnd(11)} ${String(filas.length).padStart(5)} ${String(fuga).padStart(5)} ${String(invertido).padStart(9)} ${String(otro).padStart(5)}  ${mal ? '⚠ REVISAR' : 'ok'}`);
    if (mal) for (const d of detalles.slice(0, 12)) console.log(`        · ${d}`);
  }
  db.close();
}
console.log(`\nTOTAL en grupos importados: fuga ${totalFuga} · invertido ${totalInvertido} · otro ${totalOtro}`);
await pool.end?.();
