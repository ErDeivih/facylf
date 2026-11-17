import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Consultas de la pantalla de competición (pantalla 2 del prototipo: clasificación y jornada).
 *
 * Las demás piezas de esa pantalla ya existían y se reutilizan sin copiarlas: `clasificación-del-grupo`,
 * `partidos-de-grupo` (partidos.ts), `zonas-del-grupo` y `ranking-goleadores` (paneles.ts) y
 * `rachas-del-grupo` (analisis.ts). Aquí sólo va lo que faltaba para que la página se pueda montar
 * **por id de grupo** (que es como se enlaza cada pantalla) y para que los desplegables salgan de la
 * base en vez de estar escritos a mano.
 *
 * Regla del proyecto que se respeta en todas: un `null` es «no se sabe» y la página lo pinta como tal;
 * nunca se convierte en `0`.
 */

export type FilaPortadaGrupo = {
  grupo_id: number;
  federacion: string;
  federacion_nombre: string;
  /**
   * Nombre corto real de la federación («Castilla y León»), de `analytics.federacion_ficha`. Es el que
   * enseña la miga del prototipo; el nombre largo queda como respaldo si la ficha no lo tiene.
   */
  federacion_corta: string | null;
  temporada: string;
  edicion: string;
  edicion_id: number;
  grupo: string;
  grupo_codigo: string;
  categoria: string;
  division: string;
  modalidad: string;
  genero: string;
  ambito: string;
  jornadas_previstas: number | null;
  equipos: number;
  partidos_conocidos: number | null;
  partidos_con_resultado: number | null;
  complete_through_matchday: number | null;
  visibility_state: string;
  jornada_actual: number | null;
  origen_clasificacion: string | null;
  calculado_en: string | null;
  /** Primera y última fecha publicada en el calendario del grupo, para los extremos de la barra. */
  fecha_inicio: string | null;
  fecha_fin: string | null;
  /**
   * Fecha del último partido CON RESULTADO publicado (`goles_local` y `goles_visitante` no nulos), no la
   * última jornada programada. Es lo que necesita la barra de temporada para poner a la derecha hasta
   * dónde se ha jugado de verdad. `null` si el grupo no tiene ningún resultado.
   *
   * Opcional en el tipo por la misma razón que `federacion_tiene_escudo`: `columnas` lo exige en cada
   * fila y la prueba de contrato lo comprueba contra el canónico, pero una fila construida a mano no
   * tiene que inventarse una fecha.
   */
  fecha_ultima_jugada?: string | null;
  /**
   * Si la federación dueña de la competición tiene escudo vigente en `core.federation_asset`. Es lo que
   * decide si la cabecera pinta el escudo real o el marcador con las siglas. `false` no es «no lo sé»:
   * la consulta comprueba el registro vigente y, si no hay, no hay.
   *
   * Opcional en el tipo, no en la consulta: `columnas` lo exige en cada fila y la prueba de contrato lo
   * comprueba contra el canónico. Va opcional para que una fila construida a mano (pruebas de render)
   * no tenga que inventarse un escudo que no le corresponde.
   */
  federacion_tiene_escudo?: boolean | null;
};

/**
 * Cabecera de la pantalla: a qué federación, temporada, competición y grupo pertenece, hasta dónde
 * llega su cobertura y de dónde sale su tabla. Se pide por id de grupo, que es lo que lleva la URL.
 */
