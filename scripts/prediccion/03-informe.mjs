#!/usr/bin/env node
/*
 * 03-informe.mjs — comprobación legible de la predicción (paso 3).
 *
 * No escribe nada: cuenta las predicciones, comprueba que cada matriz tiene 36 celdas y que los tres
 * porcentajes suman 100, resume el reparto 1-X-2 y, con `--partido <id>`, imprime la matriz completa de
 * un partido para poder pegarla en un informe o compararla con la ficha.
 *
 * Uso:
 *   node scripts/prediccion/03-informe.mjs
 *   node scripts/prediccion/03-informe.mjs --temporada 2026-27 --partido 2000559
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

try { process.loadEnvFile('.env'); } catch { /* el entorno puede traerla */ }
const url = process.env.DATABASE_URL_LECTOR ?? process.env.DATABASE_URL_MIGRACION;
if (!url) {
  console.error('Falta DATABASE_URL_LECTOR (en .env).');
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
const PARTIDO = Number(valor('--partido', '0')) || 0;

const c = new Client({ connectionString: url, statement_timeout: 120000, application_name: 'prediccion-informe' });
await c.connect();
try {
  const resumen = await c.query(`
    select s.etiqueta temporada, count(*) predicciones,
           count(distinct p.competition_edition_id) ligas,
           round(avg(p.prob_local), 2) p1,
           round(avg(p.prob_empate), 2) px,
           round(avg(p.prob_visitante), 2) p2,
           round(min(p.prob_local + p.prob_empate + p.prob_visitante), 2) suma_min,
           round(max(p.prob_local + p.prob_empate + p.prob_visitante), 2) suma_max,
           count(*) filter (where (select count(*) from jsonb_object_keys(p.matriz)) <> 36) matrices_mal
      from analytics.poisson_partido p
      join core.competition_edition ce on ce.id = p.competition_edition_id
      join core.season s on s.id = ce.season_id
     where s.etiqueta = $1
     group by 1`, [TEMPORADA]);
  if (!resumen.rowCount) {
    console.log(`Sin predicciones para ${TEMPORADA}. Ejecuta 02-predicciones.mjs.`);
  } else {
    console.log('resumen:', resumen.rows[0]);
  }

  const marcadores = await c.query(`
    select p.marcador_probable marcador, count(*) veces, round(avg(p.prob_marcador), 2) prob_media
      from analytics.poisson_partido p
      join core.competition_edition ce on ce.id = p.competition_edition_id
      join core.season s on s.id = ce.season_id
     where s.etiqueta = $1
     group by 1 order by 2 desc limit 8`, [TEMPORADA]);
  console.log('marcadores más probables (los más repetidos):', marcadores.rows);

  if (PARTIDO > 0) {
    const fila = await c.query(`
      select p.*, m.goles_local, m.goles_visitante,
             (select ts.nombre from core.team_entry te join core.team_season ts on ts.id = te.team_season_id
               where te.id = m.home_team_entry_id) local,
             (select ts.nombre from core.team_entry te join core.team_season ts on ts.id = te.team_season_id
               where te.id = m.away_team_entry_id) visitante
        from analytics.poisson_partido p join core.match m on m.id = p.match_id
       where p.match_id = $1`, [PARTIDO]);
    if (!fila.rowCount) console.log(`El partido ${PARTIDO} no tiene predicción.`);
    else {
      const f = fila.rows[0];
      console.log(`\npartido ${f.match_id}: ${f.local} - ${f.visitante}` +
        `${f.goles_local === null ? ' (sin jugar)' : ` (resultado ${f.goles_local}-${f.goles_visitante})`}`);
      console.log(`λ local ${f.goles_esperados_local} · λ visitante ${f.goles_esperados_visitante}`);
      console.log(`1: ${f.prob_local} % · X: ${f.prob_empate} % · 2: ${f.prob_visitante} % · ` +
        `marcador ${f.marcador_probable} (${f.prob_marcador} %)`);
      const matriz = f.matriz;
      let cabecera = '      ';
      for (let j = 0; j <= 5; j += 1) cabecera += String(j).padStart(7);
      console.log(cabecera);
      for (let i = 0; i <= 5; i += 1) {
        let linea = `local ${i}`.padEnd(6);
        for (let j = 0; j <= 5; j += 1) linea += (matriz[`${i}-${j}`] * 100).toFixed(1).padStart(7);
        console.log(linea);
      }
    }
  }
} finally {
  await c.end();
}
