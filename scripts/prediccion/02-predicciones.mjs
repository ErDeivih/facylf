#!/usr/bin/env node
/*
 * 02-predicciones.mjs — paso 3 del encargo de predicción.
 *
 * Para cada partido de la temporada indicada calcula, con los parámetros del paso 2:
 *   · los goles esperados de local y visitante (λ_local, λ_visitante);
 *   · la matriz completa de marcadores 0-0 a 5-5 (36 celdas, sin redondear);
 *   · los porcentajes 1-X-2 normalizados sobre esa rejilla y el marcador más probable.
 *
 * Escribe en `analytics.poisson_partido` (migración 0061). Idempotente: borra las predicciones de la
 * temporada y las vuelve a insertar en una transacción.
 *
 * Un partido sólo entra si su edición tiene parámetros de liga (al menos un partido con marcador). Si un
 * equipo no tiene fuerza propia se usa 1,00 (la media), que es «no sé nada de este equipo», no un cero.
 *
 * Uso:
 *   node scripts/prediccion/02-predicciones.mjs --temporada 2026-27
 *   node scripts/prediccion/02-predicciones.mjs --temporada 2026-27 --limite 1000   (prueba)
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  matrizDeMarcadores, porcentajesDeMatriz, golesEsperados, MAX_GOLES,
} from '../lib/poisson.mjs';

try { process.loadEnvFile('.env'); } catch { /* el entorno puede traerla */ }
const url = process.env.DATABASE_URL_MIGRACION ?? process.env.DATABASE_URL_PUBLICADOR;
if (!url) {
  console.error('Falta DATABASE_URL_MIGRACION o DATABASE_URL_PUBLICADOR (en .env).');
  process.exit(2);
}
const requerir = createRequire(resolve('packages/canonico/package.json'));
const { Client } = requerir('pg');

const args = process.argv.slice(2);
const valor = (bandera, porDefecto) => {
  const i = args.indexOf(bandera);
  return i >= 0 ? args[i + 1] : porDefecto;
};
const TEMPORADA = valor('--temporada', '2026-27');
const LIMITE = Number(valor('--limite', '0')) || 0;
const TANDA = 500;
/** Límites de cordura para λ: fuera de [0,05, 6] el modelo deja de ser útil (y la rejilla 0-5 se queda corta). */
const LAMBDA_MIN = 0.05;
const LAMBDA_MAX = 6;

const c = new Client({ connectionString: url, statement_timeout: 1800000, application_name: 'prediccion-partidos' });
await c.connect();