export const GRUPO_POR_ID: Consulta<FilaPortadaGrupo> = {
  nombre: 'grupo-por-id',
  descripcion: 'Portada de la pantalla de competición: federación, temporada, edición, grupo, cobertura y origen de la clasificación.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['grupo_id', 'federacion', 'federacion_nombre', 'federacion_corta', 'temporada', 'edicion',
    'edicion_id', 'grupo', 'grupo_codigo', 'categoria', 'division', 'modalidad', 'genero', 'ambito',
    'jornadas_previstas', 'equipos', 'partidos_conocidos', 'partidos_con_resultado',
    'complete_through_matchday', 'visibility_state', 'jornada_actual', 'origen_clasificacion', 'calculado_en',
    'fecha_inicio', 'fecha_fin', 'fecha_ultima_jugada', 'federacion_tiene_escudo'],
  sql: `
    select g.id                       as grupo_id,
           f.codigo                   as federacion,
           f.nombre                   as federacion_nombre,
           ff.nombre_corto            as federacion_corta,
           s.etiqueta                 as temporada,
           e.nombre_publicado         as edicion,
           e.id                       as edicion_id,
           g.nombre                   as grupo,
           g.codigo_externo           as grupo_codigo,
           e.categoria,
           e.division,
           e.modalidad,
           e.genero,
           e.ambito,
           g.jornadas_previstas,
           (select count(*) from core.team_entry te where te.phase_group_id = g.id)::int as equipos,
           c.partidos_conocidos,
           c.partidos_con_resultado,
           c.complete_through_matchday,
           e.visibility_state,
           (select max(d.numero)
              from core.match m join core.matchday d on d.id = m.matchday_id
             where m.phase_group_id = g.id and m.goles_local is not null and m.goles_visitante is not null) as jornada_actual,
           (select st.origen
              from core.standing_snapshot st
             where st.phase_group_id = g.id
             order by case when st.origen = 'oficial' then 0 else 1 end, st.matchday_id desc
             limit 1)                 as origen_clasificacion,
           c.calculado_en,
           -- Extremos del calendario: primero la fecha jugada y, si el partido aún no se jugó, la fecha
           -- prevista publicada. Sin esto, un grupo con calendario y sin resultados (75252) no enseñaba
           -- ninguna fecha en la barra aunque la federación las hubiera publicado (hallazgo C9 del QA).
           (select to_char(min(coalesce(m.played_at, m.fecha_prevista::timestamptz)), 'YYYY-MM-DD')
              from core.match m where m.phase_group_id = g.id) as fecha_inicio,
           (select to_char(max(coalesce(m.played_at, m.fecha_prevista::timestamptz)), 'YYYY-MM-DD')
              from core.match m where m.phase_group_id = g.id) as fecha_fin,
           -- Última fecha JUGADA: sólo partidos con resultado publicado. «fecha_fin» mezcla jugados y
           -- programados; la barra de temporada necesita la de verdad para no afirmar que se jugó una
           -- jornada que sólo está en el calendario.
           (select to_char(max(coalesce(m.played_at, m.fecha_prevista::timestamptz)), 'YYYY-MM-DD')
              from core.match m
             where m.phase_group_id = g.id
               and m.goles_local is not null and m.goles_visitante is not null) as fecha_ultima_jugada,
           -- El escudo de la federación (0056) se pide con un EXISTS: la cabecera sólo necesita saber
           -- si existe, no el binario. La web lo pide aparte a la ruta de escudos de federación y sólo
           -- si esto es cierto, así que una federación sin escudo no genera ni una petición.
           exists (select 1 from core.federation_asset fa
                    where fa.federation_id = f.id and fa.tipo = 'escudo' and fa.vigente) as federacion_tiene_escudo
      from core.phase_group g
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      left join analytics.federacion_ficha ff on ff.codigo = f.codigo
      join core.season s on s.id = e.season_id
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
     where g.id = $1
     limit 1`,
};

export type FilaGrupoDeLaEdicion = {
  grupo_id: number;
  grupo: string;
  grupo_codigo: string;
  equipos: number;
};

/** Los grupos de la misma edición, para el desplegable «Grupo». Parámetros: (1) edición. */
export const GRUPOS_DE_LA_EDICION: Consulta<FilaGrupoDeLaEdicion> = {
  nombre: 'grupos-de-la-edición',
  descripcion: 'Grupos hermanos de una misma edición de competición, con cuántos equipos tiene cada uno.',
  plan: 'indexado',
  presupuestoMs: 200,
  columnas: ['grupo_id', 'grupo', 'grupo_codigo', 'equipos'],
  sql: `
    select g.id            as grupo_id,
           g.nombre        as grupo,
           g.codigo_externo as grupo_codigo,
           (select count(*) from core.team_entry te where te.phase_group_id = g.id)::int as equipos
      from core.phase_group g
     where g.competition_edition_id = $1
     order by g.nombre
     limit 50`,
};

