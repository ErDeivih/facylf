#!/usr/bin/env node
/*
 * ── RECÁLCULO DE LA JORNADA CUANDO LLEGA EL ACTA QUE FALTABA ─────────────────────────────────────────
 *
 * El importador masivo da cada unidad (federación + temporada + grupo) por hecha y no la vuelve a mirar. Si
 * un acta llega tarde —un partido aplazado que se juega dos semanas después, o el acta que no estaba el
 * domingo— esa unidad se queda sin reimportar y la web sigue sin el resultado.
 *
 * Este programa mira las actas que se han guardado en las últimas horas, saca a qué unidad pertenecen y las
 * quita del registro de «hechas» para que el importador las repase en su siguiente tanda. Es idempotente: si
 * ya estaba quitada, no hace nada.
 *
 * Uso (dentro del contenedor del importador, que ve el estado y todas las colas):
 *   node scripts/servidor/dispara-recalculo.mjs --horas 6 [--seco] [--json]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const PREFIJO = 'castilla-leon';

/** La clave de unidad que usa el importador: `federacion|temporada|grupo`. */
export function claveUnidad({ federacion = PREFIJO, temporada, grupo }) {
  return `${federacion}|${temporada}|${grupo}`;
}

/** Colas de CyL que ve el contenedor del importador. */
export function colas(raiz = '/app') {
  const encontradas = [];
  for (const carpeta of readdirSync(raiz)) {
    if (!/^descargas-federacion(-[0-9]+)?$/.test(carpeta)) continue;
    const ruta = join(raiz, carpeta, 'recolector-local', 'cola-v2.sqlite');
    if (existsSync(ruta)) encontradas.push(ruta);
  }
  return encontradas.sort();
}

const argumentos = process.argv.slice(2);
const arg = (n, d = null) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };

function principal() {
  const horas = Number(arg('horas', 6));
  const seco = argumentos.includes('--seco');
  const json = argumentos.includes('--json');
  const estadoRuta = process.env.FACYLF_ESTADO ?? '/app/estado/importacion.json';
  if (!existsSync(estadoRuta)) throw new Error(`No existe el estado del importador: ${estadoRuta}`);

  const desde = new Date(Date.now() - horas * 3600e3).toISOString();
  const porReabrir = new Set();
  const detalle = [];

  for (const cola of colas()) {
    const db = new DatabaseSync(cola, { readOnly: true });
    // Actas guardadas en las últimas horas y la temporada a la que pertenecen (código → etiqueta).
    const filas = db.prepare(`
      select distinct a.temporada, a.grupo, tm.etiqueta
        from actas a
        join temporadas tm on tm.codigo = a.temporada
       where a.comprobada_en > ?
    `).all(desde);
    db.close();
    for (const f of filas) {
      const clave = claveUnidad({ temporada: f.etiqueta, grupo: String(f.grupo) });
      porReabrir.add(clave);
      detalle.push({ cola, temporada: f.etiqueta, grupo: f.grupo, clave });
    }
  }

  const estado = JSON.parse(readFileSync(estadoRuta, 'utf8'));
  const reabiertas = [];
  for (const clave of porReabrir) {
    if (estado.hechos?.[clave]) { delete estado.hechos[clave]; reabiertas.push(clave); }
  }
  if (!seco && reabiertas.length) writeFileSync(estadoRuta, JSON.stringify(estado));

  const informe = { cuando: new Date().toISOString(), horas, seco, unidades_con_actas_nuevas: porReabrir.size, reabiertas: reabiertas.length, detalle: detalle.slice(0, 20) };
  if (json) console.log(JSON.stringify(informe, null, 2));
  else {
    console.log(`RECÁLCULO · ${informe.cuando}${seco ? ' (en seco)' : ''}`);
    console.log(`  actas guardadas en las últimas ${horas} h → unidades afectadas: ${informe.unidades_con_actas_nuevas}`);
    console.log(`  reabiertas para reimportar: ${informe.reabiertas}`);
  }
  return informe;
}

if (process.argv[1]?.endsWith('dispara-recalculo.mjs')) {
  try { principal(); } catch (error) { console.error(`✗ ${error.message}`); process.exit(1); }
}