try {
  const temporada = await c.query('select id, etiqueta from core.season where etiqueta = $1', [TEMPORADA]);
  if (!temporada.rowCount) throw new Error(`la temporada ${TEMPORADA} no está en core.season`);
  const seasonId = temporada.rows[0].id;

  console.log(`temporada ${TEMPORADA} (id ${seasonId}); leyendo partidos y parámetros…`);
  const partidos = await c.query(`
    select m.id match_id, pg.competition_edition_id ed,
           coalesce(hl.ataque, 1) ataque_local, coalesce(hl.defensa, 1) defensa_local,
           coalesce(al.ataque, 1) ataque_visitante, coalesce(al.defensa, 1) defensa_visitante,
           l.media_local, l.media_visitante, l.partidos partidos_liga
      from core.match m
      join core.phase_group pg on pg.id = m.phase_group_id
      join analytics.poisson_liga l on l.competition_edition_id = pg.competition_edition_id
      join core.team_entry hte on hte.id = m.home_team_entry_id
      join core.team_entry ate on ate.id = m.away_team_entry_id
      left join analytics.poisson_equipo hl
             on hl.competition_edition_id = pg.competition_edition_id and hl.team_season_id = hte.team_season_id
      left join analytics.poisson_equipo al
             on al.competition_edition_id = pg.competition_edition_id and al.team_season_id = ate.team_season_id
     where pg.competition_edition_id in (select id from core.competition_edition where season_id = $1)
     order by m.id
     ${LIMITE > 0 ? `limit ${LIMITE}` : ''}`, [seasonId]);
  console.log(`partidos con liga y equipos: ${partidos.rowCount}`);

  const totalLiga = await c.query(`
    select count(*) partidos
      from core.match m join core.phase_group pg on pg.id = m.phase_group_id
     where pg.competition_edition_id in (select id from core.competition_edition where season_id = $1)`,
  [seasonId]);
  console.log(`partidos totales de la temporada: ${totalLiga.rows[0].partidos} (sin liga con datos no se predicen)`);

  const filas = [];
  let sumaMasa = 0;
  for (const p of partidos.rows) {
    const goles = golesEsperados({
      mediaLocal: Number(p.media_local),
      mediaVisitante: Number(p.media_visitante),
      ataqueLocal: Number(p.ataque_local),
      defensaLocal: Number(p.defensa_local),
      ataqueVisitante: Number(p.ataque_visitante),
      defensaVisitante: Number(p.defensa_visitante),
    });
    const clamp = (x) => Math.min(LAMBDA_MAX, Math.max(LAMBDA_MIN, x));
    const lambdaLocal = clamp(goles.local);
    const lambdaVisitante = clamp(goles.visitante);
    const { matriz, masaEnRejilla } = matrizDeMarcadores(lambdaLocal, lambdaVisitante);
    const pct = porcentajesDeMatriz(matriz);
    sumaMasa += masaEnRejilla;
    filas.push({
      match: p.match_id, ed: p.ed,
      lh: lambdaLocal, lv: lambdaVisitante,
      p1: pct.local, px: pct.empate, p2: pct.visitante,
      marcador: pct.marcador, probMarcador: pct.probMarcador,
      matriz,
    });
  }

  console.log(`calculadas ${filas.length} matrices; masa media en la rejilla 0-5: ${(sumaMasa / Math.max(1, filas.length)).toFixed(5)}`);

  if (LIMITE > 0) {
    console.log('modo prueba (--limite): no se escribe nada. Ejemplo:', filas.slice(0, 3));
    process.exitCode = 0;
  } else {
    await c.query('begin');
    try {
      const borradas = await c.query(`
        delete from analytics.poisson_partido
         where competition_edition_id in (select id from core.competition_edition where season_id = $1)`,
      [seasonId]);
      console.log(`predicciones anteriores borradas: ${borradas.rowCount}`);

      let escritas = 0;
      for (let i = 0; i < filas.length; i += TANDA) {
        const lote = filas.slice(i, i + TANDA);
        const valores = [];
        const params = [];
        lote.forEach((f, j) => {
          const b = j * 12;
          valores.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12})`);
          params.push(f.match, f.ed, f.lh, f.lv, f.p1, f.px, f.p2, f.marcador, f.probMarcador,
            JSON.stringify(f.matriz), 'poisson-v1', new Date());
        });
        await c.query(`insert into analytics.poisson_partido
          (match_id, competition_edition_id, goles_esperados_local, goles_esperados_visitante,
           prob_local, prob_empate, prob_visitante, marcador_probable, prob_marcador, matriz, modelo, calculado_en)
          values ${valores.join(',')}
          on conflict (match_id) do nothing`, params);
        escritas += lote.length;
        if (escritas % 25000 === 0) console.log(`  ${escritas}…`);
      }
      await c.query('commit');
      console.log(`escritas ${escritas} predicciones en analytics.poisson_partido`);
    } catch (error) {
      await c.query('rollback');
      throw error;
    }
  }

  // Comprobación: que los porcentajes suman 100 y que el reparto no está degenerado.
  const control = await c.query(`
    select count(*) filas,
           round(avg(prob_local), 2) p1_medio,
           round(avg(prob_empate), 2) px_medio,
           round(avg(prob_visitante), 2) p2_medio,
           round(min(prob_local + prob_empate + prob_visitante), 2) suma_min,
           round(max(prob_local + prob_empate + prob_visitante), 2) suma_max,
           count(*) filter (where prob_local >= prob_empate and prob_local >= prob_visitante) favorito_local,
           count(*) filter (where prob_visitante > prob_local and prob_visitante >= prob_empate) favorito_visitante
      from analytics.poisson_partido p
      join core.competition_edition ce on ce.id = p.competition_edition_id
     where ce.season_id = $1`, [seasonId]);
  console.log('control:', control.rows[0]);
} finally {
  await c.end();
}