export type FilaEdicionDeLaCompeticion = {
  temporada: string;
  edicion_id: number;
  grupo_id: number;
  grupos: number;
};

/**
 * Las temporadas de la MISMA competición (misma federación, categoría, división y nombre publicado),
 * para el desplegable «Temporada». Cuando el grupo se llama igual en la temporada anterior se enlaza
 * ése; si no, el primero de la edición. Parámetros: (1) grupo actual.
 */
export const EDICIONES_DE_LA_COMPETICION: Consulta<FilaEdicionDeLaCompeticion> = {
  nombre: 'ediciones-de-la-competición',
  descripcion: 'Temporadas de la misma competición, con el grupo equivalente de cada una, para el desplegable de temporada.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['temporada', 'edicion_id', 'grupo_id', 'grupos'],
  sql: `
    with base as (
      select ce.federation_id, ce.categoria, ce.division, ce.nombre_publicado, g.nombre as grupo_nombre
        from core.phase_group g
        join core.competition_edition ce on ce.id = g.competition_edition_id
       where g.id = $1
    )
    select s.etiqueta as temporada,
           ce.id      as edicion_id,
           coalesce(
             (select g2.id from core.phase_group g2
               where g2.competition_edition_id = ce.id and g2.nombre = b.grupo_nombre limit 1),
             (select g2.id from core.phase_group g2
               where g2.competition_edition_id = ce.id order by g2.nombre limit 1)
           ) as grupo_id,
           (select count(*) from core.phase_group g3 where g3.competition_edition_id = ce.id)::int as grupos
      from base b
      join core.competition_edition ce on ce.federation_id = b.federation_id
                                      and ce.categoria = b.categoria
                                      and ce.division = b.division
                                      and ce.nombre_publicado = b.nombre_publicado
      join core.federation f on f.id = ce.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = ce.season_id
     order by s.etiqueta desc
     limit 20`,
};

export type FilaClasificacionPantalla = {
  posicion: number;
  equipo_id: number;
  equipo: string;
  puntos: number;
  jugados: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  goles_favor: number;
  goles_contra: number;
  /**
   * Los goles de la reconstrucción para el mismo equipo. Hacen falta porque la tabla oficial de
   * algunas federaciones (medido en CyL, 2026) NO publica goles y el importador los guarda en 0: un
   * 0:0 ahí no es un resultado, es «no publicado». La página usa estos cuando la oficial no los trae.
   */
  goles_favor_reconstruida: number | null;
  goles_contra_reconstruida: number | null;
  origen: string;
  jornada: number;
  /**
   * El club canónico del equipo-temporada (`core.club.id`). Va en la MISMA fila que el equipo para que
   * la tabla pinte todos sus escudos con una sola consulta: pedir el club de cada fila habría sido un
   * N+1 de 16 peticiones por pantalla.
   *
   * Opcional en el tipo, no en la consulta (`columnas` lo exige): una fila construida a mano puede no
   * traerlo y entonces el componente pinta su marcador de siempre.
   */
  club_id?: number | null;
  /** Si ese club tiene escudo vigente en `core.club_asset`. `false` = no hay; no es una incógnita. */
  tiene_escudo?: boolean | null;
  /**
   * Nombre corto de la inscripción (`analytics.nombre_corto_equipo`, 0060) para la tabla donde el
   * nombre completo no cabe. `null` si todavía no se ha derivado; el componente cae al nombre completo.
   */
  equipo_corto?: string | null;
  /** Jornada de la última tabla OFICIAL publicada (para avisar si está desfasada). */
  oficial_jornada?: number | null;
  /** Puntos y partidos jugados según la oficial, para comparar con la calculada. */
  oficial_puntos?: number | null;
  oficial_jugados?: number | null;
};

