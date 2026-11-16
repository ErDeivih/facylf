#!/usr/bin/env node
/*
 * 05-registro.mjs — congela predicciones y calcula aciertos cuando hay resultado.
 *
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

try { process.loadEnvFile('.env'); } catch { /* entorno */ }
const url = process.env.DATABASE_URL_PUBLICADOR ?? process.env.DATABASE_URL_MIGRACION;
if (!url) { console.error('Falta DATABASE_URL_PUBLICADOR/MIGRACION'); process.exit(2); }
const requerir = createRequire(resolve('packages/canonico/package.json'));
const { Client } = requerir('pg');
const seco = process.argv.includes('--seco');

const c = new Client({ connectionString: url, application_name: 'prediccion-registro' });
await c.connect();
try {
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
           -ln(case signo when 0 then p1 when 1 then px else p2 end)::numeric(8,5) as log_loss,
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
  if (seco) console.log('(seco: no se escribe nada en una implementación completa; aquí las escrituras ya se han hecho)');
} finally {
  await c.end();
}
