#!/usr/bin/env node
/**
 * Exploración de la plataforma «Avanza» de tenis (FTM competicion.ftm.es/app/, FCT portal.fctennis.cat/app/):
 * recorre calendario → detalle → pruebas → días de juego → partidos de un día → cuadro de una prueba, con
 * 5-8 s entre peticiones y como mucho ~12 por sitio. Guarda cada respuesta SIN DNI/correos en
 * descargas-sondeo-multideporte/avanza/<host>/ para diseñar el adaptador. Sólo servicios públicos de consulta
 * (los mismos que llama la web sin iniciar sesión); nunca inscripciones ni datos de jugador.
 * Uso: node scripts/multideporte/explora-avanza.mjs https://competicion.ftm.es/app/ [anio] [mes]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retiraIdentificadores, AGENTE } from './motor.mjs';
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [base, anioTxt] = process.argv.slice(2);
const anio = Number(anioTxt) || new Date().getFullYear();
const dir = join(RAIZ, 'descargas-sondeo-multideporte', 'avanza', new URL(base).host);
mkdirSync(dir, { recursive: true });
const espera = () => new Promise((r) => setTimeout(r, 5000 + Math.random() * 3000));
let n = 0;
async function llama(servicio, cuerpo, etiqueta) {
  if (n++) await espera();
  const url = new URL(`api/${servicio}.do`, base).href;
  const r = await fetch(url, { method: 'POST', body: JSON.stringify(cuerpo),
    headers: { 'user-agent': AGENTE, accept: 'application/json', 'content-type': 'application/json;charset=UTF-8' } });
  const t = retiraIdentificadores(await r.text());
  writeFileSync(join(dir, `${String(n).padStart(2, '0')}-${etiqueta}.json`), t);
  let j = null; try { j = JSON.parse(t); } catch {}
  const resumen = j ? Object.entries(j).map(([k, v]) => `${k}:${Array.isArray(v) ? `[${v.length}]` : typeof v === 'object' && v ? '{…}' : JSON.stringify(v).slice(0, 40)}`).join(' ') : t.slice(0, 200).replace(/\s+/g, ' ');
  console.log(`${etiqueta} ${r.status} ${t.length} B · ${resumen}`);
  return j;
}
const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const mes = Number(process.argv[4]) || 5;
const codigosFijos = (process.argv[5] ?? '').split(',').filter(Boolean);
const cal = codigosFijos.length ? { data: [] } : await llama('calendario', { start: 1, count: 99999, mes: String(mes), anio: String(anio), accion: 'consultaTorneos' }, `calendario-${anio}-${mes}`);
const torneos = cal?.data ?? [];
if (torneos[0]) console.log('campos torneo:', Object.keys(torneos[0]).join(','));
const cuenta = {}; for (const t of torneos) { const k = `${t.tipoTorneo}/${t.tipoDeporte}/${t.estado}`; cuenta[k] = (cuenta[k] ?? 0) + 1; }
console.log('tipos (tipoTorneo/tipoDeporte/estado):', JSON.stringify(cuenta));
const esEquipo = (t) => /LIG|EQU/.test(String(t.tipoTorneo)) || t.tipoDeporte === 'E';
const elegidos = codigosFijos.length ? codigosFijos.map((c) => ({ codigo: c, tipoTorneo: '?' }))
  : [torneos.find((t) => !esEquipo(t) && t.estado !== 'ABR'), torneos.find((t) => esEquipo(t))].filter(Boolean);
for (const t of elegidos) {
  const codigo = t.codigo ?? t.id;
  let equipo = esEquipo(t); console.log(`→ ${codigo} ${t.nombre} [${t.tipoTorneo}/${t.estado}] ${t.fechaInicio}-${t.fechaFin}`);
  const det = await llama('calendario', { accion: 'detalleTorneo', codigo }, `detalle-${codigo}`);
  if (det?.data && t.tipoTorneo === '?') { equipo = esEquipo(det.data); console.log(`  ${det.data.nombre} [${det.data.tipoTorneo}/${det.data.estado}] ${det.data.fechaInicio}`); }
  if (det?.data) console.log('campos detalle:', Object.keys(det.data).join(','), det.ligas ? `ligas:${det.ligas.length}` : '');
  const pr = await llama('calendario', { accion: equipo ? 'pruebasTorneoEquipo' : 'pruebasTorneo', codigo }, `pruebas-${codigo}`);
  const dias = await llama('calendario', { accion: equipo ? 'diasJuegoTorneoEquipo' : 'diasJuegoTorneo', codigo, start: 0, count: 20 }, `dias-${codigo}`);
  const dia = dias?.data?.[0];
  if (dia) {
    const f = typeof dia === 'string' ? dia : dia.fecha ?? dia.dia ?? Object.values(dia)[0];
    const fecha = /^\d+$/.test(String(f)) ? fmt(new Date(Number(f))) : String(f).match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? String(f);
    await llama('calendario', { accion: equipo ? 'partidosTorneoEquipo' : 'partidosTorneo', codigo, fechaInicio: fecha, numeroPistas: det?.data?.numeroPistas }, `partidos-${codigo}`);
  }
  const prueba = pr?.data?.[0];
  if (prueba) console.log('campos prueba:', Object.keys(prueba).join(','));
  const cod = prueba?.codigoCuadro ?? prueba?.cuadro ?? prueba?.codigo;
  if (cod) await llama(equipo ? 'torneoequipo/cuadro' : 'torneo/cuadro', { accion: 'recuperarCuadro', data: { codigo: cod } }, `cuadro-${cod}`);
  if (det?.ligas?.[0]) await llama('calendario', { accion: 'recuperarGrupos', data: { codigo: det.ligas[0].codigo } }, `grupos-${det.ligas[0].codigo}`);
}
console.log(`${n} peticiones → ${dir}`);
