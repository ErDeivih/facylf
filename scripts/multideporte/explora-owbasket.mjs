#!/usr/bin/env node
/**
 * Exploración de OWBasket (Optimal Way Consulting): la API «ESB» que usan las webs de competición de varias
 * federaciones de baloncesto (FBCV Valencia, FRB Rioja… — sondeo del 01/10/2026). Las respuestas vienen en
 * base64; aquí se descodifican. Recorre selector de competiciones → categorías → grupos → partidos de un
 * grupo, con 5-8 s entre peticiones y ≤ 12 peticiones. Guarda SIN DNI/correos en
 * descargas-sondeo-multideporte/owbasket/<fede>/. Sólo lo que la web pública pide sin sesión.
 * Uso: node scripts/multideporte/explora-owbasket.mjs <base ESB> [season]
 *   base ESB = https://esb.optimalwayconsulting.com/fbcv/1/<clave pública de la web>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retiraIdentificadores, AGENTE } from './motor.mjs';
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [base, seasonArgRaw] = process.argv.slice(2);
const seasonArg = seasonArgRaw?.startsWith('rutas=') ? undefined : seasonArgRaw;
const fede = new URL(base).pathname.split('/')[1];
const dir = join(RAIZ, 'descargas-sondeo-multideporte', 'owbasket', fede);
mkdirSync(dir, { recursive: true });
const espera = () => new Promise((r) => setTimeout(r, 5000 + Math.random() * 3000));
let n = 0;
async function get(ruta, etiqueta) {
  if (n >= 12) return null;
  if (n++) await espera();
  const r = await fetch(`${base}/${ruta}`, { headers: { 'user-agent': AGENTE, accept: 'application/json,text/plain,*/*' } });
  let t = await r.text();
  try { if (!/^\s*[[{]/.test(t)) t = Buffer.from(t.trim(), 'base64').toString('utf8'); } catch {}
  t = retiraIdentificadores(t);
  writeFileSync(join(dir, `${String(n).padStart(2, '0')}-${etiqueta}.json`), t);
  let j = null; try { j = JSON.parse(t); } catch {}
  const d = j?.messageData ?? j;
  const forma = Array.isArray(d) ? `[${d.length}] ${d[0] && typeof d[0] === 'object' ? Object.keys(d[0]).join(',') : ''}`
    : d && typeof d === 'object' ? Object.keys(d).join(',') : t.slice(0, 160);
  console.log(`${etiqueta} ${r.status} ${t.length} B · ${forma}`);
  return d;
}
const rutas = process.argv.find((a) => a.startsWith('rutas='))?.slice(6).split(',');
if (rutas) {
  for (const r of rutas) await get(r, r.replace(/[^a-zA-Z0-9]+/g, '_').slice(-60));
  console.log(`${n} peticiones → ${dir}`);
  process.exit(0);
}
const primero = (a, f) => (Array.isArray(a) ? a.find(f ?? (() => true)) : null);
const temporadas = await get('Season/getActiveWebVisibility', 'temporadas');
const season = seasonArg ?? primero(temporadas, (s) => s.active === '1')?.idSeason ?? temporadas?.at?.(-1)?.idSeason;
console.log('temporada elegida:', season);
const l1 = await get('CompetitionsSelector/getAllWithComptitionAndVisibleTypeOne', 'selector-1');
const a = primero(l1);
const l2 = a ? await get(`CompetitionsSelector/getByLvLOneIdAndTypeTwo/${a.id}`, `selector-2-${a.id}`) : null;
const b = primero(l2);
const cats = a && b ? await get(`CategoryRegistered/getByLvLOneIdAndLvLTwoIdAndSeasonId/${a.id}/${b.id}/${season}`, `categorias-${a.id}-${b.id}`) : null;
const c = primero(cats);
const idCat = c?.idCategoryRegistred ?? c?.idCategoryRegistered ?? c?.id;
const comp = idCat ? await get(`Competition/getCompetitionGroupVisibleWeb/${idCat}/${season}`, `competicion-grupos-${idCat}`) : null;
const textoComp = JSON.stringify(comp ?? '');
const idGrupo = /"id_?(?:Group|Grup|group|grupo|Grupo)[a-zA-Z]*"\s*:\s*"?(\d+)/.exec(textoComp)?.[1];
console.log("competición (inicio):", textoComp.slice(0, 600));
console.log('grupo elegido:', idGrupo);
if (idGrupo) {
  await get(`FCBQWeb/getAllGamesByGrupWithMatchRecords/${idGrupo}`, `partidos-${idGrupo}`);
  await get(`FCBQWeb/resultats/${idGrupo}`, `resultados-${idGrupo}`);
  await get(`Group/getGroupByIdAndSeason/${idGrupo}/${season}`, `grupo-${idGrupo}`);
}
console.log(`${n} peticiones → ${dir}`);