/**
 * La tabla que enseña la pantalla: la OFICIAL si la federación la publicó, y si no la reconstruida.
 *
 * No se mezclan las dos en la misma tabla. La consulta vieja (`clasificación-del-grupo`) devuelve las
 * dos a propósito, para la página que las compara; aquí se elige una y se dice cuál es, que es lo que
 * el diseño pide al pie («la clasificación es la oficial publicada por la federación tras cada
 * jornada»). Parámetros: (1) grupo.
 */
export const CLASIFICACION_DE_LA_PANTALLA: Consulta<FilaClasificacionPantalla> = {
  nombre: 'clasificación-de-la-pantalla',
  descripcion: 'Clasificación que enseña la ficha del grupo: la oficial si existe y, si no, la reconstruida, con su origen y su jornada.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['posicion', 'equipo_id', 'equipo', 'puntos', 'jugados', 'ganados', 'empatados', 'perdidos',
    'goles_favor', 'goles_contra', 'goles_favor_reconstruida', 'goles_contra_reconstruida', 'origen', 'jornada',
    'club_id', 'tiene_escudo', 'equipo_corto'],
  sql: `
    with elegido as (
      select case
               when exists (select 1 from core.standing_snapshot st
                             where st.phase_group_id = $1 and st.origen = 'oficial') then 'oficial'
               else 'reconstruida'
             end as origen
    ),
    ultima as (
      select max(st.matchday_id) as id
        from core.standing_snapshot st
        join elegido el on el.origen = st.origen
       where st.phase_group_id = $1
    )
    select s.posicion,
           te.id               as equipo_id,
           te.nombre_en_fuente as equipo,
           s.puntos,
           s.jugados,
           s.ganados,
           s.empatados,
           s.perdidos,
           s.goles_favor,
           s.goles_contra,
           rh.goles_favor      as goles_favor_reconstruida,
           rh.goles_contra     as goles_contra_reconstruida,
           s.origen,
           d.numero            as jornada,
           -- El club y su escudo viajan con la fila de la tabla: la pantalla pinta los 16 escudos con
           -- ESTA consulta y no pide uno por equipo. El EXISTS va contra el índice del registro
           -- vigente (club_asset_vigente_unico_idx), así que no hay recorrido completo.
           cl.id               as club_id,
           exists (select 1 from core.club_asset ca
                    where ca.club_id = cl.id and ca.tipo = 'escudo' and ca.vigente) as tiene_escudo,
           -- Nombre corto guardado (0060) para la tabla: una lectura por fila y sin reglas en el JSX.
           nce.nombre_corto    as equipo_corto
      from core.standing_snapshot s
      join elegido el on el.origen = s.origen
      join ultima u on u.id = s.matchday_id
      join core.team_entry te on te.id = s.team_entry_id
      join core.team_season ts on ts.id = te.team_season_id
      join core.club cl on cl.id = ts.club_id
      left join analytics.nombre_corto_equipo nce on nce.team_entry_id = te.id
      join core.matchday d on d.id = s.matchday_id
      left join lateral (
        select sr.goles_favor, sr.goles_contra
          from core.standing_snapshot sr
         where sr.phase_group_id = $1 and sr.team_entry_id = s.team_entry_id and sr.origen = 'reconstruida'
           -- MISMA FOTO: la reconstrucción tiene que ser de la misma jornada que la tabla oficial. Sin
           -- esto, en el grupo 3769 (tabla oficial de la jornada 2, PJ=2) se pintaban los goles de la
           -- reconstrucción de la jornada 4 y un equipo con dos partidos jugados aparecía con 14:2.
           and sr.matchday_id = s.matchday_id
         limit 1
      ) rh on true
     where s.phase_group_id = $1
     order by s.posicion
     limit 40`,
};


