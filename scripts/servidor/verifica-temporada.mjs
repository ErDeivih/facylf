#!/usr/bin/env node
/*
 * ── ¿ESTÁ BIEN INGESTADA LA TEMPORADA EN CURSO? ──────────────────────────────────────────────────────────
 *
 * Una liga que empieza en AGOSTO es la trampa: si el recolector no descubrió la competición a tiempo, esos
 * partidos no están ni siquiera en la cola, y como nunca se pidieron tampoco aparecen como fallo en ningún
 * sitio. La forma de verlo no es «cuántas actas hay», sino **cuántos partidos YA JUGADOS no tienen su acta**.
 *
 * Para la temporada más reciente de cada federación se mira, partido a partido:
 *
 *   · `fecha` anterior a hoy → ese partido ya se jugó (o debería);
 *   · ¿tiene código de acta? Si no lo tiene, la jornada no se leyó bien o la fuente aún no lo publica;
 *   · ¿su acta está `hecha`? Si está pendiente, está en camino; si está en otro estado, se cuenta aparte.
 *
 * Y se enseña la FECHA DEL PARTIDO MÁS ANTIGUO de la temporada, que es lo que dice si agosto está cubierto o
 * si la temporada se empezó a mirar más tarde.
 *
 * SÓLO LEE.
 *
 * Uso: docker exec facylf-monitor node /app/scripts/servidor/verifica-temporada.mjs [federación…]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const pedidas = process.argv.slice(2);
const federaciones = pedidas.length
  ? pedidas
  : readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
    .map((n) => n.replace('descargas-', ''))
    .filter((f) => !f.startsWith('prueba') && !f.endsWith('-sondeo'))
    .sort();

const HOY = new Date().toISOString().slice(0, 10);

console.log(`partidos YA JUGADOS (fecha < ${HOY}) y su acta, en la temporada más reciente de cada federación\n`);
console.log('  federación      temporada   jugados   conActa   actaHecha   pendientes   SINcódigo   partido más antiguo');

for (const federacion of federaciones) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });

    // La temporada más reciente por ETIQUETA (el código numérico no es comparable entre federaciones).
    const temp = db.prepare(`select codigo, etiqueta from temporadas
      where etiqueta is not null order by etiqueta desc limit 1`).get();
    if (!temp) { console.log(`  ${federacion.padEnd(16)} (sin temporadas catalogadas)`); db.close(); continue; }

    const jugados = db.prepare(`select count(*) n, min(fecha) primera
      from partidos where temporada = ? and fecha is not null and fecha < ?`).get(temp.codigo, HOY);
    const conActa = db.prepare(`select count(*) n from partidos
      where temporada = ? and fecha is not null and fecha < ? and codigo_acta is not null and codigo_acta <> ''`)
      .get(temp.codigo, HOY);
    const sinCodigo = Number(jugados.n) - Number(conActa.n);

    // El estado de esas actas, contando por estado del partido jugado.
    const estados = db.prepare(`select coalesce(a.estado, '(sin fila de acta)') estado, count(*) n
      from partidos p left join actas a on a.temporada = p.temporada and a.competicion = p.competicion
        and a.grupo = p.grupo and a.jornada = p.jornada and a.codigo = p.codigo_acta
      where p.temporada = ? and p.fecha is not null and p.fecha < ?
      group by estado order by n desc`).all(temp.codigo, HOY);
    const porEstado = Object.fromEntries(estados.map((e) => [String(e.estado), Number(e.n)]));

    const total = Number(jugados.n);
    console.log(`  ${federacion.padEnd(16)} ${String(temp.etiqueta).padEnd(11)} ${String(total).padStart(7)} `
      + `${String(conActa.n).padStart(9)} ${String(porEstado.hecha ?? 0).padStart(11)} `
      + `${String(porEstado.pendiente ?? 0).padStart(12)} ${String(sinCodigo).padStart(12)}   `
      + `${jugados.primera ?? '—'}`);
    db.close();
  } catch (error) {
    console.log(`  ${federacion.padEnd(16)} no se pudo leer: ${String(error.message).slice(0, 40)}`);
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}

console.log('\n  «SINcódigo» = partidos jugados de los que NO se conoce código de acta: o la jornada no se leyó bien,');
console.log('  o la fuente todavía no lo publica. Es el número que hay que vigilar para saber si se escapó algo.');
console.log('  «partido más antiguo» = la fecha del partido más viejo de la temporada: si es de septiembre y la liga');
console.log('  empezó en agosto, falta el arranque.');
