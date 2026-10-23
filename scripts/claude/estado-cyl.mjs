#!/usr/bin/env node
// SÓLO LEE. Estado de una cola por temporada: actas (hechas / sin datos / sin publicar / pendientes), trabajos que
// quedan por tipo, y partidos ya jugados sin acta conocida. Pensado para CyL, que está repartida entre PC y servidor.
// Uso: node scripts/claude/estado-cyl.mjs <cola-v2.sqlite> [etiqueta-de-la-máquina]
import { DatabaseSync } from 'node:sqlite';
const [ruta, maquina = ''] = process.argv.slice(2);
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60000 });
const hoy = new Date().toISOString().slice(0, 10);
const ahora = new Date().toISOString();
const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [String(t.codigo), t.etiqueta]));
const actas = db.prepare(`select temporada t, count(*) total, sum(estado='hecha') hechas, sum(estado='sin_datos') sin_datos,
  sum(estado='ausente_web') ausentes, sum(estado='pendiente_ambito') fuera, sum(estado not in ('hecha','sin_datos','ausente_web','pendiente_ambito')) pendientes
  from actas group by 1`).all();
const trab = db.prepare(`select temporada t, tipo, count(*) n, sum(siguiente_intento is null or siguiente_intento <= ?) ya
  from trabajos where estado in ('pendiente','bloqueado','en_curso') group by 1,2`).all(ahora);
const part = db.prepare(`select temporada t, count(*) n, sum(coalesce(fecha,'9999') < ?) jugados,
  sum(coalesce(fecha,'9999') < ? and codigo_acta is null) jugados_sin_acta, count(distinct grupo) grupos from partidos group by 1`).all(hoy, hoy);
const grupos = db.prepare(`select temporada t, count(*) n from grupos group by 1`).all();
const porT = new Map();
const de = (t) => { if (!porT.has(t)) porT.set(t, { t, trabajos: {} }); return porT.get(t); };
for (const a of actas) Object.assign(de(String(a.t)), { actas: a });
for (const x of trab) de(String(x.t)).trabajos[x.tipo] = { n: x.n, ya: x.ya };
for (const p of part) Object.assign(de(String(p.t)), { partidos: p });
for (const g of grupos) Object.assign(de(String(g.t)), { grupos: g.n });
const filas = [...porT.values()].filter((x) => x.t !== 'null' && etiquetas.has(x.t))
  .sort((a, b) => Number(b.t) - Number(a.t));
console.log(`== ${maquina} ${ruta} (${hoy})`);
console.log('temporada | actas: total hechas sinDatos sinPublicar pendientes fueraDeÁmbito | partidos jugados (sin acta) | grupos catálogo/con partidos | trabajos pendientes por tipo (vencidos)');
for (const f of filas) {
  const a = f.actas ?? {}; const p = f.partidos ?? {};
  const tr = Object.entries(f.trabajos).map(([k, v]) => `${k} ${v.n}(${v.ya})`).join(' ') || '—';
  console.log(`${etiquetas.get(f.t)} | ${a.total ?? 0} ${a.hechas ?? 0} ${a.sin_datos ?? 0} ${a.ausentes ?? 0} ${a.pendientes ?? 0} ${a.fuera ?? 0} | ${p.jugados ?? 0} (${p.jugados_sin_acta ?? 0}) | ${f.grupos ?? 0}/${p.grupos ?? 0} | ${tr}`);
}
