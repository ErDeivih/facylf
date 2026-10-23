#!/usr/bin/env node
/**
 * Exploración de Playooz (api.playooz.com), la plataforma de ligas de F7/F11 amateur (Ligas Fútbol Siete de
 * Madrid y otras). La liga se identifica con la cabecera X-Tenant-Host (la misma que manda su web).
 * temporadas → eventos de la temporada pasada → rondas → grupos → jornadas, clasificación y partidos de un
 * grupo. 5-8 s entre peticiones, ≤ 12. Guarda SIN DNI/correos en descargas-sondeo-multideporte/playooz/<host>/.
 * Uso: node scripts/multideporte/explora-playooz.mjs www.ligasfutbolsiete.com
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retiraIdentificadores, AGENTE } from './motor.mjs';
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://api.playooz.com';
const host = process.argv[2] ?? 'www.ligasfutbolsiete.com';
const dir = join(RAIZ, 'descargas-sondeo-multideporte', 'playooz', host);
mkdirSync(dir, { recursive: true });
const espera = () => new Promise((r) => setTimeout(r, 5000 + Math.random() * 3000));
let n = 0;
async function get(ruta, etiqueta) {
  if (n >= 12) return null;
  if (n++) await espera();
  const r = await fetch(API + ruta, { headers: { 'user-agent': AGENTE, accept: 'application/json', 'X-Tenant-Host': host, 'X-Language': 'es' } });
  const t = retiraIdentificadores(await r.text());
  writeFileSync(join(dir, `${String(n).padStart(2, '0')}-${etiqueta}.json`), t);
  let j = null; try { j = JSON.parse(t); } catch {}
  const d = j?.items ?? j;
  const forma = Array.isArray(d) ? `[${d.length}] ${d[0] && typeof d[0] === 'object' ? Object.keys(d[0]).join(',') : ''}`
    : d && typeof d === 'object' ? Object.keys(d).join(',') : t.slice(0, 160);
  console.log(`${etiqueta} ${r.status} ${t.length} B · ${forma}`);
  return j;
}
const temporadas = await get('/season/selector', 'temporadas');
const eventos = await get(`/event/web/list?pageNumber=1&pageSize=50`, 'eventos');
for (const e of eventos?.items ?? []) console.log(`  ${e.id} ${e.nameFull} · ${e.statusText} · ${e.route}`);
const ev = eventos?.items?.find((e) => e.status !== 0) ?? eventos?.items?.[0];
console.log('evento:', ev?.id, ev?.nameFull, ev?.route);
const rondas = ev ? await get(`/event/rounds?eventId=${ev.id}`, `rondas-${ev.id}`) : null;
const ronda = Array.isArray(rondas) ? rondas[0] : rondas?.items?.[0];
const idR = ronda?.id ?? ronda?.roundId;
const grupos = idR ? await get(`/event/groups?roundId=${idR}`, `grupos-${idR}`) : null;
const grupo = Array.isArray(grupos) ? grupos[0] : grupos?.items?.[0];
const idG = grupo?.id ?? grupo?.groupId;
if (idG) {
  const jornadas = await get(`/event/fixtures?groupId=${idG}`, `jornadas-${idG}`);
  await get(`/event/standings/${ev.id}/${idR}/${idG}`, `clasificacion-${idG}`);
  await get(`/event/result/matches?eventId=${ev.id}&type=1&roundId=${idR}&groupId=${idG}`, `partidos-${idG}`);
  const j1 = Array.isArray(jornadas) ? jornadas[0] : null;
  const num = j1?.fixtureNumber ?? j1?.number ?? j1?.id;
  if (num != null) await get(`/event/result/matches?eventId=${ev.id}&type=1&roundId=${idR}&groupId=${idG}&fixtureNumber=${num}`, `partidos-${idG}-j${num}`);
}
console.log(`${n} peticiones → ${dir}`);
