#!/usr/bin/env node
/*
 * mira-inscripciones.mjs — SÓLO LEE. Las inscripciones (core.team_entry) de un grupo en el canónico y los
 * equipos que cita la cola de origen, para diagnosticar choques de identidad de equipo
 * («team_entry_referencia_contextual_uq», «team_entry_grupo_codigo_uq»).
 *
 *   node scripts/claude/mira-inscripciones.mjs <fed> <temporada> <grupo> [ruta-cola]
 */
import { DatabaseSync } from 'node:sqlite';
import { abreCanonico } from '../lib/informes-consulta.mjs';

try { process.loadEnvFile('.env'); } catch { /* entorno */ }
const [fed, temp, grupo, rutaCola] = process.argv.slice(2);
const c = await abreCanonico(process.env.DATABASE_URL_PUBLICADOR);
await c.query('set session characteristics as transaction read only');
try {
  const { rows } = await c.query(`select te.id, te.team_season_id, te.codigo_externo, te.referencia_contextual, te.nombre_en_fuente,
        te.retirado, ts.nombre ts_nombre, pg.id pg
      from core.team_entry te join core.team_season ts on ts.id = te.team_season_id
      join core.phase_group pg on pg.id = te.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
      join core.season s on s.id = ce.season_id join core.federation f on f.id = ce.federation_id
     where f.codigo = $1 and s.etiqueta = $2 and pg.codigo_externo = $3 order by te.id`, [fed, temp, grupo]);
  console.log(`canónico · ${fed} ${temp} grupo ${grupo}: ${rows.length} inscripciones`);
  for (const r of rows) console.log(`  te ${r.id} · ts ${r.team_season_id} «${r.ts_nombre}» · cód ${r.codigo_externo ?? '-'} · ref ${r.referencia_contextual ?? '-'} · fuente «${r.nombre_en_fuente}»${r.retirado ? ' · RETIRADO' : ''}`);
  const dobles = rows.reduce((m, r) => (r.referencia_contextual ? m.set(r.referencia_contextual, (m.get(r.referencia_contextual) ?? 0) + 1) : m), new Map());
  for (const [ref, n] of dobles) if (n > 1) console.log(`  ⚠ referencia repetida: ${ref} ×${n}`);
} finally { await c.end(); }
if (rutaCola) {
  const db = new DatabaseSync(rutaCola, { readOnly: true });
  const t = db.prepare('select codigo from temporadas where etiqueta=?').get(temp)?.codigo;
  const filas = db.prepare(`select local nombre, equipo_local_codigo codigo from partidos where temporada=? and grupo=?
      union all select visitante, equipo_visitante_codigo from partidos where temporada=? and grupo=?`).all(t, grupo, t, grupo);
  const vistos = new Map();
  for (const f of filas) { const k = `${f.nombre}|${f.codigo ?? '-'}`; vistos.set(k, (vistos.get(k) ?? 0) + 1); }
  console.log(`cola · ${rutaCola.split(/[\\/]/).pop()} · ${vistos.size} formas de equipo en el calendario:`);
  for (const [k, n] of [...vistos].sort()) console.log(`  ${k} ×${n}`);
}