/**
 * La clasificación CALCULADA con los resultados del grupo, que es la que se publica.
 *
 * Por qué: en CyL la federación publica la tabla oficial solo de vez en cuando (en el grupo 2939, de la
 * jornada 7 había 48 partidos con resultado y la tabla oficial era la de la jornada 1: todos los equipos
 * con PJ=1 y un Villamayor 10-0 Alba que la tabla no recogía). Enseñar esa foto es enseñar algo que no
 * cuadra con los resultados de la misma página. Aquí se calcula desde `core.match` (con resultado) y se
 * trae al lado la oficial para poder avisar de la diferencia sin publicarla.
 *
 * Parámetros: (1) phase_group_id.
 */
export const CLASIFICACION_CALCULADA: Consulta<FilaClasificacionPantalla> = {
  nombre: 'clasificación-calculada',
  descripcion: 'Clasificación calculada con los resultados del grupo, con la jornada alcanzada y, al lado, la oficial para comparar.',
  plan: 'indexado',
  presupuestoMs: 500,
  columnas: ['posicion', 'equipo_id', 'equipo', 'puntos', 'jugados', 'ganados', 'empatados', 'perdidos',
    'goles_favor', 'goles_contra', 'goles_favor_reconstruida', 'goles_contra_reconstruida', 'origen', 'jornada',
    'club_id', 'tiene_escudo', 'equipo_corto', 'oficial_jornada', 'oficial_puntos', 'oficial_jugados'],
  sql: `
    with resultados as (
      select m.home_team_entry_id as equipo_id, m.goles_local as gf, m.goles_visitante as gc
        from core.match m
       where m.phase_group_id = $1 and m.goles_local is not null and m.goles_visitante is not null
      union all
      select m.away_team_entry_id, m.goles_visitante, m.goles_local
        from core.match m
       where m.phase_group_id = $1 and m.goles_local is not null and m.goles_visitante is not null
    ),
    agg as (
      select equipo_id,
             count(*)::int                                        as jugados,
             count(*) filter (where gf > gc)::int                 as ganados,
             count(*) filter (where gf = gc)::int                 as empatados,
             count(*) filter (where gf < gc)::int                 as perdidos,
             sum(gf)::int                                          as goles_favor,
             sum(gc)::int                                          as goles_contra,
             sum(case when gf > gc then 3 when gf = gc then 1 else 0 end)::int as puntos
        from resultados group by equipo_id
    ),
    ultima as (
      select max(d.numero) as jornada
        from core.match m join core.matchday d on d.id = m.matchday_id
       where m.phase_group_id = $1 and m.goles_local is not null
    ),
    oficial as (
      select s.team_entry_id, s.puntos, s.jugados, d.numero as jornada
        from core.standing_snapshot s join core.matchday d on d.id = s.matchday_id
       where s.phase_group_id = $1 and s.origen = 'oficial'
         and s.matchday_id = (select max(matchday_id) from core.standing_snapshot
                               where phase_group_id = $1 and origen = 'oficial')
    )
    select row_number() over (order by a.puntos desc, (a.goles_favor - a.goles_contra) desc,
                              a.goles_favor desc, te.nombre_en_fuente)::int as posicion,
           te.id                          as equipo_id,
           te.nombre_en_fuente            as equipo,
           a.puntos, a.jugados, a.ganados, a.empatados, a.perdidos,
           a.goles_favor, a.goles_contra,
           a.goles_favor                  as goles_favor_reconstruida,
           a.goles_contra                 as goles_contra_reconstruida,
           'reconstruida'::text           as origen,
           u.jornada::int                 as jornada,
           cl.id                          as club_id,
           exists (select 1 from core.club_asset ca
                    where ca.club_id = cl.id and ca.tipo = 'escudo' and ca.vigente) as tiene_escudo,
           nce.nombre_corto               as equipo_corto,
           o.jornada                      as oficial_jornada,
           o.puntos                       as oficial_puntos,
           o.jugados                      as oficial_jugados
      from agg a
      join core.team_entry te on te.id = a.equipo_id
      join core.team_season ts on ts.id = te.team_season_id
      join core.club cl on cl.id = ts.club_id
      join ultima u on true
      left join analytics.nombre_corto_equipo nce on nce.team_entry_id = te.id
      left join oficial o on o.team_entry_id = te.id
     order by posicion
     limit 40`,
};

