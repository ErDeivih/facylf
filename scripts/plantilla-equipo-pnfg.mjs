#!/usr/bin/env node
/* Captura la plantilla publicada en la ficha PNFG y la enlaza de forma conservadora. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(RAIZ, '.env')); } catch { /* comprobado debajo */ }
const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const teamEntryId = Number(arg('equipo'));
if (!Number.isInteger(teamEntryId) || teamEntryId <= 0) {
  console.error('uso: node scripts/plantilla-equipo-pnfg.mjs --equipo <team_entry_id> [--url <url>]');
  process.exit(2);
}
const dbUrl = process.env.DATABASE_URL_PUBLICADOR;
if (!dbUrl) throw new Error('Falta DATABASE_URL_PUBLICADOR en .env.');
const requerir = createRequire(import.meta.url);
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');
const { parse } = requerir('node-html-parser');
const db = new Client({ connectionString: dbUrl, application_name: 'facylf-plantilla-equipo' });
await db.connect();

const contexto = await db.query(`select te.codigo_externo, ts.club_id, f.id federation_id, f.codigo federation
  from core.team_entry te join core.team_season ts on ts.id=te.team_season_id
  join core.phase_group pg on pg.id=te.phase_group_id
  join core.competition_edition ce on ce.id=pg.competition_edition_id
  join core.federation f on f.id=ce.federation_id where te.id=$1`, [teamEntryId]);
if (contexto.rowCount !== 1) throw new Error(`No existe la inscripción ${teamEntryId}.`);
const ctx = contexto.rows[0];
const bases = { 'castilla-leon': 'https://www.rfcylf.es' };
const sourceUrl = arg('url') ?? `${bases[ctx.federation]}/pnfg/NPcd/NFG_VisEquipos?cod_primaria=1000119&Codigo_Equipo=${ctx.codigo_externo}`;
if (!/^https:\/\//.test(sourceUrl)) throw new Error(`La federación ${ctx.federation} necesita --url.`);

const cookies = new Map();
const guardaCookies = (respuesta) => {
  for (const cruda of respuesta.headers.getSetCookie?.() ?? []) {
    const [par] = cruda.split(';');
    const corte = par.indexOf('=');
    if (corte > 0) cookies.set(par.slice(0, corte), par.slice(corte + 1));
  }
};
const headers = () => ({
  'user-agent': 'FACyLF archivo personal de plantillas/1.0',
  accept: 'text/html,application/xhtml+xml',
  ...(cookies.size ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
});
// PNFG exige una sesión anónima previa. Se abre una vez y se reutiliza para la ficha; no se
// simula un navegador ni se multiplica el número de peticiones.
const origen = new URL(sourceUrl).origin;
for (const paso of [`${origen}/pnfg/`, sourceUrl, `${origen}/pnfg/NLogin?NSess=1`]) {
  const r = await fetch(paso, { redirect: 'manual', headers: headers(), signal: AbortSignal.timeout(30_000) });
  guardaCookies(r);
  await r.arrayBuffer();
}
const respuesta = await fetch(sourceUrl, { redirect: 'manual', headers: headers(), signal: AbortSignal.timeout(30_000) });
guardaCookies(respuesta);
if (!respuesta.ok) throw new Error(`La ficha devolvió HTTP ${respuesta.status}.`);
const bytes = Buffer.from(await respuesta.arrayBuffer());
const html = bytes.toString('latin1');
const root = parse(html);
const limpia = (x) => x.text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
function lista(titulo, role) {
  const tabla = root.querySelectorAll('table').find((t) => limpia(t.querySelector('th') ?? { text: '' }).toLowerCase().includes(titulo));
  if (!tabla) return [];
  return tabla.querySelectorAll('tr').slice(1).map((tr) => limpia(tr.querySelector('td') ?? { text: '' }))
    .filter(Boolean).map((displayName, sourceOrder) => ({ role, sourceOrder, displayName }));
}
const miembros = [...lista('jugadores', 'player'), ...lista('técnicos', 'coach'), ...lista('delegados', 'delegate')];
const declarado = Number(/Jugadores\s*\((\d+)\)/i.exec(html)?.[1] ?? NaN);
if (!miembros.some((x) => x.role === 'player')) throw new Error('La ficha no contiene jugadores; no se guarda una plantilla vacía.');

async function resuelve(displayName) {
  const actual = await db.query(`select distinct p.id from core.person p
    left join core.appearance a on a.person_id=p.id and a.team_entry_id=$2
    left join core.match_staff ms on ms.person_id=p.id and ms.team_entry_id=$2
    where p.nombre_norm=core.normaliza_nombre($1) and (a.id is not null or ms.id is not null)`, [displayName, teamEntryId]);
  if (actual.rowCount === 1) return { personId: actual.rows[0].id, resolution: 'appearance_current' };
  const mismoClub = await db.query(`select distinct p.id from core.person p where p.nombre_norm=core.normaliza_nombre($1) and (
      exists(select 1 from core.appearance a join core.team_entry te on te.id=a.team_entry_id join core.team_season ts on ts.id=te.team_season_id where a.person_id=p.id and ts.club_id=$2)
      or exists(select 1 from core.match_staff ms join core.team_entry te on te.id=ms.team_entry_id join core.team_season ts on ts.id=te.team_season_id where ms.person_id=p.id and ts.club_id=$2))`, [displayName, ctx.club_id]);
  if (mismoClub.rowCount === 1) return { personId: mismoClub.rows[0].id, resolution: 'same_club' };
  if (mismoClub.rowCount > 1) return { personId: null, resolution: 'ambiguous' };
  const federacion = await db.query(`select distinct p.id from core.person p join core.person_source_identity psi on psi.person_id=p.id
    where p.nombre_norm=core.normaliza_nombre($1) and psi.federation_id=$2`, [displayName, ctx.federation_id]);
  if (federacion.rowCount === 1) return { personId: federacion.rows[0].id, resolution: 'unique_federation' };
  return { personId: null, resolution: federacion.rowCount > 1 ? 'ambiguous' : 'unresolved' };
}

const resueltos = [];
for (const m of miembros) resueltos.push({ ...m, ...(await resuelve(m.displayName)) });
const sha = createHash('sha256').update(bytes).digest('hex');
await db.query('begin');
try {
  const snap = await db.query(`insert into core.squad_snapshot(team_entry_id,source_url,content_sha256,declared_players)
    values($1,$2,$3,$4) on conflict(team_entry_id,content_sha256) do update set captured_at=now(),source_url=excluded.source_url returning id`,
  [teamEntryId, sourceUrl, sha, Number.isFinite(declarado) ? declarado : null]);
  const snapshotId = snap.rows[0].id;
  await db.query('delete from core.squad_member where snapshot_id=$1', [snapshotId]);
  for (const m of resueltos) await db.query(`insert into core.squad_member
    (snapshot_id,role,source_order,display_name,person_id,resolution) values($1,$2,$3,$4,$5,$6)`,
  [snapshotId, m.role, m.sourceOrder, m.displayName, m.personId, m.resolution]);
  await db.query('commit');
} catch (error) { await db.query('rollback'); throw error; }
await db.end();
const resumen = Object.groupBy(resueltos, (x) => `${x.role}:${x.resolution}`);
console.log(JSON.stringify({ teamEntryId, declaredPlayers: declarado, members: miembros.length,
  resolutions: Object.fromEntries(Object.entries(resumen).map(([k, v]) => [k, v.length])),
  unresolved: resueltos.filter((x) => !x.personId).map((x) => ({ role: x.role, name: x.displayName, reason: x.resolution })) }, null, 2));
