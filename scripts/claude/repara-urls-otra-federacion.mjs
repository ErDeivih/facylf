#!/usr/bin/env node
/*
 * repara-urls-otra-federacion.mjs — arregla los trabajos con la URL del portal de OTRA federación (21/10/2026).
 *
 * La pasada del fin de semana (`scripts/ingesta-fin-de-semana.mjs`) reencolaba las jornadas recientes con la URL de
 * la web de Castilla y León para todas las federaciones (usaba el perfil por defecto). El worker pedía entonces a
 * rfcylf.es grupos gallegos, aragoneses…, recibía una página sin partidos y dejaba la jornada «hecha» y vacía.
 * Arreglado el origen; esto deshace lo que dejó en cada cola:
 *
 *   1. URL con otro portal → se reescribe con el de su federación (`perfiles/<fed>.json`), misma consulta.
 *   2. Jornada «hecha» sin ningún partido cuya ÚLTIMA petición fue a otro portal → vuelve a pendiente.
 *
 * Sin `--aplicar` sólo cuenta. No pide nada a ninguna web.
 * Uso: node scripts/claude/repara-urls-otra-federacion.mjs [--aplicar] [federación…]   (FACYLF_RAIZ=/app o la raíz del repo)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const aplicar = process.argv.includes('--aplicar');
const pedidas = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const feds = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-')).map((n) => n.replace('descargas-', ''))
  .filter((f) => f !== 'federacion' && !/prueba|sondeo|multideporte/.test(f))
  .filter((f) => !pedidas.length || pedidas.includes(f)).sort();

for (const fed of feds) {
  const rutaPerfil = join(RAIZ, 'perfiles', `${fed}.json`);
  const rutaCola = join(RAIZ, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(rutaPerfil) || !existsSync(rutaCola)) continue;
  let perfil;
  try { perfil = JSON.parse(readFileSync(rutaPerfil, 'utf8').replace(/^﻿/, '')); } catch { continue; }
  if (!perfil?.base) continue;
  const base = perfil.base.replace(/\/+$/, '');
  const host = new URL(base).host;
  let db;
  try { db = new DatabaseSync(rutaCola, aplicar ? {} : { readOnly: true }); } catch (e) { console.log(`${fed}: no abre (${e.message})`); continue; }
  try {
    db.exec('pragma busy_timeout = 60000;');
    const ajenas = db.prepare(`select clave, tipo, estado, url from trabajos where url like 'http%' and url not like ?`).all(`%://${host}/%`);
    const porHost = {};
    for (const a of ajenas) { const h = (() => { try { return new URL(a.url).host; } catch { return '?'; } })(); porHost[h] = (porHost[h] ?? 0) + 1; }
    // Jornadas «hechas» vacías cuya última petición fue a otro portal.
    const vacias = db.prepare(`select w.clave from trabajos w where w.tipo='jornada' and w.estado='hecho'
      and not exists (select 1 from partidos p where p.temporada=w.temporada and p.competicion=w.competicion and p.grupo=w.grupo and p.jornada=w.jornada)`).all();
    const ultima = db.prepare('select url from peticiones where trabajo=? order by id desc limit 1');
    const vaciasAjenas = vacias.filter((v) => { const u = ultima.get(v.clave)?.url; return u && !u.includes(`://${host}/`); });
    console.log(`${fed} (${host}): ${ajenas.length} trabajos con URL de otro portal ${JSON.stringify(porHost)} · `
      + `${vacias.length} jornadas hechas vacías, ${vaciasAjenas.length} de ellas pedidas a otro portal`);
    if (!aplicar || (!ajenas.length && !vaciasAjenas.length)) continue;
    const ahora = new Date().toISOString();
    db.exec('begin immediate');
    try {
      const reescribe = db.prepare('update trabajos set url=?, actualizado_en=? where clave=?');
      for (const a of ajenas) {
        const u = new URL(a.url);
        const ruta = u.pathname.replace(/^.*\/pnfg\/NPcd/, '');
        reescribe.run(`${base}${ruta}${u.search}`, ahora, a.clave);
      }
      const reactiva = db.prepare(`update trabajos set estado='pendiente', intentos=0, siguiente_intento=null,
        ultimo_error='se pidió al portal de otra federación (pasada del fin de semana): se vuelve a pedir al suyo', actualizado_en=?
        where clave=? and estado='hecho'`);
      for (const v of vaciasAjenas) reactiva.run(ahora, v.clave);
      db.exec('commit');
      console.log(`   → aplicado: ${ajenas.length} URL reescritas y ${vaciasAjenas.length} jornadas vuelven a pendiente`);
    } catch (e) { db.exec('rollback'); console.log(`   → ERROR, sin cambios: ${e.message}`); }
  } finally { db.close(); }
}