/** Frescura del grupo: partidos con resultado, actas disponibles y fecha del último partido jugado. */
export const FRESCURA_DEL_GRUPO: Consulta<{ con_resultado: number; partidos: number; actas: number; ultimo: string | null }> = {
  nombre: 'frescura-del-grupo',
  descripcion: 'Partidos con resultado, actas enlazadas y fecha del último partido del grupo.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['con_resultado', 'partidos', 'actas', 'ultimo'],
  sql: `
    select count(*) filter (where m.goles_local is not null)::int as con_resultado,
           count(*)::int                                        as partidos,
           (select count(*)::int from core.match_report mr where mr.match_id in
              (select m2.id from core.match m2 where m2.phase_group_id = $1)) as actas,
           max(m.played_at)::text                               as ultimo
      from core.match m
     where m.phase_group_id = $1
     limit 1`,
};


/**
 * Panel de calidad del grupo: reglas de coherencia y KPIs, todo calculado desde los partidos.
 *
 * Reglas (cada una debe dar 0; si no, el grupo tiene una incoherencia y la pantalla lo avisa):
 *  · PJ = V + E + D  → `descuadre_pj`
 *  · puntos = 3V + E → `descuadre_puntos`
 *  · Σ goles a favor = Σ goles en contra → `descuadre_goles`
 *
 * Parámetros: (1) phase_group_id.
 */
export const CALIDAD_DEL_GRUPO: Consulta<{
  partidos: number; con_resultado: number; con_acta: number; actas: number; goles: number;
  victorias_local: number; empates: number; victorias_visitante: number; equipos: number;
  suma_pj: number; descuadre_pj: number; descuadre_puntos: number; descuadre_goles: number;
}> = {
  nombre: 'calidad-del-grupo',
  descripcion: 'Reglas de coherencia (PJ, puntos, goles) y KPIs del grupo calculados desde los partidos.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['partidos', 'con_resultado', 'con_acta', 'actas', 'goles', 'victorias_local', 'empates',
    'victorias_visitante', 'equipos', 'suma_pj', 'descuadre_pj', 'descuadre_puntos', 'descuadre_goles'],
  sql: `
    with resultados as (
      select m.home_team_entry_id as equipo_id, m.goles_local as gf, m.goles_visitante as gc
        from core.match m
       where m.phase_group_id = $1 and m.goles_local is not null and m.goles_visitante is not null
      union all
      select m.away_team_entry_id, m.goles_visitante, m.goles_local
        from core.match m
       where m.phase_group_id = $1 and m.goles_local is not null and m.goles_visitante is not null
    ),
    calc as (
      select equipo_id,
             count(*)::int jugados,
             count(*) filter (where gf > gc)::int ganados,
             count(*) filter (where gf = gc)::int empatados,
             count(*) filter (where gf < gc)::int perdidos,
             sum(gf)::int gf, sum(gc)::int gc,
             sum(case when gf > gc then 3 when gf = gc then 1 else 0 end)::int puntos
        from resultados group by equipo_id
    )
    select (select count(*)::int from core.match m where m.phase_group_id = $1) partidos,
           (select count(*)::int from core.match m
             where m.phase_group_id = $1 and m.goles_local is not null) con_resultado,
           (select count(*)::int from core.match m
             where m.phase_group_id = $1
               and exists (select 1 from core.match_report r where r.match_id = m.id)) con_acta,
           (select count(*)::int from core.match_report r
              join core.match m on m.id = r.match_id where m.phase_group_id = $1) actas,
           (select coalesce(sum(m.goles_local + m.goles_visitante), 0)::int from core.match m
             where m.phase_group_id = $1 and m.goles_local is not null) goles,
           (select count(*)::int from core.match m where m.phase_group_id = $1
               and m.goles_local > m.goles_visitante) victorias_local,
           (select count(*)::int from core.match m where m.phase_group_id = $1
               and m.goles_local = m.goles_visitante) empates,
           (select count(*)::int from core.match m where m.phase_group_id = $1
               and m.goles_local < m.goles_visitante) victorias_visitante,
           (select count(*)::int from calc) equipos,
           (select coalesce(sum(jugados), 0)::int from calc) suma_pj,
           (select coalesce(sum(jugados - (ganados + empatados + perdidos)), 0)::int from calc) descuadre_pj,
           (select coalesce(sum(puntos - (3 * ganados + empatados)), 0)::int from calc) descuadre_puntos,
           (select coalesce(sum(gf) - sum(gc), 0) from calc) descuadre_goles
     limit 1`,
};


