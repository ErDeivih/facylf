#!/usr/bin/env node
/*
 * 05-registro.mjs — congela predicciones y calcula aciertos cuando hay resultado.
 *
 *  0. `prediccion_emitida_cruce` (0068): congela la predicción de los cruces del calendario previsto
 *     (0067) que se juegan en los próximos días y aún no son partido. Cuando el partido aparece en
 *     `core.match`, esa predicción pasa a `prediccion_emitida` con su fecha de emisión original. Sin este
 *     paso el registro no se llena: el canónico no tiene fila de un partido hasta que se ha jugado.
 *     Hoy es la expectativa del Poisson (`poisson-v1-calendario`); el ML sólo predice partidos con fila.
 *  1. `prediccion_emitida`: copia la predicción de los partidos pendientes tal como se publica. Es
 *     idempotente: si ya estaba congelada, no se reescribe.
 *  2. `prediccion_resultado`: para los partidos jugados con predicción congelada, guarda signo real,
 *     acierto, log-loss, Brier y si el marcador exacto se cumplió.
 *
 * Uso:
 *   node scripts/prediccion/05-registro.mjs
 *   node scripts/prediccion/05-registro.mjs --seco
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { golesEsperados, matrizDeMarcadores, porcentajesDeMatriz } from '../lib/poisson.mjs';

try { process.loadEnvFile('.env'); } catch { /* entorno */ }
const url = process.env.DATABASE_URL_PUBLICADOR ?? process.env.DATABASE_URL_MIGRACION;
if (!url) { console.error('Falta DATABASE_URL_PUBLICADOR/MIGRACION'); process.exit(2); }
const requerir = createRequire(resolve('packages/canonico/package.json'));
const { Client } = requerir('pg');
const seco = process.argv.includes('--seco');
/** Con cuántos días de antelación se congela la predicción de un cruce. */
const DIAS_DE_ANTELACION = 8;

