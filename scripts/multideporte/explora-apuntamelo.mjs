#!/usr/bin/env node
/**
 * Exploración de Apúntamelo (apuntamelo.com): organizaciones → divisiones → ligas de la división →
 * clasificación y partidos de una liga. 5-8 s entre peticiones, ≤ 10. Guarda SIN DNI/correos en
 * descargas-sondeo-multideporte/apuntamelo/org-N/. Nunca llamadas de jugadores ni de usuarios.
 * Uso: node scripts/multideporte/explora-apuntamelo.mjs <idOrganizacion>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retiraIdentificadores, AGENTE } from './motor.mjs';
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const org = process.argv[2] ?? '4';
const dir = join(RAIZ, 'descargas-sondeo-multideporte', 'apuntamelo', `org-${org}`);
mkdirSync(dir, { recursive: true });
const espera = () => new Promise((r) => setTimeout(r, 5000 + Math.random() * 3000));
let n = 0;
async function get(ruta, etiqueta) {
  if (n >= 10) return null;
  if (n++) await espera();
  const r = await fetch(`https://apuntamelo.com${ruta}`, { headers: { 'user-agent': AGENTE, accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' } });
  const t = retiraIdentificadores(await r.text());
  writeFileSync(join(dir, `${String(n).padStart(2, '0')}-${etiqueta}.json`), t);
  let j = null; try { j = JSON.parse(t); } catch {}
  const forma = Array.isArray(j) ? `[${j.length}] ${j[0] && typeof j[0] === 'object' ? Object.keys(j[0]).join(',') : ''}` : t.slice(0, 200);
  console.log(`${etiqueta} ${r.status} ${t.length} B · ${forma}`);
  return j;
}
const divs = await get(`/obtenerDivisiones?id=${org}`, 'divisiones');
const d = Array.isArray(divs) ? divs.find((x) => x.Enlace) ?? divs[0] : null;
const idDiv = d?.Id ?? d?.id;
console.log('división:', JSON.stringify(d)?.slice(0, 300));
const ligas = idDiv ? await get(`/obtenerLigasDivision?organizacion=${org}&division=${idDiv}`, `ligas-${idDiv}`) : null;
const l = Array.isArray(ligas) ? ligas[0] : null;
const idLiga = l?.Id ?? l?.id;
console.log('liga:', JSON.stringify(l)?.slice(0, 400));
if (idLiga) {
  await get(`/obtenerClasificacion?id=${idLiga}`, `clasificacion-${idLiga}`);
  const gr = l.Grupo;
  await get(`/obtenerPartidosPorJornada?organizacion=${org}&grupo=${gr}`, `partidos-jornada-g${gr}`);
  await get(`/obtenerTodasJornadasGrupoCalendario?id=${idLiga}&gr=${gr}`, `jornadas-${idLiga}-g${gr}`);
  await get(`/obtenerPartidosPorJornadaDivision?organizacion=${org}&division=${idDiv}`, `partidos-division-${idDiv}`);
  await get(`/obtenerPartidosLigaCalendario?liga=${idLiga}&fase=0&jornada=1`, `partidos-liga-${idLiga}-j1`);
}
console.log(`${n} peticiones → ${dir}`);