/**
 * Partidos del grupo con resultado publicado pero SIN acta enlazada: son los «pendientes de acta».
 *
 * Regla de elegibilidad (la que se enseña en la lista): solo se consideran elegibles los partidos con resultado;
 * un partido sin resultado todavía no tiene acta que buscar (no es un pendiente, es un partido sin jugar).
 *
 * Parámetros: (1) phase_group_id.
 */
export const SIN_ACTA_DEL_GRUPO: Consulta<{
  match_id: number; jornada: number; fecha: string | null; local: string; visitante: string;
  goles_local: number; goles_visitante: number; estado: string | null;
}> = {
  nombre: 'sin-acta-del-grupo',
  descripcion: 'Partidos con resultado y sin acta enlazada del grupo.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['match_id', 'jornada', 'fecha', 'local', 'visitante', 'goles_local', 'goles_visitante', 'estado'],
  sql: `
    select m.id as match_id,
           d.numero as jornada,
           coalesce(to_char(m.fecha_prevista, 'YYYY-MM-DD'), to_char(m.played_at, 'YYYY-MM-DD')) as fecha,
           tl.nombre_en_fuente as local,
           tv.nombre_en_fuente as visitante,
           m.goles_local, m.goles_visitante,
           m.official_status as estado
      from core.match m
      join core.matchday d on d.id = m.matchday_id
      join core.team_entry tl on tl.id = m.home_team_entry_id
      join core.team_entry tv on tv.id = m.away_team_entry_id
     where m.phase_group_id = $1
       and m.goles_local is not null and m.goles_visitante is not null
       and not exists (select 1 from core.match_report r where r.match_id = m.id)
     order by d.numero, m.source_order
     limit 200`,
};


/**
 * Partidos del grupo para el CSV: fecha, jornada, equipos, goles y campo. Solo partidos JUGADOS (con resultado),
 * que es lo que define la fila del fichero: el criterio es «filas = partidos jugados del grupo».
 *
 * Parámetros: (1) phase_group_id.
 */
export const PARTIDOS_CSV_DEL_GRUPO: Consulta<{
  match_id: number; jornada: number; fecha: string | null; local: string; visitante: string;
  goles_local: number; goles_visitante: number; campo: string | null;
}> = {
  nombre: 'partidos-csv-del-grupo',
  descripcion: 'Partidos jugados del grupo con fecha, jornada, equipos, goles y campo (para el CSV).',
  plan: 'indexado',
  presupuestoMs: 500,
  columnas: ['match_id', 'jornada', 'fecha', 'local', 'visitante', 'goles_local', 'goles_visitante', 'campo'],
  sql: `
    select m.id as match_id,
           d.numero as jornada,
           coalesce(to_char(m.played_at, 'YYYY-MM-DD'), to_char(m.fecha_prevista, 'YYYY-MM-DD')) as fecha,
           tl.nombre_en_fuente as local,
           tv.nombre_en_fuente as visitante,
           m.goles_local, m.goles_visitante,
           v.nombre as campo
      from core.match m
      join core.matchday d on d.id = m.matchday_id
      join core.team_entry tl on tl.id = m.home_team_entry_id
      join core.team_entry tv on tv.id = m.away_team_entry_id
      left join core.venue v on v.id = m.venue_id
     where m.phase_group_id = $1
       and m.goles_local is not null and m.goles_visitante is not null
     order by d.numero, m.source_order
     limit 2000`,
};

