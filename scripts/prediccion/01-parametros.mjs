#!/usr/bin/env node
/*
 * 01-parametros.mjs — paso 2 del encargo de predicción.
 *
 * Calcula, con los partidos que ya están en el canónico, los parámetros del modelo Poisson:
 *   · por LIGA (edición de competición): media de goles del local y del visitante, media total y ventaja
 *     de casa, estabilizadas con la media de su federación y temporada (k_liga = 20 partidos);
 *   · por EQUIPO (inscripción): fuerza de ataque y de defensa relativas a la media de su liga, encogidas
 *     hacia 1 con k = 6 partidos, y mezcladas con la temporada anterior del mismo club (peso 0,5/partido).
 *
 * Escribe en `analytics.poisson_liga` y `analytics.poisson_equipo` (migración 0061). Es idempotente: borra
 * las filas de las temporadas que va a calcular y las vuelve a insertar en una sola transacción.
 *
 * Uso:
 *   node scripts/prediccion/01-parametros.mjs                      (2026-27 con 2025-26 detrás)
 *   node scripts/prediccion/01-parametros.mjs --temporada 2025-26 --anterior 2024-25
 *   node scripts/prediccion/01-parametros.mjs --seco               (sólo cuenta, no escribe)
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

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
const ANTERIOR = valor('--anterior', '2025-26');
const SECO = args.includes('--seco');
const K_LIGA = 20;
const K_EQUIPO = 6;
const PESO_ANTERIOR = 0.5;

const c = new Client({ connectionString: url, statement_timeout: 600000, application_name: 'prediccion-parametros' });
await c.connect();

try {
  const temporadas = await c.query('select id, etiqueta from core.season where etiqueta = any($1::text[])',
    [[TEMPORADA, ANTERIOR]]);
  const idDe = Object.fromEntries(temporadas.rows.map((f) => [f.etiqueta, f.id]));
  if (!idDe[TEMPORADA]) throw new Error(`la temporada ${TEMPORADA} no está en core.season`);
  if (!idDe[ANTERIOR]) throw new Error(`la temporada ${ANTERIOR} no está en core.season`);
  const ids = [idDe[ANTERIOR], idDe[TEMPORADA]];

  console.log(`temporadas: ${ANTERIOR} (id ${idDe[ANTERIOR]}) y ${TEMPORADA} (id ${idDe[TEMPORADA]})`);

  // ── 1 · Parámetros de liga ────────────────────────────────────────────────────────────────────────────
  // `ed` son las medias crudas de cada edición; `fed` la media de su federación y temporada, que estabiliza
  // las ediciones con pocos partidos. Sin partidos con marcador no hay fila: no se inventa una media.
  // `ed` son las medias crudas de cada edición; `fed` la media de su federación y temporada, que estabiliza
  // las ediciones con pocos partidos. Sin partidos con marcador no hay fila: no se inventa una media.
  const sqlLiga = `
    with base as (
      select ce.id ed, ce.federation_id fed, ce.season_id sea,
             m.goles_local::numeric gl, m.goles_visitante::numeric gv
        from core.match m
        join core.phase_group pg on pg.id = m.phase_group_id
        join core.competition_edition ce on ce.id = pg.competition_edition_id
       where ce.season_id = any($1::smallint[])
         and m.goles_local is not null and m.goles_visitante is not null
    ),
    ed as (
      select ed, fed, sea, count(*) n, avg(gl) ml, avg(gv) mv from base group by 1,2,3
    ),
    fed as (
      select fed, sea, avg(gl) ml, avg(gv) mv from base group by 1,2
    )
    select ed.ed competition_edition_id, ed.sea season_id, ed.n::int partidos,
           ((ed.ml * ed.n + $2 * f.ml) / (ed.n + $2))::numeric(6,4) media_local,
           ((ed.mv * ed.n + $2 * f.mv) / (ed.n + $2))::numeric(6,4) media_visitante,
           f.ml::numeric(6,4) media_fed_local, f.mv::numeric(6,4) media_fed_visitante
      from ed join fed f on f.fed = ed.fed and f.sea = ed.sea
     order by ed.ed`;

  const ligas = await c.query(sqlLiga, [ids, K_LIGA]);
  console.log(`ligas con partidos con marcador: ${ligas.rowCount}`);
  if (!ligas.rowCount) throw new Error('no hay partidos con marcador en esas temporadas');

  // ── 2 · Parámetros de equipo ──────────────────────────────────────────────────────────────────────────
  // Se cuentan los dos lados (cada partido aporta una fila por equipo). La inscripción es la clave del
  // equipo en la liga; el club + nombre normalizado enlaza la misma entidad en la temporada anterior.
  const sqlEquipo = `
    with base as (
      select ce.id ed, ce.season_id sea, m.id match_id,
             m.home_team_entry_id, m.away_team_entry_id,
             m.goles_local::numeric gl, m.goles_visitante::numeric gv
        from core.match m
        join core.phase_group pg on pg.id = m.phase_group_id
        join core.competition_edition ce on ce.id = pg.competition_edition_id
       where ce.season_id = any($1::smallint[])
         and m.goles_local is not null and m.goles_visitante is not null
    ),
    media as (
      select ed, avg((gl + gv) / 2) media_equipo from base group by 1
    ),
    equipo as (
      select b.ed, b.sea, te.team_season_id, ts.club_id, ts.nombre_norm,
             ce.federation_id fed, core.normaliza_nombre(ce.nombre_publicado) comp_norm,
             count(*)::int n,
             sum(case when b.home_team_entry_id = te.id then b.gl else b.gv end)::int gf,
             sum(case when b.home_team_entry_id = te.id then b.gv else b.gl end)::int ga
        from base b
        join core.team_entry te on te.id in (b.home_team_entry_id, b.away_team_entry_id)
        join core.team_season ts on ts.id = te.team_season_id
        join core.competition_edition ce on ce.id = b.ed
       group by 1,2,3,4,5,6,7
    ),
    previo as (
      select e.ed, e.team_season_id,
             coalesce(sum(p.n), 0)::int n_prev,
             coalesce(sum(p.gf), 0)::int gf_prev,
             coalesce(sum(p.ga), 0)::int ga_prev
        from equipo e
        left join equipo p on p.sea = $2 and p.club_id = e.club_id and p.nombre_norm = e.nombre_norm
                and p.fed = e.fed and p.comp_norm = e.comp_norm
       where e.sea = $3
       group by 1,2
    )
    select e.ed competition_edition_id, e.team_season_id, e.club_id, e.sea season_id,
           e.n partidos, e.gf goles_favor, e.ga goles_contra,
           coalesce(p.n_prev, 0) partidos_previos,
           m.media_equipo::numeric(6,4) media_equipo,
           case when e.sea = $3 then coalesce(p.gf_prev, 0) else 0 end gf_previos,
           case when e.sea = $3 then coalesce(p.ga_prev, 0) else 0 end ga_previos
      from equipo e
      join media m on m.ed = e.ed
      left join previo p on p.ed = e.ed and p.team_season_id = e.team_season_id
     order by e.ed, e.n desc`;

  const equipos = await c.query(sqlEquipo, [ids, idDe[ANTERIOR], idDe[TEMPORADA]]);
  console.log(`equipos (inscripciones) con partidos: ${equipos.rowCount}`);

  const ataque = (r) => {
    const media = Number(r.media_equipo);
    // Una edición sin goles (todo 0-0) no permite calcular fuerzas relativas: se queda en la media.
    if (!(media > 0)) return { ataque: 1, defensa: 1 };
    const nPrev = r.season_id === idDe[TEMPORADA] ? Number(r.partidos_previos) : 0;
    const gfPrev = r.season_id === idDe[TEMPORADA] ? Number(r.gf_previos) : 0;
    const gaPrev = r.season_id === idDe[TEMPORADA] ? Number(r.ga_previos) : 0;
    const n = Number(r.partidos) + PESO_ANTERIOR * nPrev + K_EQUIPO;
    const acota = (x) => Math.min(99, Math.max(0.01, x));
    return {
      ataque: acota((Number(r.goles_favor) + PESO_ANTERIOR * gfPrev + K_EQUIPO * media) / (n * media)),
      defensa: acota((Number(r.goles_contra) + PESO_ANTERIOR * gaPrev + K_EQUIPO * media) / (n * media)),
    };
  };

  if (SECO) {
    const muestra = equipos.rows.slice(0, 5).map((r) => ({ ...r, ...ataque(r) }));
    console.log('seco: no se escribe nada. Muestra:', muestra.map((r) => `${r.team_season_id} ataque=${r.ataque.toFixed(3)} defensa=${r.defensa.toFixed(3)}`));
  } else {
    await c.query('begin');
    try {
      await c.query('delete from analytics.poisson_equipo where season_id = any($1::smallint[])', [ids]);
      await c.query('delete from analytics.poisson_liga where season_id = any($1::smallint[])', [ids]);

      // Liga: se inserta lote a lote (una fila por edición) con la fórmula ya calculada en SQL.
      const filasLiga = ligas.rows.map((r) => {
        const ml = Number(r.media_local);
        const mv = Number(r.media_visitante);
        return {
          ed: r.competition_edition_id, sea: r.season_id, n: r.partidos,
          ml, mv, total: ml + mv, ventaja: mv > 0 ? ml / mv : 1,
        };
      });
      for (let i = 0; i < filasLiga.length; i += 500) {
        const lote = filasLiga.slice(i, i + 500);
        const valores = [];
        const params = [];
        lote.forEach((f, j) => {
          const b = j * 8;
          valores.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},now())`);
          params.push(f.ed, f.sea, f.n, f.ml, f.mv, f.total, f.ventaja, `${ANTERIOR}+${TEMPORADA}`);
        });
        await c.query(`insert into analytics.poisson_liga
          (competition_edition_id, season_id, partidos, media_local, media_visitante, media_total, ventaja_casa, temporadas, calculado_en)
          values ${valores.join(',')}`, params);
      }

      // Equipo: la fórmula lleva el encogido y la mezcla con la temporada anterior.
      const filasEquipo = equipos.rows.map((r) => ({ r, ...ataque(r) }));
      for (let i = 0; i < filasEquipo.length; i += 500) {
        const lote = filasEquipo.slice(i, i + 500);
        const valores = [];
        const params = [];
        lote.forEach(({ r, ataque: a, defensa: d }, j) => {
          const b = j * 10;
          valores.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},now())`);
          params.push(r.competition_edition_id, r.team_season_id, r.club_id, r.season_id, r.partidos,
            r.goles_favor, r.goles_contra, a, d,
            // Partidos previos que realmente entraron en la mezcla (0 en la temporada anterior).
            r.season_id === idDe[TEMPORADA] ? r.partidos_previos : 0);
        });
        await c.query(`insert into analytics.poisson_equipo
          (competition_edition_id, team_season_id, club_id, season_id, partidos, goles_favor, goles_contra,
           ataque, defensa, partidos_previos, calculado_en)
          values ${valores.join(',')}`, params);
      }
      // Normalización final: dentro de cada edición, la media de las fuerzas (ponderada por partidos) se
      // lleva a 1,00. Sin esto, la mezcla con la temporada anterior deja una media de 1,05-1,13 y el modelo
      // favorecería sistemáticamente al local. La media de la liga vuelve a ser el punto de referencia.
      await c.query(`
        with media as (
          select competition_edition_id,
                 sum(ataque * partidos) / nullif(sum(partidos), 0) media_ataque,
                 sum(defensa * partidos) / nullif(sum(partidos), 0) media_defensa
            from analytics.poisson_equipo
           where season_id = any($1::smallint[])
           group by 1
        )
        update analytics.poisson_equipo e
           set ataque = e.ataque / m.media_ataque,
               defensa = e.defensa / m.media_defensa
          from media m
         where m.competition_edition_id = e.competition_edition_id
           and m.media_ataque > 0 and m.media_defensa > 0`, [ids]);

      await c.query('commit');
      console.log(`escrito: ${filasLiga.length} ligas y ${filasEquipo.length} equipos`);
    } catch (error) {
      await c.query('rollback');
      throw error;
    }
  }

  // ── 3 · Comprobación de cordura ───────────────────────────────────────────────────────────────────────
  const control = await c.query(`
    select season_id,
           count(*) ligas,
           round(avg(media_total)::numeric, 3) media_total_media,
           round(min(media_total)::numeric, 3) media_total_min,
           round(max(media_total)::numeric, 3) media_total_max,
           round(avg(ventaja_casa)::numeric, 3) ventaja_media
      from analytics.poisson_liga group by 1 order by 1`);
  const equiposControl = await c.query(`
    select season_id, count(*) equipos, round(avg(ataque)::numeric, 3) ataque_medio,
           round(avg(defensa)::numeric, 3) defensa_media,
           count(*) filter (where ataque = 1 and defensa = 1) sin_datos
      from analytics.poisson_equipo group by 1 order by 1`);
  console.log('control ligas:', control.rows);
  console.log('control equipos:', equiposControl.rows);

  const mejores = await c.query(`
    select f.codigo fed, s.etiqueta temp, ts.nombre, e.ataque, e.defensa, e.partidos
      from analytics.poisson_equipo e
      join core.team_season ts on ts.id = e.team_season_id
      join core.competition_edition ce on ce.id = e.competition_edition_id
      join core.federation f on f.id = ce.federation_id
      join core.season s on s.id = e.season_id
     where e.season_id = $1 and e.partidos >= 5
     order by e.ataque desc limit 5`, [idDe[TEMPORADA]]);
  console.log('ataques más fuertes de la temporada:', mejores.rows);
} finally {
  await c.end();
}
