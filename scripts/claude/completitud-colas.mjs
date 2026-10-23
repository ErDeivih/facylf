#!/usr/bin/env node
/*
 * completitud-colas.mjs — SÓLO LEE. ¿Está COMPLETA cada cola, o sólo «pide sin errores»? (21/10/2026)
 *
 * Nace de Cataluña: pedía sin un error y tenía 21.000 partidos de 2025-26 de ~150.000, porque los calendarios se
 * guardaban con las jornadas vacías. Mirar peticiones y actas hechas no lo enseñaba. Esto mide, por federación y
 * temporada, lo que de verdad falta:
 *
 *   gr      grupos · sinP: grupos sin ningún partido
 *   jEsp    jornadas esperadas (grupos.jornadas o, si no, filas de `jornadas`)
 *   jJug    jornadas con fecha ya pasada · jConP: jornadas (de cualquier fecha) con partidos
 *   gHueco  grupos con ≥ 2 jornadas YA JUGADAS sin partidos (y > 10 %): el defecto de Cataluña
 *   jVaciaHecha  trabajos de jornada «hecho» cuya jornada no tiene ni un partido (leída vacía)
 *   pJug    partidos jugados (fecha pasada o con resultado) · sinCod: de ellos, sin código de acta
 *   actas   hecho / pendiente / sin datos·cancelado ... · actasFalta: jugados con código y sin acta hecha
 *   copias  códigos de acta repetidos en varias filas de partidos de la temporada (defecto de copia)
 *   trab    trabajos pendientes por tipo, y los 3 errores más repetidos de lo no hecho
 *
 * Uso: node completitud-colas.mjs [federación…]     (FACYLF_RAIZ=/app por defecto; en Windows, la raíz del repo)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const pedidas = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const HOY = new Date().toISOString().slice(0, 10);
let carpetas = [];
try {
  carpetas = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
    .filter((n) => !/prueba|sondeo|multideporte|aficionado/.test(n));
} catch (e) { console.log(`no se puede leer ${RAIZ}: ${e.message}`); }
const nombre = (c) => (c === 'descargas-federacion' ? 'castilla-leon' : c.replace('descargas-', ''));
carpetas = carpetas.filter((c) => !pedidas.length || pedidas.includes(nombre(c))).sort();

const n = (x) => (x == null ? '-' : Number(x).toLocaleString('es-ES'));
for (const carpeta of carpetas) {
  const ruta = join(RAIZ, carpeta, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const fed = nombre(carpeta);
  let db;
  try { db = new DatabaseSync(ruta, { readOnly: true, timeout: 60000 }); } catch (e) { console.log(`\n## ${fed}: no abre (${e.message})`); continue; }
  try {
    const t0 = Date.now();
    const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [t.codigo, t.etiqueta]));
    const porTemp = new Map();
    const fila = (t) => { if (!porTemp.has(t)) porTemp.set(t, { t }); return porTemp.get(t); };
    for (const r of db.prepare(`with pj as (select temporada, competicion, grupo, count(*) np, count(distinct jornada) jp from partidos group by 1,2,3),
        jj as (select temporada, competicion, grupo, count(*) nj, sum(fecha is not null and substr(fecha,1,10) <= ?) jug from jornadas group by 1,2,3),
        jcp as (select p.temporada, p.competicion, p.grupo, count(distinct p.jornada) jugCon from partidos p
                join jornadas j on j.temporada=p.temporada and j.competicion=p.competicion and j.grupo=p.grupo and j.numero=p.jornada
                where j.fecha is not null and substr(j.fecha,1,10) <= ? group by 1,2,3)
      select g.temporada t, count(*) gr, sum(pj.np is null) sinP, sum(coalesce(g.jornadas, jj.nj, 0)) jEsp,
        sum(coalesce(jj.jug,0)) jJug, sum(coalesce(pj.jp,0)) jConP,
        sum(coalesce(jj.jug,0) - coalesce(jcp.jugCon,0) >= 2 and coalesce(jj.jug,0) - coalesce(jcp.jugCon,0) > coalesce(jj.jug,0) * 0.1) gHueco,
        sum(case when coalesce(jj.jug,0) - coalesce(jcp.jugCon,0) >= 2 and coalesce(jj.jug,0) - coalesce(jcp.jugCon,0) > coalesce(jj.jug,0) * 0.1
                 then coalesce(jj.jug,0) - coalesce(jcp.jugCon,0) else 0 end) jHueco
      from grupos g left join pj on pj.temporada=g.temporada and pj.competicion=g.competicion and pj.grupo=g.codigo
      left join jj on jj.temporada=g.temporada and jj.competicion=g.competicion and jj.grupo=g.codigo
      left join jcp on jcp.temporada=g.temporada and jcp.competicion=g.competicion and jcp.grupo=g.codigo
      group by g.temporada`).all(HOY, HOY)) Object.assign(fila(r.t), r);
    for (const r of db.prepare(`select p.temporada t, count(*) pTot,
        sum((p.fecha is not null and substr(p.fecha,1,10) <= ?) or p.goles_local is not null) pJug,
        sum(((p.fecha is not null and substr(p.fecha,1,10) <= ?) or p.goles_local is not null) and (p.codigo_acta is null or p.codigo_acta='')) sinCod
      from partidos p group by 1`).all(HOY, HOY)) Object.assign(fila(r.t), r);
    for (const r of db.prepare(`select temporada t, count(*) copias from (select temporada, codigo_acta from partidos
        where codigo_acta is not null and codigo_acta<>'' group by 1,2 having count(*) > 1) group by 1`).all()) Object.assign(fila(r.t), r);
    for (const r of db.prepare(`select temporada t, estado, count(*) c from actas group by 1,2`).all()) {
      const f = fila(r.t); f.actas = f.actas ?? {}; f.actas[r.estado] = r.c;
    }
    for (const r of db.prepare(`select p.temporada t, count(distinct p.codigo_acta) actasFalta from partidos p
        left join actas a on a.temporada=p.temporada and a.competicion=p.competicion and a.grupo=p.grupo
          and a.jornada=p.jornada and a.codigo=p.codigo_acta and a.estado <> 'pendiente'
        where p.codigo_acta is not null and p.codigo_acta<>'' and a.codigo is null
          and ((p.fecha is not null and substr(p.fecha,1,10) <= ?) or p.goles_local is not null) group by 1`).all(HOY)) Object.assign(fila(r.t), r);
    for (const r of db.prepare(`select w.temporada t, count(*) jVaciaHecha from trabajos w
        where w.tipo='jornada' and w.estado='hecho' and not exists (select 1 from partidos p where p.temporada=w.temporada
          and p.competicion=w.competicion and p.grupo=w.grupo and p.jornada=w.jornada) group by 1`).all()) Object.assign(fila(r.t), r);
    for (const r of db.prepare(`select temporada t, tipo, estado, count(*) c from trabajos where estado <> 'hecho' group by 1,2,3`).all()) {
      const f = fila(r.t); f.trab = f.trab ?? {}; f.trab[`${r.tipo}:${r.estado}`] = r.c;
    }
    const pausas = db.prepare(`select clave, valor from metadatos where clave like '%pausa%' or clave like '%bloqueo%'`).all()
      .filter((m) => !/^\s*$/.test(m.valor));
    const errores = db.prepare(`select tipo, substr(ultimo_error,1,90) e, count(*) c from trabajos where estado <> 'hecho' and ultimo_error is not null
      group by 1,2 order by c desc limit 4`).all();
    console.log(`\n## ${fed}  (${((Date.now() - t0) / 1000).toFixed(0)} s)` + (pausas.length ? `  PAUSA/METADATOS: ${pausas.map((p) => `${p.clave}=${String(p.valor).slice(0, 60)}`).join(' · ')}` : ''));
    console.log('temporada | gr sinP | jEsp jJug jConP | gHueco jHueco jVaciaHecha | pTot pJug sinCod copias | actas | actasFalta | trabajos no hechos');
    const ordenadas = [...porTemp.values()].sort((a, b) => String(etiquetas.get(b.t) ?? b.t).localeCompare(String(etiquetas.get(a.t) ?? a.t)));
    for (const f of ordenadas) {
      const actas = Object.entries(f.actas ?? {}).map(([k, v]) => `${k.slice(0, 8)} ${n(v)}`).join(', ');
      const trab = Object.entries(f.trab ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${n(v)}`).join(', ');
      console.log(`${etiquetas.get(f.t) ?? f.t} | ${n(f.gr)} ${n(f.sinP)} | ${n(f.jEsp)} ${n(f.jJug)} ${n(f.jConP)} | ${n(f.gHueco)} ${n(f.jHueco)} ${n(f.jVaciaHecha)} | `
        + `${n(f.pTot)} ${n(f.pJug)} ${n(f.sinCod)} ${n(f.copias)} | ${actas} | ${n(f.actasFalta)} | ${trab}`);
    }
    if (errores.length) console.log('errores más repetidos (no hechos): ' + errores.map((e) => `[${e.tipo}] ${e.e} ×${e.c}`).join(' | '));
  } catch (e) {
    console.log(`## ${fed}: error (${e.message}) — si dice «malformed» o «locked», repetir.`);
  } finally { db.close(); }
}