export type FilaSimulacionFinal = {
  team_entry_id: number;
  nombre: string;
  nombre_corto: string | null;
  posicion_esperada: number;
  puntos_medios: number;
  prob_posiciones: number[];
  equipos: number;
  simulaciones: number;
  calculado_en: string;
  club_id: number | null;
  tiene_escudo: boolean | null;
  /** Partidos sin resultado con fila en el calendario que entraron en la simulación. `null` antes de 0065. */
  partidos_pendientes: number | null;
  /** Partidos que la simulación dedujo del formato de liga porque aún no tienen fila. `null` antes de 0065. */
  partidos_deducidos: number | null;
};

/**
 * Clasificación final estimada de un grupo: posición media, puntos medios y probabilidad de cada puesto.
 * La escribe `scripts/prediccion/03-simulacion.mjs` en `analytics.simulacion_final` (0062).
 */
export const SIMULACION_DEL_GRUPO: Consulta<FilaSimulacionFinal> = {
  nombre: 'simulacion-del-grupo',
  descripcion: 'Clasificación final esperada por Monte Carlo: posición media, puntos y probabilidad de cada puesto.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['team_entry_id', 'nombre', 'nombre_corto', 'posicion_esperada', 'puntos_medios', 'prob_posiciones', 'equipos', 'simulaciones', 'calculado_en',
    'partidos_pendientes', 'partidos_deducidos', 'club_id', 'tiene_escudo'],
  sql: `
    select s.team_entry_id, ts.nombre, nc.nombre_corto,
           ts.club_id,
           exists(select 1 from core.club_asset ca where ca.club_id = ts.club_id and ca.tipo='escudo' and ca.vigente) tiene_escudo,
           s.posicion_esperada::float8 posicion_esperada,
           s.puntos_medios::float8 puntos_medios,
           s.prob_posiciones::jsonb prob_posiciones,
           s.equipos, s.simulaciones,
           to_char(s.calculado_en, 'DD/MM/YYYY HH24:MI') calculado_en,
           -- Por to_jsonb y no por nombre de columna: así la consulta vale antes y después de aplicar
           -- la migración 0065 (sin ella las dos salen null y la pantalla lo trata como «no se sabe»).
           (to_jsonb(s)->>'partidos_pendientes')::int partidos_pendientes,
           (to_jsonb(s)->>'partidos_deducidos')::int  partidos_deducidos
      from analytics.simulacion_final s
      join core.team_entry te on te.id = s.team_entry_id
      join core.team_season ts on ts.id = te.team_season_id
      left join analytics.nombre_corto_equipo nc on nc.team_entry_id = te.id
     where s.phase_group_id = $1
     order by s.posicion_esperada, ts.nombre`,
};

export const CONSULTAS_COMPETICIONES = [GRUPO_POR_ID, GRUPOS_DE_LA_EDICION, EDICIONES_DE_LA_COMPETICION,
  CLASIFICACION_DE_LA_PANTALLA, CLASIFICACION_CALCULADA, FRESCURA_DEL_GRUPO, CALIDAD_DEL_GRUPO, SIN_ACTA_DEL_GRUPO, PARTIDOS_CSV_DEL_GRUPO] as const;

export const PARAMETROS_COMPETICIONES: Record<string, readonly unknown[]> = {
  'grupo-por-id': [797],
  'grupos-de-la-edición': [797],
  'ediciones-de-la-competición': [797],
  'clasificación-de-la-pantalla': [797],
  'clasificación-calculada': [797],
  'frescura-del-grupo': [797],
  'calidad-del-grupo': [797],
  'sin-acta-del-grupo': [797],
  'partidos-csv-del-grupo': [797],
  'simulacion-del-grupo': [44],
};
