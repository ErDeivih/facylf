#!/usr/bin/env node
// SÓLO LEE. Salud de cada cola de fútbol: si está pidiendo, a qué ritmo, si le dan errores o bloqueos, si está en
// pausa y cuánto trabajo le queda (vencido y aplazado). Una línea larga por federación.
// Uso: node scripts/claude/salud-federaciones.mjs [federación…]        (FACYLF_RAIZ=raíz del repositorio o /app)
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const RAIZ = process.env.FACYLF_RAIZ ?? process.cwd();
const pedidas = process.argv.slice(2);
const carpetas = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-') && !/prueba|sondeo|multideporte/.test(n))
  .filter((n) => !pedidas.length || pedidas.some((p) => n === `descargas-${p}`)).sort();
const ahora = Date.now(); const iso = (ms) => new Date(ms).toISOString();
for (const c of carpetas) {
  const ruta = join(RAIZ, c, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const fed = c.replace('descargas-', '');
  try {
    const db = new DatabaseSync(ruta, { readOnly: true, timeout: 20000 }) /* sin immutable: con immutable=1 se ignora el WAL y las cifras salían viejas (22/10/2026) */;
    const p = db.prepare(`select max(iniciada_en) u, sum(iniciada_en >= ?) h1, sum(iniciada_en >= ?) h24,
      sum(iniciada_en >= ? and resultado='ok') ok24, sum(iniciada_en >= ? and resultado='bloqueo') bloq24,
      sum(iniciada_en >= ? and resultado not in ('ok','bloqueo')) err24 from peticiones`)
      .get(iso(ahora - 3600e3), iso(ahora - 86400e3), iso(ahora - 86400e3), iso(ahora - 86400e3), iso(ahora - 86400e3));
    const meta = (k) => { try { return db.prepare('select valor from metadatos where clave=?').get(k)?.valor || ''; } catch { return ''; } };
    const pausa = meta('pausa_global_hasta'); const pausaViva = pausa && Date.parse(pausa) > ahora;
    const t = db.prepare(`select tipo, sum(siguiente_intento is null or siguiente_intento <= ?) ya, sum(siguiente_intento > ?) luego
      from trabajos where estado in ('pendiente','bloqueado','en_curso') group by 1`).all(iso(ahora), iso(ahora));
    const a = db.prepare(`select sum(estado='hecha') h, sum(estado not in ('hecha','sin_datos','ausente_web','pendiente_ambito')) pend from actas`).get();
    const errTop = db.prepare(`select substr(detalle,1,70) d, count(*) n from peticiones where iniciada_en >= ? and resultado <> 'ok'
      group by 1 order by 2 desc limit 2`).all(iso(ahora - 86400e3));
    const hace = p.u ? Math.round((ahora - Date.parse(p.u)) / 60000) : null;
    const ya = t.reduce((s, x) => s + (x.ya ?? 0), 0), luego = t.reduce((s, x) => s + (x.luego ?? 0), 0);
    console.log(`${fed.padEnd(18)} última ${hace === null ? 'nunca' : hace < 120 ? hace + ' min' : Math.round(hace / 60) + ' h'} · 1h ${p.h1 ?? 0} · 24h ${p.h24 ?? 0} (ok ${p.ok24 ?? 0}, error ${p.err24 ?? 0}, bloqueo ${p.bloq24 ?? 0})`
      + ` · actas ${a.h ?? 0} hechas, ${a.pend ?? 0} pend. · trabajo vencido ${ya}, aplazado ${luego}${pausaViva ? ` · PAUSA hasta ${pausa.slice(0, 16)} (${meta('pausa_global_motivo').slice(0, 80)})` : ''}`);
    if (ya) console.log(`   vencido: ${t.filter((x) => x.ya).map((x) => `${x.tipo} ${x.ya}`).join(' · ')}`);
    for (const e of errTop) console.log(`   fallo 24h ×${e.n}: ${e.d}`);
  } catch (e) { console.log(`${fed.padEnd(18)} no se pudo leer: ${e.message}`); }
}
