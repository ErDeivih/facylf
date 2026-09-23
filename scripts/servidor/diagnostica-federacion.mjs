#!/usr/bin/env node
/*
 * ── ¿QUÉ ESTÁ HACIENDO (O DEJANDO DE HACER) UNA FEDERACIÓN? ──────────────────────────────────────────────
 *
 * Diagnóstico de una federación concreta cuando «no avanza». Mira lo que la cola NO puede decir por sí sola:
 *
 *   · **cómo llama a sus trabajos** — cada recolector usa su propio prefijo de clave (`acta|…`, `jornada|…`),
 *     y Cataluña y Madrid/Valencia llevan guiones distintos. Si se mide «actas por hora» filtrando por
 *     `acta|%` en una federación que usa otro prefijo, sale CERO y parece que no trabaja cuando sí trabaja.
 *     Ese error es fácil de cometer y lleva a diagnosticar mal;
 *   · **qué ha pedido de verdad** en la última hora, agrupado por prefijo y por resultado;
 *   · **qué tiene pendiente** por tipo, cuánto está disponible AHORA y cuánto aplazado;
 *   · **si sus trabajos se están aplazando solos** — un `siguiente_intento` muy repetido explica que no pida
 *     nada aunque tenga decenas de miles de pendientes.
 *
 * SÓLO LEE.
 *
 * Uso:
 *   docker run --rm -v /srv/data/facylf:/app -v /srv/ssd/facylf:/srv/ssd/facylf \
 *     --entrypoint node facylf-recolectores:local /app/scripts/servidor/diagnostica-federacion.mjs <federación>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2];
if (!FEDERACION) {
  console.error('uso: diagnostica-federacion.mjs <federación>');
  process.exit(2);
}

const carpeta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local');
const ruta = join(carpeta, 'cola-v2.sqlite');
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${FEDERACION} en ${ruta}`);
  process.exit(2);
}

const n = (x) => Number(x ?? 0).toLocaleString('es-ES');
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });

console.log(`══ ${FEDERACION} ══\n`);

// ── 1. Cómo llama a sus trabajos ─────────────────────────────────────────────────────────────────────────
console.log('── prefijos de trabajo que usa (los últimos 2000 trabajos) ──');
const prefijos = db.prepare(`select substr(clave, 1, instr(clave || '|', '|') - 1) prefijo, count(*) n
  from trabajos group by prefijo order by n desc`).all();
for (const p of prefijos) console.log(`  ${String(p.prefijo).padEnd(24)} ${n(p.n).padStart(9)}`);

// ── 2. Qué ha pedido en la última hora ───────────────────────────────────────────────────────────────────
const desde = new Date(Date.now() - 3600_000).toISOString();
console.log('\n── peticiones en la última hora, por tipo de trabajo y resultado ──');
const pedidas = db.prepare(`select substr(coalesce(trabajo,'(sin trabajo)'), 1,
    instr(coalesce(trabajo,'x') || '|', '|') - 1) prefijo, resultado, count(*) n
  from peticiones where iniciada_en >= ? group by prefijo, resultado order by n desc limit 15`).all(desde);
if (!pedidas.length) console.log('  NINGUNA petición en la última hora');
for (const p of pedidas) {
  console.log(`  ${String(p.prefijo).padEnd(20)} ${String(p.resultado).padEnd(18)} ${n(p.n).padStart(6)}`);
}

// Las últimas 8 peticiones, tal cual, con su detalle: aquí se ve si falla o si va bien.
console.log('\n── las últimas 8 peticiones ──');
for (const p of db.prepare(`select iniciada_en, trabajo, resultado, detalle from peticiones
  order by id desc limit 8`).all()) {
  console.log(`  ${p.iniciada_en.slice(11, 19)}  ${String(p.trabajo ?? '').slice(0, 34).padEnd(34)} `
    + `${String(p.resultado ?? '').padEnd(16)} ${String(p.detalle ?? '').slice(0, 44)}`);
}

// ── 3. Qué tiene pendiente y cuánto está disponible ──────────────────────────────────────────────────────
const ahora = new Date().toISOString();
console.log('\n── trabajo pendiente por tipo ──');
console.log('  tipo                    pendiente   disponible   aplazado   primer aplazamiento');
for (const t of db.prepare(`select tipo,
    sum(case when estado in ('pendiente','bloqueado') then 1 else 0 end) pend,
    sum(case when estado in ('pendiente','bloqueado')
      and (siguiente_intento is null or siguiente_intento <= ?) then 1 else 0 end) disp,
    min(case when estado in ('pendiente','bloqueado') and siguiente_intento > ? then siguiente_intento end) prox
  from trabajos group by tipo order by pend desc`).all(ahora, ahora)) {
  const pend = Number(t.pend);
  if (!pend) continue;
  console.log(`  ${String(t.tipo).padEnd(22)} ${n(pend).padStart(9)} ${n(Number(t.disp)).padStart(12)} `
    + `${n(pend - Number(t.disp)).padStart(11)}   ${t.prox ?? '—'}`);
}

// ── 4. Los motivos de aplazamiento, que es lo que explica el «no pide nada» ──────────────────────────────
console.log('\n── por qué están aplazados (los 6 motivos más repetidos) ──');
for (const m of db.prepare(`select coalesce(ultimo_error,'(sin motivo)') motivo, count(*) n
  from trabajos where estado in ('pendiente','bloqueado') and siguiente_intento > ?
  group by motivo order by n desc limit 6`).all(ahora)) {
  console.log(`  ${n(m.n).padStart(8)}  ${String(m.motivo).slice(0, 96)}`);
}

// ── 5. Y el registro del worker, que dice lo que la cola no ──────────────────────────────────────────────
const log = join(carpeta, 'worker-programado.log');
if (existsSync(log)) {
  console.log('\n── últimas 12 líneas del registro ──');
  const lineas = readFileSync(log, 'utf8').split('\n').filter((l) => l.trim()).slice(-12);
  for (const l of lineas) console.log(`  ${l.slice(0, 150)}`);
}

db.close();
