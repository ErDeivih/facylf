#!/usr/bin/env node
/* ritmo-peticiones.mjs — SÓLO LEE. Ritmo REAL: peticiones a la web registradas (tabla `peticiones`) en 1 h, 3 h y 24 h,
 * con su resultado, y actas hechas en 24 h. (`trabajos.actualizado_en` NO sirve: `encola` lo toca en cada arranque.)
 * Uso: node ritmo-peticiones.mjs fed…   (FACYLF_RAIZ, por defecto /app) */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const iso = (h) => new Date(Date.now() - h * 3600e3).toISOString();
for (const fed of process.argv.slice(2)) {
  const ruta = join(RAIZ, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) { console.log(`${fed.padEnd(19)} sin cola`); continue; }
  try {
    const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60000 });
    const p = db.prepare(`select sum(case when iniciada_en>=? then 1 else 0 end) h1, sum(case when iniciada_en>=? then 1 else 0 end) h3,
        count(*) h24, max(iniciada_en) ult from peticiones where iniciada_en>=?`).get(iso(1), iso(3), iso(24));
    const res = db.prepare(`select coalesce(resultado,'?') r, count(*) n from peticiones where iniciada_en>=? group by 1 order by 2 desc limit 4`).all(iso(24));
    const a = db.prepare(`select count(*) n from actas where estado='hecha' and comprobada_en>=?`).get(iso(24));
    console.log(`${fed.padEnd(19)} 1 h ${String(p.h1 ?? 0).padStart(4)} · 3 h ${String(p.h3 ?? 0).padStart(5)} · 24 h ${String(p.h24).padStart(6)} · actas 24 h ${String(a.n).padStart(5)} · última ${String(p.ult ?? '—').slice(5, 16)} · ${res.map((x) => `${x.r} ${x.n}`).join(', ')}`);
    db.close();
  } catch (e) { console.log(`${fed}: ${String(e.message).slice(0, 90)}`); }
}
