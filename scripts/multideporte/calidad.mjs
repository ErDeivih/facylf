#!/usr/bin/env node
/**
 * Calidad de lo extraído, adaptador por adaptador (sólo lectura): de los registros «partido», cuántos traen
 * fecha, los dos equipos y marcador, y qué claves usa cada uno. Sirve para ver de un vistazo si alguna web se
 * está leyendo mal (p. ej. todo sin fecha o sin marcador tras un cambio de maqueta).
 *   node scripts/multideporte/calidad.mjs [adaptador…]
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(RAIZ, 'descargas-multideporte');
const lista = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(DIR).filter((d) => existsSync(join(DIR, d, 'cola.sqlite')));

const valor = (o, re) => { for (const [k, v] of Object.entries(o ?? {})) if (re.test(k) && v != null && v !== '') return v; return null; };
const nombre = (e) => (e == null ? null : typeof e === 'string' ? e : e.nombre ?? e.name ?? e.id ?? null);
for (const ad of lista) {
  const db = new DatabaseSync(join(DIR, ad, 'cola.sqlite'), { readOnly: true });
  db.exec('pragma busy_timeout = 15000');
  const tipos = db.prepare('select tipo, count(*) n from registros group by 1 order by 2 desc').all();
  const c = { total: 0, conFecha: 0, conEquipos: 0, conMarcador: 0, jugadosSinMarcador: 0, marcadorNoNum: 0, fechasRaras: 0 };
  const claves = new Map();
  let ejemplo = null;
  for (const r of db.prepare(`select datos from registros where tipo='partido' order by rowid desc limit 20000`).all()) {
    let d; try { d = JSON.parse(r.datos); } catch { continue; }
    c.total += 1;
    for (const k of Object.keys(d)) claves.set(k, (claves.get(k) ?? 0) + 1);
    const fecha = valor(d, /^(fecha|date|fecha_jornada|dia|startTime|fecha_partido|inicio)$/i);
    if (fecha) { c.conFecha += 1; if (!/^\d{4}-\d{2}-\d{2}/.test(String(fecha))) c.fechasRaras += 1; }
    const l = nombre(d.local ?? d.equipo_local ?? d.home ?? valor(d, /^(local|home)/i));
    const v = nombre(d.visitante ?? d.equipo_visitante ?? d.away ?? valor(d, /^(visitante|away)/i));
    if (l && v) c.conEquipos += 1;
    const gl = d.goles_local ?? d.golesLocal ?? d.puntos_local ?? d.resultado_local ?? d.scoreHome ?? d.tanteo_local ?? d.sets_local ?? null;
    const gv = d.goles_visitante ?? d.golesVisitante ?? d.puntos_visitante ?? d.resultado_visitante ?? d.scoreAway ?? d.tanteo_visitante ?? d.sets_visitante ?? null;
    if (gl != null && gv != null) { c.conMarcador += 1; if (!Number.isFinite(Number(gl)) || !Number.isFinite(Number(gv))) c.marcadorNoNum += 1; }
    const jugado = d.jugado ?? d.finalizado ?? (/finaliz|jugad|acabad/i.test(String(d.estado ?? '')) ? true : null);
    if (jugado === true && (gl == null || gv == null)) c.jugadosSinMarcador += 1;
    if (!ejemplo && l && v) ejemplo = JSON.stringify(d).slice(0, 300);
  }
  const pct = (n) => (c.total ? `${Math.round((100 * n) / c.total)} %` : '-');
  console.log(`\n== ${ad} · registros: ${tipos.map((t) => `${t.tipo}=${t.n}`).join(' ')}`);
  console.log(`   partido (últimos ${c.total}): fecha ${pct(c.conFecha)} · equipos ${pct(c.conEquipos)} · marcador ${pct(c.conMarcador)}`
    + ` · jugados sin marcador ${c.jugadosSinMarcador} · marcador no numérico ${c.marcadorNoNum} · fechas no ISO ${c.fechasRaras}`);
  console.log(`   claves: ${[...claves.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, n]) => `${k}${n < c.total ? `(${n})` : ''}`).join(', ')}`);
  if (ejemplo) console.log(`   ejemplo: ${ejemplo}`);
  db.close();
}
