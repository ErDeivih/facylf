#!/usr/bin/env node
/**
 * ¿LO QUE FALTA EN LA COLA ESTÁ EN LA WEB? Compara, en una muestra de actas hechas con alineación, lo que dice el
 * HTML guardado (secciones «Tarjetas» y «Sustituciones» de las PNFG, iconos de tarjeta) con lo que la cola tiene en
 * `eventos_acta`. Si el crudo trae tarjetas o cambios y la cola no, el fallo es NUESTRO (el lector); si el crudo
 * tampoco los trae, es la fuente. Sólo cifras y códigos de acta: ni un nombre. Abre la cola en SÓLO LECTURA.
 *
 *   node scripts/claude/crudo-vs-cola.mjs <cola-v2.sqlite> (--temporada <código> | --etiqueta 2018-19) [--muestra 40]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const db = new DatabaseSync(args[0], { readOnly: true });
// --temporada <código de la cola> o --etiqueta 2018-19 (los códigos cambian de una cola a otra).
const temporada = opt('--temporada')
  ?? db.prepare('select codigo from temporadas where etiqueta=?').get(opt('--etiqueta', ''))?.codigo ?? null;
if (temporada == null) { console.log(JSON.stringify({ error: 'temporada no encontrada' })); process.exit(0); }
const muestra = Number(opt('--muestra', '40'));
// Las colas traspasadas guardan rutas de la otra máquina (F:\\… o /app/…): con FACYLF_RAIZ se rehacen sobre esta.
const rebasa = (ruta) => {
  const raiz = process.env.FACYLF_RAIZ;
  if (!raiz || !ruta) return ruta;
  const m = String(ruta).replace(/\\/g, '/').match(/(descargas-[^/]+\/.*)$/);
  return m ? `${raiz.replace(/\/$/, '')}/${m[1]}` : ruta;
};
const lee = (rutaOriginal) => {
  const ruta = rebasa(rutaOriginal);
  for (const r of [ruta, `${ruta}.gz`]) {
    if (r && existsSync(r)) { const b = readFileSync(r); return (b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b).toString('utf8'); }
  }
  return null;
};
const actas = db.prepare(`select temporada, competicion, grupo, jornada, codigo, archivo from actas
  where temporada=? and estado='hecha' and archivo is not null and coalesce(incidencias,'') not like '%sin_alineaciones%'
  order by random() limit ?`).all(temporada, muestra * 3);
const tipos = db.prepare(`select tipo, count(*) n from eventos_acta where temporada=? and competicion=? and grupo=?
  and jornada=? and acta=? group by tipo`);
const jugadoresDe = db.prepare(`select count(*) n, sum(jugador_codigo is not null and jugador_codigo <> '') k
  from participaciones where temporada=? and competicion=? and grupo=? and jornada=? and acta=?`);
const r = { leidas: 0, sinFichero: 0, crudoCodigos: 0, colaCodigos: 0, colaJugadores: 0, codigosPerdidos: [], crudoTarjetas: 0, colaTarjetas: 0, crudoCambios: 0, colaCambios: 0,
  tarjetasPerdidas: [], cambiosPerdidos: [], h4: {} };
for (const a of actas) {
  if (r.leidas >= muestra) break;
  const html = lee(a.archivo);
  if (!html) { r.sinFichero += 1; continue; }
  r.leidas += 1;
  for (const m of html.matchAll(/<h4[^>]*>([\s\S]{0,80}?)<\/h4>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (t) r.h4[t] = (r.h4[t] ?? 0) + 1;
  }
  // Una sección cuenta si, entre su <h4> y el siguiente, hay alguna fila con un minuto («(23')», «(90+2')»).
  const seccionConMinutos = (titulo) => html.split(/<h4[^>]*>/i).slice(1).some((trozo) => {
    const [cabecera, ...resto] = trozo.split(/<\/h4>/i);
    return titulo.test(cabecera.replace(/<[^>]+>/g, '').trim()) && /<tr[\s>][\s\S]*?\d+(?:\s*\+\s*\d+)?\s*['’´]/i.test(resto.join(''));
  });
  const crudoT = seccionConMinutos(/^(?:Tarjetas|Txartelak)$/i);
  const crudoC = seccionConMinutos(/^(?:Sustituciones|Ordezkapenak)$/i);
  const ev = Object.fromEntries(tipos.all(a.temporada, a.competicion, a.grupo, a.jornada, a.codigo).map((x) => [x.tipo, x.n]));
  const colaT = Object.keys(ev).some((t) => /amarill|roj/.test(t));
  const colaC = Boolean(ev.sale || ev.entra);
  // Códigos de jugador: en las PNFG cada fila de alineación lleva «…jugador=NNN» en su onclick.
  const crudoK = new Set([...html.replace(/&amp;/g, '&').matchAll(/onclick="[^"]*[?&]jugador=(\d+)/gi)].map((m) => m[1])).size;
  const js = jugadoresDe.get(a.temporada, a.competicion, a.grupo, a.jornada, a.codigo);
  r.crudoCodigos += crudoK; r.colaCodigos += js?.k ?? 0; r.colaJugadores += js?.n ?? 0;
  if (crudoK > (js?.k ?? 0) && r.codigosPerdidos.length < 5) r.codigosPerdidos.push(a.codigo);
  if (crudoT) r.crudoTarjetas += 1; if (colaT) r.colaTarjetas += 1;
  if (crudoC) r.crudoCambios += 1; if (colaC) r.colaCambios += 1;
  if (crudoT && !colaT && r.tarjetasPerdidas.length < 5) r.tarjetasPerdidas.push(a.codigo);
  if (crudoC && !colaC && r.cambiosPerdidos.length < 5) r.cambiosPerdidos.push(a.codigo);
}
r.h4 = Object.fromEntries(Object.entries(r.h4).sort((x, y) => y[1] - x[1]).slice(0, 15));
console.log(JSON.stringify(r));
