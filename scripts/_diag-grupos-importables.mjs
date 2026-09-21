#!/usr/bin/env node
/**
 * SÓLO LECTURA: qué grupos de una federación se pueden importar sin sorpresas.
 *
 * Para cada grupo con datos informa de su tamaño y de lo que el importador va a encontrarse:
 *
 *   · `otro`   → el calendario y el acta no hablan ni de los mismos equipos. **Detiene el lote**, así
 *                que ese grupo no se importa hasta revisar la fuente.
 *   · `fuga`   → el equipo que descansaba se coló como local. El acta manda y se repara, dejando
 *                constancia. Importable.
 *   · `inv.`   → el campo está invertido. Se repara. Importable.
 *   · `sinRes` → el acta nombra equipos que el grupo no resuelve. No se corrige; se registra.
 *
 * Uso: node scripts/_diag-grupos-importables.mjs <federacion> <etiqueta> [--min-partidos N] [--ambito TEXTO]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [federacion, etiqueta] = process.argv.slice(2);
if (!federacion || !etiqueta) {
  console.error('Uso: node scripts/_diag-grupos-importables.mjs <federacion> <etiqueta> [--min-partidos N] [--ambito TEXTO]');
  process.exit(1);
}
const arg = (nombre, pordefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : pordefecto;
};
const minPartidos = Number(arg('min-partidos', 0));
const ambito = (arg('ambito', '') ?? '').toUpperCase();

const raiz = resolve(import.meta.dirname, '..');
const carpeta = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const ruta = join(raiz, carpeta, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) { console.error(`No existe la cola: ${ruta}`); process.exit(1); }

const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const db = new DatabaseSync(ruta, { readOnly: true });
const temporada = db.prepare('select codigo from temporadas where etiqueta = ?').get(etiqueta);
if (!temporada) {
  console.error(`La cola no tiene la temporada ${etiqueta}. Tiene: ${db.prepare('select etiqueta from temporadas order by cast(codigo as integer) desc limit 8').all().map((t) => t.etiqueta).join(', ')}`);
  process.exit(1);
}

const competiciones = db.prepare(`select c.codigo, c.nombre,
    (select count(*) from grupos g where g.temporada=c.temporada and g.competicion=c.codigo) grupos,
    (select count(*) from partidos p where p.temporada=c.temporada and p.competicion=c.codigo) partidos,
    (select count(*) from actas a where a.temporada=c.temporada and a.competicion=c.codigo and a.estado='hecha') actas
  from competiciones c where c.temporada = ? order by 4 desc`).all(temporada.codigo)
  .filter((c) => !ambito || normaliza(c.nombre).includes(normaliza(ambito)));

console.log(`${federacion} · temporada ${etiqueta} (código interno ${temporada.codigo}) · ${competiciones.length} competiciones`
  + (ambito ? ` que contienen «${ambito}»` : ''));
console.log('\ncompetición   partidos  actas  grupos  nombre');
for (const c of competiciones.slice(0, 40)) {
  console.log(`${String(c.codigo).padEnd(13)} ${String(c.partidos).padStart(8)} ${String(c.actas).padStart(6)} ${String(c.grupos).padStart(7)}  ${c.nombre}`);
}

/* Grupos con datos suficientes, con el desglose de desacuerdos calendario ↔ acta. */
const filas = db.prepare(`select g.competicion, g.codigo, g.nombre, c.nombre as competicion_nombre,
    (select count(*) from partidos p where p.temporada=g.temporada and p.competicion=g.competicion and p.grupo=g.codigo) partidos,
    (select count(*) from partidos p where p.temporada=g.temporada and p.competicion=g.competicion and p.grupo=g.codigo and p.goles_local is not null) con_resultado,
    (select count(*) from actas a where a.temporada=g.temporada and a.competicion=g.competicion and a.grupo=g.codigo and a.estado='hecha') actas
  from grupos g join competiciones c on c.temporada=g.temporada and c.codigo=g.competicion
 where g.temporada = ?
 order by 5 desc`).all(temporada.codigo)
  .filter((g) => g.partidos >= minPartidos && (!ambito || normaliza(g.competicion_nombre).includes(normaliza(ambito))));

console.log(`\n${filas.length} grupos con al menos ${minPartidos} partidos` + (ambito ? ` y ámbito «${ambito}»` : '') + ':');
console.log('grupo       partidos  res.  actas   otro  fuga  inv.  sinRes  competición');
const candidatos = [];
for (const g of filas) {
  const ac = db.prepare(`select a.codigo, a.datos, p.jornada, p.orden, p.local plocal, p.visitante pvisitante
    from actas a join partidos p on p.temporada=a.temporada and p.competicion=a.competicion
      and p.grupo=a.grupo and p.codigo_acta=a.codigo
    where a.temporada=? and a.competicion=? and a.grupo=? and a.datos is not null`)
    .all(temporada.codigo, g.competicion, g.codigo);
  const nombresDelGrupo = new Set(db.prepare(`select distinct local n from partidos where temporada=? and competicion=? and grupo=?
      union select distinct visitante from partidos where temporada=? and competicion=? and grupo=?`)
    .all(temporada.codigo, g.competicion, g.codigo, temporada.codigo, g.competicion, g.codigo).map((f) => normaliza(f.n)));
  let otro = 0, fuga = 0, invertido = 0, sinRes = 0;
  for (const f of ac) {
    let d; try { d = JSON.parse(f.datos); } catch { continue; }
    if (!d?.local || !d?.visitante) continue;
    if (!nombresDelGrupo.has(normaliza(d.local)) || !nombresDelGrupo.has(normaliza(d.visitante))) { sinRes++; continue; }
    const cL = normaliza(f.plocal), cV = normaliza(f.pvisitante), aL = normaliza(d.local), aV = normaliza(d.visitante);
    if (cL === aL && cV === aV) continue;
    if (cL === aV && cV === aL) invertido++;
    else if (cV === aL && cL !== aL && cL !== aV) fuga++;
    else otro++;
  }
  const marca = otro > 0 ? '  ← NO importable' : '';
  console.log(`${g.codigo.padEnd(11)} ${String(g.partidos).padStart(8)} ${String(g.con_resultado).padStart(5)} ${String(g.actas).padStart(6)} ${String(otro).padStart(6)} ${String(fuga).padStart(5)} ${String(invertido).padStart(5)} ${String(sinRes).padStart(7)}  ${g.competicion_nombre} · ${g.nombre}${marca}`);
  if (otro === 0 && g.partidos >= minPartidos) candidatos.push({ ...g, fuga, invertido, sinRes });
}
console.log(`\nimportables sin detener el lote: ${candidatos.length}`);
for (const c of candidatos.slice(0, 12)) {
  console.log(`  ${c.codigo} · ${c.partidos} partidos (${c.con_resultado} con resultado) · ${c.actas} actas · ${c.competicion_nombre} · ${c.nombre}`);
}
db.close();
