#!/usr/bin/env node
/*
 * estado-colas.mjs — SÓLO LEE. Una foto corta de cada cola: ritmo real y qué le queda.
 *   · ritmo: trabajos terminados en las últimas 3 h y 24 h (por actualizado_en de los que ya no están pendientes),
 *     y la hora del último terminado;
 *   · por temporada: partidos jugados con código de acta, actas hechas, y trabajos pendientes separados en
 *     vencidos (se pueden pedir ya), futuros (<2090: jornadas por jugar o reintentos) y aparcados (>=2090);
 *   · temporadas que faltan entre la más antigua de la cola y la actual.
 * Uso: node estado-colas.mjs [fed…]   (FACYLF_RAIZ, por defecto /app)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const pedidas = process.argv.slice(2);
const feds = pedidas.length ? pedidas : readdirSync(RAIZ).filter((n) => n.startsWith('descargas-')).map((n) => n.slice(10))
  .filter((f) => !/^prueba|sondeo|multideporte/.test(f)).sort();
const ahora = new Date();
const iso = (h) => new Date(ahora - h * 3600e3).toISOString();
for (const fed of feds) {
  const ruta = join(RAIZ, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) { console.log(`\n### ${fed}: sin cola`); continue; }
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 60000 });
    const r = db.prepare(`select sum(case when actualizado_en>=? then 1 else 0 end) h3, sum(case when actualizado_en>=? then 1 else 0 end) h24,
        max(actualizado_en) ult from trabajos where estado not in ('pendiente','en_curso') and actualizado_en>=?`).get(iso(3), iso(24), iso(24));
    const ultActa = db.prepare(`select max(comprobada_en) u from actas where estado='hecha'`).get();
    const tipos24 = db.prepare(`select tipo, count(*) n from trabajos where estado not in ('pendiente','en_curso') and actualizado_en>=? group by 1 order by 2 desc`).all(iso(24));
    console.log(`\n### ${fed}  · 3 h: ${r.h3 ?? 0} · 24 h: ${r.h24 ?? 0} (${tipos24.map((t) => `${t.tipo} ${t.n}`).join(', ')}) · último: ${String(r.ult ?? '—').slice(0, 16)} · última acta: ${String(ultActa.u ?? '—').slice(0, 16)}`);
    const temps = db.prepare('select codigo, etiqueta from temporadas order by etiqueta desc').all();
    const part = new Map(db.prepare(`select temporada t, sum(case when ((fecha is not null and fecha < ?) or goles_local is not null) and codigo_acta is not null and codigo_acta<>'' then 1 else 0 end) jc
       from partidos group by 1`).all(ahora.toISOString().slice(0, 10)).map((x) => [String(x.t), x]));
    const act = new Map(db.prepare(`select temporada t, sum(case when estado='hecha' then 1 else 0 end) h from actas group by 1`).all().map((x) => [String(x.t), x]));
    const tr = new Map(db.prepare(`select temporada t,
        sum(case when siguiente_intento is null or siguiente_intento<=? then 1 else 0 end) v,
        sum(case when siguiente_intento>? and siguiente_intento<'2090' then 1 else 0 end) fut,
        sum(case when siguiente_intento>='2090' then 1 else 0 end) apar
      from trabajos where estado='pendiente' group by 1`).all(ahora.toISOString(), ahora.toISOString()).map((x) => [String(x.t), x]));
    const filas = [];
    for (const t of temps) {
      const k = String(t.codigo), p = part.get(k), a = act.get(k), w = tr.get(k);
      if (!p && !a && !w) { filas.push(`${t.etiqueta}: vacía`); continue; }
      filas.push(`${t.etiqueta}: jug/cód ${p?.jc ?? 0} · actas ${a?.h ?? 0} · pend ${w?.v ?? 0}+${w?.fut ?? 0}${w?.apar ? `+aparc ${w.apar}` : ''}`);
    }
    for (let i = 0; i < filas.length; i += 3) console.log('   ' + filas.slice(i, i + 3).join('  |  '));
    db.close();
  } catch (e) { console.log(`\n### ${fed}: no se pudo leer (${String(e.message).slice(0, 100)})`); try { db?.close(); } catch {} }
}
