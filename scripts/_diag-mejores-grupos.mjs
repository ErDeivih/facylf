#!/usr/bin/env node
/**
 * SÓLO LECTURA: los mejores grupos importables de una federación, en TODAS sus temporadas.
 *
 * Ordena por actas completas (lo que de verdad permite publicar cobertura) y descarta los grupos que
 * detendrían el lote porque el calendario y el acta no comparten ningún equipo.
 *
 * Uso: node scripts/_diag-mejores-grupos.mjs <federacion> [n]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const federacion = process.argv[2];
const n = Number(process.argv[3] ?? 5);
if (!federacion) { console.error('Uso: node scripts/_diag-mejores-grupos.mjs <federacion> [n]'); process.exit(1); }

const raiz = resolve(import.meta.dirname, '..');
const carpeta = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const ruta = join(raiz, carpeta, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) { console.error(`${federacion}: no existe ${ruta}`); process.exit(0); }

const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const db = new DatabaseSync(ruta, { readOnly: true });
const grupos = db.prepare(`select g.temporada, t.etiqueta, g.competicion, c.nombre as competicion_nombre, g.codigo, g.nombre,
    (select count(*) from partidos p where p.temporada=g.temporada and p.competicion=g.competicion and p.grupo=g.codigo) partidos,
    (select count(*) from partidos p where p.temporada=g.temporada and p.competicion=g.competicion and p.grupo=g.codigo and p.goles_local is not null) con_resultado,
    (select count(*) from actas a where a.temporada=g.temporada and a.competicion=g.competicion and a.grupo=g.codigo) actas,
    (select count(*) from actas a where a.temporada=g.temporada and a.competicion=g.competicion and a.grupo=g.codigo and a.estado='hecha') hechas
  from grupos g
  join temporadas t on t.codigo=g.temporada
  left join competiciones c on c.temporada=g.temporada and c.codigo=g.competicion
 order by 9 desc, 7 desc`)
  .all()
  .filter((g) => g.hechas > 0 && g.con_resultado > 0);

console.log(`${federacion}: ${grupos.length} grupos con actas hechas y resultados. Mejores ${n} sin bloqueo:\n`);
console.log('temporada  grupo       partidos res.  actas hechas  otro  fuga  competición');
let mostrados = 0;
for (const g of grupos) {
  if (mostrados >= n) break;
  const ac = db.prepare(`select a.codigo, a.datos, p.local plocal, p.visitante pvisitante
    from actas a join partidos p on p.temporada=a.temporada and p.competicion=a.competicion
      and p.grupo=a.grupo and p.codigo_acta=a.codigo
    where a.temporada=? and a.competicion=? and a.grupo=? and a.datos is not null and a.estado='hecha'`)
    .all(g.temporada, g.competicion, g.codigo);
  // Cinturón de seguridad: mirar sólo una muestra de 400 actas basta para decidir, y evita recorrer
  // decenas de miles de filas por grupo en una federación grande.
  const nombres = new Set(db.prepare(`select distinct local n from partidos where temporada=? and competicion=? and grupo=?
      union select distinct visitante from partidos where temporada=? and competicion=? and grupo=?`)
    .all(g.temporada, g.competicion, g.codigo, g.temporada, g.competicion, g.codigo).map((f) => normaliza(f.n)));
  let otro = 0, fuga = 0;
  for (const f of ac.slice(0, 400)) {
    let d; try { d = JSON.parse(f.datos); } catch { continue; }
    if (!d?.local || !d?.visitante) continue;
    if (!nombres.has(normaliza(d.local)) || !nombres.has(normaliza(d.visitante))) continue;
    const cL = normaliza(f.plocal), cV = normaliza(f.pvisitante), aL = normaliza(d.local), aV = normaliza(d.visitante);
    if (cL === aL && cV === aV) continue;
    if (cL === aV && cV === aL) continue;
    if (cV === aL && cL !== aL && cL !== aV) fuga++;
    else otro++;
  }
  mostrados++;
  console.log(`${String(g.etiqueta).padEnd(10)} ${String(g.codigo).padEnd(11)} ${String(g.partidos).padStart(8)} ${String(g.con_resultado).padStart(5)} ${String(g.hechas).padStart(6)} ${String(otro).padStart(7)} ${String(fuga).padStart(5)}  ${g.competicion_nombre ?? '?'} · ${g.nombre}${otro > 0 ? '  ← NO importable' : ''}`);
}
db.close();
