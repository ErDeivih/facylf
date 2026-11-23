#!/usr/bin/env node
/*
 * ── PÁGINA DE PREVIA DE UNA JORNADA, CON PRONÓSTICO ─────────────────────────────────────────────────────
 *
 * Para cada partido de una jornada saca lo que ya sabemos (día, hora, campo y árbitro) y un pronóstico
 * calculado con los resultados de la temporada: puntos por partido y goles a favor/en contra de cada equipo.
 *
 * El pronóstico es deliberadamente simple y explicable, no una caja negra:
 *   - fuerza de ataque de un equipo = goles marcados por partido;
 *   - fuerza de defensa = goles recibidos por partido;
 *   - goles esperados del local = su ataque × la defensa del visitante / media de la liga;
 *   - lo mismo para el visitante, con un 15 % de ventaja por jugar en casa.
 * De ahí salen los tres porcentajes (gana local / empate / gana visitante), redondeados.
 *
 * Uso:
 *   node previa-jornada.mjs --grupo 24218963 --jornada 7 [--salida previa.html]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function arg(nombre, porDefecto = null) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i === -1 || i === process.argv.length - 1) return porDefecto;
  return process.argv[i + 1];
}

const grupo = arg('grupo');
const jornada = arg('jornada');
if (!grupo || !jornada) {
  console.error('uso: previa-jornada.mjs --grupo <codigo> --jornada <numero> [--salida <fichero.html>]');
  process.exit(1);
}
const salida = arg('salida', 'previa.html');

/** Lanza una consulta y devuelve las filas como JSON. */
function consulta(sql) {
  const out = execFileSync('docker', [
    'exec', 'facylf-postgres', 'psql', '-U', 'facylf_admin', '-d', 'facylf', '-At', '-F', '\u0001', '-c', sql
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').filter(Boolean).map((linea) => linea.split('\u0001'));
}

const q = (s) => s.replace(/'/g, "''");

// 1) El grupo y su competición, para el título.
const cabecera = consulta(`
  select coalesce(g.nombre, 'Grupo'), s.etiqueta, coalesce(g.codigo_externo, '')
    from core.phase_group g
    join core.competition_edition ce on ce.id = g.competition_edition_id
        join core.season s on s.id = ce.season_id
   where g.codigo_externo = '${q(grupo)}' limit 1`)[0] ?? ['Grupo', '', grupo];

// 2) Los partidos de la jornada, con campo y árbitro.
const partidos = consulta(`
  select te.nombre_en_fuente, tv.nombre_en_fuente, m.fecha_prevista, m.hora_confirmada, m.played_at,
         coalesce(v.nombre, ''), coalesce(p.nombre_mostrado, ''),
         coalesce(m.goles_local::text, ''), coalesce(m.goles_visitante::text, '')
    from core.match m
    join core.phase_group g on g.id = m.phase_group_id
    join core.matchday md on md.id = m.matchday_id
    join core.team_entry te on te.id = m.home_team_entry_id
    join core.team_entry tv on tv.id = m.away_team_entry_id
    left join core.venue v on v.id = m.venue_id
    left join core.match_official o on o.match_id = m.id and o.rol = 'arbitro'
    left join core.person p on p.id = o.person_id
   where g.codigo_externo = '${q(grupo)}' and md.numero = ${Number(jornada)}
   order by m.fecha_prevista nulls last, m.hora_confirmada nulls last`);

// 3) Fuerza de cada equipo con los partidos ya jugados de su grupo.
const fuerza = new Map();
for (const [local, visitante, , , , , , gl, gv] of consulta(`
  select te.nombre_en_fuente, tv.nombre_en_fuente, null, null, null, null, null, m.goles_local, m.goles_visitante
    from core.match m
    join core.phase_group g on g.id = m.phase_group_id
    join core.team_entry te on te.id = m.home_team_entry_id
    join core.team_entry tv on tv.id = m.away_team_entry_id
   where g.codigo_externo = '${q(grupo)}' and m.goles_local is not null and m.goles_visitante is not null`)) {
  const a = Number(gl); const b = Number(gv);
  const suma = (equipo, favor, contra, puntos) => {
    const f = fuerza.get(equipo) ?? { pj: 0, gf: 0, gc: 0, pts: 0 };
    f.pj += 1; f.gf += favor; f.gc += contra; f.pts += puntos;
    fuerza.set(equipo, f);
  };
  suma(local, a, b, a > b ? 3 : a === b ? 1 : 0);
  suma(visitante, b, a, b > a ? 3 : a === b ? 1 : 0);
}
const mediaGoles = [...fuerza.values()].reduce((t, f) => t + f.gf, 0) / Math.max(1, [...fuerza.values()].reduce((t, f) => t + f.pj, 0));

/** Goles esperados y probabilidades de un partido. */
function pronostico(local, visitante) {
  const l = fuerza.get(local) ?? { pj: 0, gf: 0, gc: 0 };
  const v = fuerza.get(visitante) ?? { pj: 0, gf: 0, gc: 0 };
  if (l.pj < 2 || v.pj < 2 || mediaGoles === 0) return null;
  const ataqueL = l.gf / l.pj; const defensaV = v.gc / v.pj;
  const ataqueV = v.gf / v.pj; const defensaL = l.gc / l.pj;
  let espl = Math.max(0.15, (ataqueL * defensaV / mediaGoles) * 1.15);
  let espv = Math.max(0.15, ataqueV * defensaL / mediaGoles);
  // Poisson simple sobre 0..6 goles.
  const poisson = (lambda, k) => Math.exp(-lambda) * lambda ** k / [1, 1, 2, 6, 24, 120, 720][k];
  let p1 = 0; let px = 0; let p2 = 0;
  for (let a = 0; a <= 6; a += 1) {
    for (let b = 0; b <= 6; b += 1) {
      const p = poisson(espl, a) * poisson(espv, b);
      if (a > b) p1 += p; else if (a === b) px += p; else p2 += p;
    }
  }
  const total = p1 + px + p2;
  return {
    local: Math.round((p1 / total) * 100),
    empate: Math.round((px / total) * 100),
    visitante: Math.round((p2 / total) * 100),
    marcador: `${espl.toFixed(1)} - ${espv.toFixed(1)}`
  };
}

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

const filas = partidos.map(([local, visitante, fecha, hora, jugado, campo, arbitro, gl, gv]) => {
  const p = pronostico(local, visitante);
  const resultado = gl === '' ? '' : `${gl}-${gv}`;
  const cuando = jugado ? new Date(jugado).toLocaleString('es-ES') : `${fecha ?? 'sin fecha'}${hora ? ` · ${hora}` : ''}`;
  return `
    <tr>
      <td class="equipo">${esc(local)}</td>
      <td class="res">${resultado ? `<b>${resultado}</b>` : (p ? `<span class="pron">${p.marcador}</span>` : '')}</td>
      <td class="equipo der">${esc(visitante)}</td>
      <td class="cuando">${esc(cuando)}</td>
      <td>${esc(campo)}</td>
      <td>${esc(arbitro)}</td>
      <td class="prob">${p ? `${p.local}% · ${p.empate}% · ${p.visitante}%` : '—'}</td>
    </tr>`;
}).join('');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Previa · ${esc(cabecera[0])} · jornada ${esc(jornada)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 2rem; color: #1a1a1a; }
  h1 { font-size: 1.4rem; margin-bottom: .2rem; }
  .sub { color: #666; margin-bottom: 1.5rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: .5rem .6rem; border-bottom: 1px solid #e5e5e5; text-align: left; font-size: .92rem; }
  th { background: #fafafa; font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; color: #555; }
  .equipo { font-weight: 600; }
  .der { text-align: right; }
  .res { text-align: center; width: 5rem; }
  .pron { color: #0b6; font-variant-numeric: tabular-nums; }
  .prob { color: #444; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .cuando, td:nth-child(5) { color: #666; white-space: nowrap; }
  .pie { margin-top: 1.5rem; color: #888; font-size: .8rem; }
</style>
</head>
<body>
  <h1>${esc(cabecera[0])}</h1>
  <div class="sub">Temporada ${esc(cabecera[1])} · grupo ${esc(cabecera[2])} · <b>jornada ${esc(jornada)}</b></div>
  <table>
    <thead><tr><th>Local</th><th>Resultado</th><th>Visitante</th><th>Cuándo</th><th>Campo</th><th>Árbitro</th><th>Pronóstico</th></tr></thead>
    <tbody>${filas || '<tr><td colspan="7">No hay partidos para esa jornada.</td></tr>'}</tbody>
  </table>
  <div class="pie">Pronóstico calculado con los resultados de la temporada (ataque y defensa por partido, con ventaja de jugar en casa).
  Se muestra el marcador esperado en verde y, a la derecha, la probabilidad de victoria local, empate y victoria visitante.</div>
</body>
</html>`;

writeFileSync(salida, html);
console.log(`${partidos.length} partidos · ${fuerza.size} equipos con resultados · escrito ${salida}`);
