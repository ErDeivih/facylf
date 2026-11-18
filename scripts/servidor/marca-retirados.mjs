#!/usr/bin/env node
/*
 * ── MARCAR EQUIPOS RETIRADOS EN EL CANÓNICO, PARA TODAS LAS TEMPORADAS ─────────────────────────────────
 *
 * El detector (`detecta-retirados.mjs`) dice qué equipos han dejado de tener acta mientras sus rivales sí.
 * Este programa lo aplica al canónico: pone `core.team_entry.retirado = true` y los partidos que no se
 * jugaron como `cancelled` (o `administrative` si tienen marcador, porque entonces fue incomparecencia o
 * sanción, no retirada — criterio de Claude, 18/11/2026).
 *
 * Es idempotente: volver a pasarlo no cambia nada. Pensado para un temporizador semanal, de forma que en
 * las temporadas nuevas el conocimiento se aplique solo y nadie tenga que investigar caso por caso.
 *
 * Uso (dentro del contenedor del importador, que ve las colas y Postgres):
 *   node scripts/servidor/marca-retirados.mjs [--seco] [--minimo 3]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { analizaEquipo, MINIMO_POR_DEFECTO } from './detecta-retirados.mjs';

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

/** Devuelve, por temporada, la lista de {grupo, equipo} candidatos de todas las colas. */
export function candidatosDeColas(raiz = '/app', minimo = MINIMO_POR_DEFECTO, hoy = new Date().toISOString().slice(0, 10)) {
  const porTemporada = new Map();
  for (const carpeta of readdirSync(raiz).filter((c) => /^descargas-federacion(-[0-9]+)?$/.test(c))) {
    const ruta = `${raiz}/${carpeta}/recolector-local/cola-v2.sqlite`;
    if (!existsSync(ruta)) continue;
    const db = new DatabaseSync(ruta, { readOnly: true });
    let filas = [];
    try {
      filas = db.prepare(`
        select tm.etiqueta t, p.grupo, p.fecha, p.equipo_local_codigo l, p.equipo_visitante_codigo v,
               coalesce(p.codigo_acta, '') acta, p.goles_local gl, p.goles_visitante gv
          from partidos p join temporadas tm on tm.codigo = p.temporada
         where p.fecha is not null and p.fecha < ?
      `).all(hoy);
    } catch { filas = []; }
    db.close();

    const equipos = new Map();
    const actasPorGrupo = new Map();
    for (const f of filas) {
      if (f.acta !== '') actasPorGrupo.set(f.grupo, (actasPorGrupo.get(f.grupo) ?? 0) + 1);
      for (const codigo of [f.l, f.v]) {
        if (!codigo) continue;
        const clave = `${f.grupo}|${codigo}`;
        if (!equipos.has(clave)) equipos.set(clave, []);
        equipos.get(clave).push({ fecha: f.fecha, tieneActa: f.acta !== '' });
      }
    }
    for (const [clave, partidos] of equipos) {
      const [grupo, equipo] = clave.split('|');
      const a = analizaEquipo(partidos, minimo);
      if (!a.retirado) continue;
      if (a.motivo === 'nunca' && !(actasPorGrupo.get(grupo) > 0)) continue;
      const t = filas.find((f) => f.l === equipo || f.v === equipo)?.t;
      if (!t) continue;
      if (!porTemporada.has(t)) porTemporada.set(t, []);
      porTemporada.get(t).push({ grupo, equipo, motivo: a.motivo ?? 'desconocido', desde: a.desde });
    }
  }
  return porTemporada;
}

function main() {
  const seco = process.argv.includes('--seco');
  const minimo = Number(arg('minimo', MINIMO_POR_DEFECTO));
  const porTemporada = candidatosDeColas('/app', minimo);
  const total = [...porTemporada.values()].reduce((a, b) => a + b.length, 0);
  if (total === 0) { console.log('-- sin candidatos'); return; }
  if (seco) {
    for (const [t, lista] of porTemporada) console.log(`-- ${t}: ${lista.length} candidatos`);
    return;
  }
  // SQL idempotente: se aplica con psql (el contenedor del importador no trae el cliente de Postgres).
  const valores = [];
  for (const [t, lista] of porTemporada) {
    for (const c of lista) valores.push(`('${t}','${c.grupo}','${c.equipo}','${c.motivo}')`);
  }
  console.log('begin;');
  console.log('create temp table r(temporada text, grupo text, equipo text, motivo text) on commit drop;');
  console.log(`insert into r values ${valores.join(',')};`);
  console.log(`
update core.team_entry te set retirado = true
  from r, core.phase_group pg, core.competition_edition ce, core.season s
 where pg.codigo_externo = r.grupo and te.phase_group_id = pg.id
   and te.codigo_externo = r.equipo and ce.id = pg.competition_edition_id and s.id = ce.season_id
   and s.etiqueta = r.temporada and te.retirado = false;
update core.match m set official_status = 'administrative'
  from r, core.phase_group pg, core.competition_edition ce, core.season s, core.team_entry te
 where pg.codigo_externo = r.grupo and ce.id = pg.competition_edition_id and s.id = ce.season_id
   and s.etiqueta = r.temporada and te.phase_group_id = pg.id and te.codigo_externo = r.equipo
   and m.phase_group_id = pg.id and (m.home_team_entry_id = te.id or m.away_team_entry_id = te.id)
   and m.official_status not in ('played','administrative') and m.goles_local is not null;
update core.match m set official_status = 'cancelled'
  from r, core.phase_group pg, core.competition_edition ce, core.season s, core.team_entry te
 where pg.codigo_externo = r.grupo and ce.id = pg.competition_edition_id and s.id = ce.season_id
   and s.etiqueta = r.temporada and te.phase_group_id = pg.id and te.codigo_externo = r.equipo
   and m.phase_group_id = pg.id and (m.home_team_entry_id = te.id or m.away_team_entry_id = te.id)
   and m.official_status not in ('played','administrative','cancelled') and m.goles_local is null;
commit;`);
}

if (process.argv[1]?.endsWith('marca-retirados.mjs')) {
  try { main(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
