#!/usr/bin/env node
/*
 * auditoria-colas.mjs — SÓLO LEE. Foto de completitud de las colas de fútbol federado, temporada a temporada.
 *
 * Para cada `descargas-<fed>/recolector-local/cola-v2.sqlite` bajo FACYLF_RAIZ (por defecto /app):
 *   · por temporada: competiciones, grupos, grupos SIN ningún partido leído, partidos, jugados (fecha < hoy o
 *     con resultado), jugados con código de acta, actas hechas, actas en otro estado, trabajos pendientes/fallidos;
 *   · para las DOS temporadas más recientes: reparto por provincia/isla detectada en el nombre de la
 *     competición o del grupo (lo que no lleva provincia en el nombre sale como «(autonómica/sin provincia)»).
 *
 * Uso: node auditoria-colas.mjs [federación…]       (FACYLF_RAIZ=/app por defecto)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const pedidas = process.argv.slice(2);
const federaciones = pedidas.length ? pedidas : readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => !f.startsWith('prueba') && !f.endsWith('-sondeo') && f !== 'multideporte' && !f.startsWith('sondeo'))
  .sort();
const HOY = new Date().toISOString().slice(0, 10);

const PROVINCIAS = ['A CORUÑA', 'CORUÑA', 'LUGO', 'OURENSE', 'PONTEVEDRA', 'VIGO', 'ASTURIAS', 'CANTABRIA', 'BIZKAIA', 'VIZCAYA',
  'GIPUZKOA', 'GUIPUZCOA', 'ARABA', 'ALAVA', 'ÁLAVA', 'NAVARRA', 'RIOJA', 'HUESCA', 'ZARAGOZA', 'TERUEL', 'BARCELONA', 'GIRONA',
  'LLEIDA', 'TARRAGONA', 'AVILA', 'ÁVILA', 'BURGOS', 'LEON', 'LEÓN', 'PALENCIA', 'SALAMANCA', 'SEGOVIA', 'SORIA',
  'VALLADOLID', 'ZAMORA', 'BIERZO', 'MADRID', 'ALBACETE', 'CIUDAD REAL', 'CUENCA', 'GUADALAJARA', 'TOLEDO', 'CACERES',
  'CÁCERES', 'BADAJOZ', 'MERIDA', 'MÉRIDA', 'PLASENCIA', 'VALENCIA', 'CASTELLON', 'CASTELLÓN', 'ALICANTE', 'MURCIA',
  'CARTAGENA', 'LORCA', 'ALMERIA', 'ALMERÍA', 'CADIZ', 'CÁDIZ', 'CORDOBA', 'CÓRDOBA', 'GRANADA', 'HUELVA', 'JAEN', 'JAÉN',
  'MALAGA', 'MÁLAGA', 'SEVILLA', 'JEREZ', 'CEUTA', 'MELILLA', 'MALLORCA', 'MENORCA', 'IBIZA', 'EIVISSA', 'FORMENTERA',
  'TENERIFE', 'GRAN CANARIA', 'LANZAROTE', 'FUERTEVENTURA', 'LA PALMA', 'LA GOMERA', 'EL HIERRO', 'LAS PALMAS'];
const NORMAL = { 'CORUÑA': 'A CORUÑA', VIZCAYA: 'BIZKAIA', GUIPUZCOA: 'GIPUZKOA', ALAVA: 'ARABA', 'ÁLAVA': 'ARABA', LEON: 'LEÓN',
  AVILA: 'ÁVILA', CACERES: 'CÁCERES', MERIDA: 'MÉRIDA', CASTELLON: 'CASTELLÓN', ALMERIA: 'ALMERÍA', CADIZ: 'CÁDIZ',
  CORDOBA: 'CÓRDOBA', JAEN: 'JAÉN', MALAGA: 'MÁLAGA', EIVISSA: 'IBIZA' };
const ordenadas = [...PROVINCIAS].sort((a, b) => b.length - a.length);
function provincia(texto) {
  const t = ` ${String(texto ?? '').toUpperCase()} `;
  for (const p of ordenadas) if (new RegExp(`[^A-ZÁÉÍÓÚÑ]${p}[^A-ZÁÉÍÓÚÑ]`).test(t)) return NORMAL[p] ?? p;
  return null;
}

const n = (x) => String(x ?? 0).padStart(8);
for (const fed of federaciones) {
  const ruta = join(RAIZ, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) { console.log(`\n### ${fed}: sin cola`); continue; }
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 120_000 });
    const mtime = statSync(ruta).mtime.toISOString().slice(0, 16);
    console.log(`\n### ${fed}  (cola ${(statSync(ruta).size / 1e6).toFixed(0)} MB, modificada ${mtime})`);
    const temps = db.prepare('select codigo, etiqueta from temporadas order by etiqueta desc').all();
    const q = (sql, ...a) => db.prepare(sql).all(...a);
    const porT = (sql) => new Map(q(sql).map((r) => [String(r.t), r]));
    const comps = porT('select temporada t, count(*) n from competiciones group by 1');
    const grupos = porT(`select temporada t, count(*) n, sum(case when not exists (select 1 from partidos p where p.temporada=g.temporada
       and p.competicion=g.competicion and p.grupo=g.codigo) then 1 else 0 end) vacios from grupos g where estado='presente' group by 1`);
    const part = porT(`select temporada t, count(*) n,
       sum(case when (fecha is not null and fecha < '${HOY}') or goles_local is not null then 1 else 0 end) jug,
       sum(case when ((fecha is not null and fecha < '${HOY}') or goles_local is not null) and codigo_acta is not null and codigo_acta<>'' then 1 else 0 end) jugcod
       from partidos group by 1`);
    const actas = porT(`select temporada t, sum(case when estado='hecha' then 1 else 0 end) hechas,
       sum(case when estado='pendiente' then 1 else 0 end) pend, sum(case when estado not in ('hecha','pendiente') then 1 else 0 end) otras,
       sum(menores) menores from actas group by 1`);
    const trab = porT(`select temporada t, sum(case when estado='pendiente' then 1 else 0 end) pend,
       sum(case when estado in ('fallido','fallida','error') then 1 else 0 end) fall,
       sum(case when estado='en_curso' then 1 else 0 end) curso,
       sum(case when estado='pendiente' and siguiente_intento > '2090' then 1 else 0 end) aplazados
       from trabajos group by 1`);
    console.log('  temporada  comps   grupos  gVacíos  partidos  jugados  jugCódigo  actasHech  actasPend  actasOtras  trabPend  trabFall  aplaz2099');
    for (const t of temps) {
      const k = String(t.codigo);
      const c = comps.get(k), g = grupos.get(k), p = part.get(k), a = actas.get(k), w = trab.get(k);
      if (!c && !p) continue;
      console.log(`  ${String(t.etiqueta).padEnd(9)}${n(c?.n)}${n(g?.n)}${n(g?.vacios)} ${n(p?.n)} ${n(p?.jug)}  ${n(p?.jugcod)}  ${n(a?.hechas)}  ${n(a?.pend)}   ${n(a?.otras)}  ${n(w?.pend)}  ${n(w?.fall)}  ${n(w?.aplazados)}`);
    }
    for (const t of temps.slice(0, 2)) {
      const filas = q(`select c.nombre cn, g.nombre gn, g.codigo,
          (select count(*) from partidos p where p.temporada=g.temporada and p.competicion=g.competicion and p.grupo=g.codigo) np,
          (select count(*) from actas a where a.temporada=g.temporada and a.competicion=g.competicion and a.grupo=g.codigo and a.estado='hecha') na
        from grupos g join competiciones c on c.temporada=g.temporada and c.codigo=g.competicion
        where g.temporada=? and g.estado='presente'`, t.codigo);
      const m = new Map();
      for (const f of filas) {
        const pr = provincia(f.gn) ?? provincia(f.cn) ?? '(sin provincia en el nombre)';
        const e = m.get(pr) ?? { g: 0, vac: 0, p: 0, a: 0 };
        e.g++; if (!f.np) e.vac++; e.p += f.np; e.a += f.na; m.set(pr, e);
      }
      console.log(`  -- ${t.etiqueta} por provincia/isla: ` + [...m].sort((a, b) => b[1].g - a[1].g)
        .map(([k, e]) => `${k} g${e.g}${e.vac ? `(${e.vac} vacíos)` : ''} p${e.p} a${e.a}`).join(' · '));
    }
    db.close();
  } catch (error) {
    console.log(`  ${fed}: no se pudo leer: ${String(error.message).slice(0, 120)}`);
    try { db?.close(); } catch { /* */ }
  }
}