const c = new Client({ connectionString: url, application_name: 'prediccion-registro' });
await c.connect();
try {
  // 0 · Cruces del calendario previsto: congelar y, si el partido ya existe, pasar al registro.
  try {
    const cruces = await c.query(`
      select p.phase_group_id::text g, p.home_team_entry_id::text local, p.away_team_entry_id::text visitante,
             p.jornada, to_char(p.fecha_prevista, 'YYYY-MM-DD') fecha,
             l.media_local::float8 ml, l.media_visitante::float8 mv,
             coalesce(fl.ataque, 1)::float8 al, coalesce(fl.defensa, 1)::float8 dl,
             coalesce(fv.ataque, 1)::float8 av, coalesce(fv.defensa, 1)::float8 dv
        from core.calendario_pendiente p
        join core.phase_group g on g.id = p.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.season s on s.id = e.season_id
        join core.team_entry el on el.id = p.home_team_entry_id
        join core.team_entry ev on ev.id = p.away_team_entry_id
        join analytics.poisson_liga l on l.competition_edition_id = e.id
        left join analytics.poisson_equipo fl on fl.competition_edition_id = e.id and fl.team_season_id = el.team_season_id
        left join analytics.poisson_equipo fv on fv.competition_edition_id = e.id and fv.team_season_id = ev.team_season_id
       where s.etiqueta = '2026-27'
         and p.fecha_prevista >= (now() at time zone 'Europe/Madrid')::date
         and p.fecha_prevista <  (now() at time zone 'Europe/Madrid')::date + $1::int
         and not exists (select 1 from analytics.prediccion_emitida_cruce x
                          where x.phase_group_id = p.phase_group_id
                            and x.home_team_entry_id = p.home_team_entry_id
                            and x.away_team_entry_id = p.away_team_entry_id)`, [DIAS_DE_ANTELACION]);
    const acota = (x) => Math.min(6, Math.max(0.05, x));
    let congelados = 0;
    for (let i = 0; i < cruces.rows.length && !seco; i += 300) {
      const valores = [];
      const params = [];
      cruces.rows.slice(i, i + 300).forEach((f, j) => {
        const goles = golesEsperados({
          mediaLocal: f.ml, mediaVisitante: f.mv,
          ataqueLocal: f.al, defensaLocal: f.dl, ataqueVisitante: f.av, defensaVisitante: f.dv,
        });
        const pct = porcentajesDeMatriz(matrizDeMarcadores(acota(goles.local), acota(goles.visitante)).matriz);
        const b = j * 10;
        valores.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},now(),$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`);
        params.push(f.g, f.local, f.visitante, f.jornada, f.fecha, 'poisson-v1-calendario',
          pct.local, pct.empate, pct.visitante, pct.marcador);
      });
      const r = await c.query(`insert into analytics.prediccion_emitida_cruce
        (phase_group_id, home_team_entry_id, away_team_entry_id, jornada, fecha_prevista, emitida_en, modelo,
         prob_local, prob_empate, prob_visitante, marcador_probable)
        values ${valores.join(',')}
        on conflict (phase_group_id, home_team_entry_id, away_team_entry_id) do nothing`, params);
      congelados += r.rowCount;
    }
    console.log(seco
      ? `seco: se congelarían ${cruces.rows.length} cruces de los próximos ${DIAS_DE_ANTELACION} días`
      : `cruces congelados nuevos: ${congelados}`);

    if (!seco) {
      const pasados = await c.query(`
        insert into analytics.prediccion_emitida
          (match_id, emitida_en, modelo, prob_local, prob_empate, prob_visitante, marcador_probable, prob_marcador)
        select m.id, x.emitida_en, x.modelo, x.prob_local, x.prob_empate, x.prob_visitante,
               x.marcador_probable, x.prob_marcador
          from analytics.prediccion_emitida_cruce x
          join core.match m on m.phase_group_id = x.phase_group_id
                           and m.home_team_entry_id = x.home_team_entry_id
                           and m.away_team_entry_id = x.away_team_entry_id
        on conflict (match_id) do nothing`);
      console.log(`cruces que ya son partido, pasados al registro: ${pasados.rowCount}`);
    }
  } catch (error) {
    if (error.code !== '42P01') throw error;
    console.log('sin calendario previsto (migraciones 0067/0068 sin aplicar): se salta la congelación por cruce');
  }

  const pendientes = await c.query(`
    insert into analytics.prediccion_emitida
      (match_id, emitida_en, modelo, prob_local, prob_empate, prob_visitante, marcador_probable, prob_marcador)
    select p.match_id, now(), p.modelo, p.prob_local, p.prob_empate, p.prob_visitante,
           p.marcador_probable, p.prob_marcador
      from analytics.prediccion_ml p
      join core.match m on m.id = p.match_id
      join core.phase_group g on g.id = m.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.season s on s.id = e.season_id
     where s.etiqueta = '2026-27' and m.goles_local is null
    on conflict (match_id) do nothing`);
  console.log(`predicciones congeladas nuevas: ${pendientes.rowCount}`);

  const resultados = await c.query(`
    with base as (
      select e.match_id, m.goles_local gl, m.goles_visitante gv,
             e.prob_local / 100.0 p1, e.prob_empate / 100.0 px, e.prob_visitante / 100.0 p2,
             e.marcador_probable,
             case when m.goles_local > m.goles_visitante then 0
                  when m.goles_local = m.goles_visitante then 1 else 2 end signo
        from analytics.prediccion_emitida e
        join core.match m on m.id = e.match_id
       where m.goles_local is not null and m.goles_visitante is not null
    )
    insert into analytics.prediccion_resultado
      (match_id, signo_real, acierto, log_loss, brier, marcador_acierto, calculado_en)
    select match_id, signo,
           (case signo when 0 then p1 when 1 then px else p2 end) =
             greatest(p1, px, p2) as acierto,
           -ln(greatest(case signo when 0 then p1 when 1 then px else p2 end, 0.0001))::numeric(8,5) as log_loss,
           (power(p1 - (signo = 0)::int, 2) + power(px - (signo = 1)::int, 2)
            + power(p2 - (signo = 2)::int, 2))::numeric(8,5) as brier,
           (marcador_probable = gl::text || '-' || gv::text) as marcador_acierto,
           now()
      from base
    on conflict (match_id) do update set
      signo_real = excluded.signo_real, acierto = excluded.acierto,
      log_loss = excluded.log_loss, brier = excluded.brier,
      marcador_acierto = excluded.marcador_acierto, calculado_en = now()`);
  console.log(`resultados evaluados/actualizados: ${resultados.rowCount}`);

  const resumen = await c.query(`
    select count(*) n, round(avg(acierto::int) * 100, 2) acierto,
           round(avg(log_loss), 5) log_loss, round(avg(brier), 5) brier,
           round(avg(marcador_acierto::int) * 100, 2) marcador
      from analytics.prediccion_resultado`);
  console.log('registro:', resumen.rows[0]);
  if (seco) console.log('(seco: sólo afecta a la congelación por cruce; los pasos 1 y 2 sí han escrito, como antes)');
} finally {
  await c.end();
}
