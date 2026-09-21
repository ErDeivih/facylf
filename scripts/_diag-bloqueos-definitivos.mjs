#!/usr/bin/env node
/**
 * Cuántos grupos no pueden publicarse y POR QUÉ, distinguiendo lo que de verdad está atascado de lo
 * que sólo está esperando:
 *
 *   · ESPERANDO A LA FUENTE: todos sus trabajos vivos están aplazados a una fecha futura, o son de la
 *     temporada en curso (la federación puede publicarlos más adelante). No hay nada que arreglar.
 *   · ATAJO REAL: algún trabajo vencido sigue sin poder hacerse (motivo que no depende de una fecha).
 *   · ERROR DE NAVEGADOR: sesión de Chrome caída, timeout de renderer… se reintenta solo.
 *
 * Uso: node scripts/_diag-bloqueos-definitivos.mjs [--federacion X]
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync } from 'node:fs';

const i = process.argv.indexOf('--federacion');
const solo = i >= 0 ? process.argv[i + 1] : null;
const ahora = new Date().toISOString();
const ES_NAVEGADOR = /invalid session id|timed out receiving message|net::ERR_|script timeout|chrome=|Session info/i;
const ES_TEMPORADA_ACTUAL = /temporada actual|temporada vigente/i;

let esperando = 0;
let atascados = 0;
let navegador = 0;
const filas = [];
for (const d of readdirSync('.').filter((x) => x.startsWith('descargas-')).sort()) {
  if (solo && !d.includes(solo)) continue;
  const ruta = `${d}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const temporadaActual = Number(db.prepare('select max(cast(codigo as integer)) c from temporadas').get()?.c ?? 0);
  const trabajos = db.prepare(`select tipo, ultimo_error, temporada, competicion, grupo, siguiente_intento, intentos
    from trabajos where estado in ('pendiente','bloqueado') and ultimo_error is not null`).all();
  const porGrupo = new Map();
  for (const t of trabajos) {
    const clave = `${t.temporada}|${t.competicion}|${t.grupo}`;
    if (!porGrupo.has(clave)) porGrupo.set(clave, []);
    porGrupo.get(clave).push(t);
  }
  let e = 0; let a = 0; let n = 0;
  const motivos = new Map();
  for (const [, lista] of porGrupo) {
    const temporada = Number(lista[0].temporada);
    const soloFuturo = lista.every((t) => t.siguiente_intento && t.siguiente_intento > ahora);
    const esActual = temporada >= temporadaActual;
    const esNavegador = lista.every((t) => ES_NAVEGADOR.test(String(t.ultimo_error)));
    const deTemporadaActual = lista.every((t) => ES_TEMPORADA_ACTUAL.test(String(t.ultimo_error)));
    if (esNavegador) { n += 1; continue; }
    if (soloFuturo || (esActual && deTemporadaActual) || deTemporadaActual) {
      e += 1;
      const clave = `esperando · ${lista[0].tipo} · ${String(lista[0].ultimo_error).replace(/\d+/g, 'N').slice(0, 90)}`;
      motivos.set(clave, (motivos.get(clave) ?? 0) + 1);
      continue;
    }
    a += 1;
    const clave = `atasco · ${lista[0].tipo} · ${String(lista[0].ultimo_error).replace(/\d+/g, 'N').slice(0, 90)}`;
    motivos.set(clave, (motivos.get(clave) ?? 0) + 1);
  }
  esperando += e; atascados += a; navegador += n;
  if (e + a + n) filas.push({ fed: d.replace('descargas-', ''), e, a, n, motivos });
  db.close();
}

filas.sort((x, y) => y.a - x.a || y.e - x.e);
console.log('federación             esperando  atasco  navegador   motivos del atasco');
for (const f of filas) {
  console.log(`${f.fed.padEnd(22)} ${String(f.e).padStart(8)} ${String(f.a).padStart(7)} ${String(f.n).padStart(10)}`);
  for (const [k, v] of [...f.motivos.entries()].filter(([k]) => k.startsWith('atasco')).sort((x, y) => y[1] - x[1]).slice(0, 3)) {
    console.log(`      ${String(v).padStart(4)} · ${k.slice(9)}`);
  }
}
console.log(`\nTOTAL grupos: ${esperando} esperando a la fuente (no hay nada que arreglar) · ${atascados} con atasco real · ${navegador} por error de navegador (se reintentan)`);
