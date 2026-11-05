import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Las dos consultas de los historiales: equipo a lo largo de las temporadas y club temporada a temporada.
 *
 * ── QUÉ RESPONDEN ──────────────────────────────────────────────────────────────────────────────────
 *
 * · `HISTORIAL_DEL_EQUIPO`: dada una inscripción (`core.team_entry.id`), la **línea** de ese equipo
 *   (`analytics.linea_equipo_temporada.linea` = club|categoría|género|modalidad|letra) y todas las
 *   temporadas en las que esa línea aparece, con su competición, grupo, puesto, movimiento y balance.
 *   Si el equipo no tiene fila de línea (pasa: hay inscripciones que no llegaron a esa capa), la
 *   consulta devuelve **esa** temporada sola con lo que sí hay, en vez de una página vacía.
 *
 * · `HISTORIAL_DEL_CLUB`: todas las inscripciones del club, temporada a temporada, con el puesto y el
 *   balance de cada una. Un club puede tener varios equipos en la misma temporada (filiales A/B/C y
 *   categorías distintas); salen todos. La consulta devuelve una fila por inscripción, no una por
 *   equipo-temporada: en el canónico, `team_season` colapsa varios equipos del mismo nombre publicado
 *   y usarlo como «equipo» mezclaría plantillas y clasificaciones.
 *
 * ── REGLAS ────────────────────────────────────────────────────────────────────────────────────────
 *
 * · una consulta por pantalla (el club trae su cabecera en la misma fila; el equipo, también);
 * · sin N+1: la racha, la última jornada y el puesto se resuelven con laterales por fila;
 * · los ids se devuelven como `int` (caben de sobra) para no convertir cadenas en cada cálculo;
 * · lo que la fuente no publicó llega `null`, nunca `0`; el puesto se devuelve con su origen
 *   (`posicion_linea`/`origen_posicion` de la línea, o `posicion_oficial` del último parte oficial)
 *   para que la pantalla pueda decir de dónde sale;
 * · ningún valor se interpola: la única interpolación es la lista de federaciones excluidas, que
 *   viene validada de `lib/federaciones-excluidas.ts` (la usan todas las consultas del canónico).
 */

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Historial de un equipo
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Una temporada de la línea de un equipo, con todo lo que enseñan la ficha y la tabla. */
export type FilaHistorialEquipo = {
  equipo_id: number;
  equipo: string;
  club_id: number;
  club: string;
  federacion: string;
  federacion_nombre: string;
  tiene_escudo: boolean;
  temporada: string;
  temporada_orden: number;
  edicion_id: number;
  edicion: string;
  edicion_categoria: string;
  edicion_genero: string;
  edicion_ambito: string | null;
  edicion_division: string | null;
  edicion_nivel: number | null;
  edicion_estado: string;
  grupo_id: number;
  grupo: string;
  jornadas_previstas: number | null;
  /** Letra del filial (`A`, `B`…), de la línea; `null` si no hay fila de línea. */
  letra: string | null;
  /** Clave de la línea (club|categoría|género|modalidad|letra). Depuración y pruebas. */
  linea: string | null;
  /** Número de equipos del grupo, cuando la línea lo trae. No es el número de equipos de la liga. */
  equipos: number | null;
  posicion_linea: number | null;
  /** `oficial` o `reconstruida`; de dónde sale `posicion_linea`. */
  origen_posicion: string | null;
  /** `asciende`, `desciende`, `mantiene` o `desconocido`; `null` si no se sabe. */
  movimiento: string | null;
  jugo_fase_ascenso: boolean | null;
  posicion_oficial: number | null;
  jornada_oficial: number | null;
  jugados: number | null;
  ganados: number | null;
  empatados: number | null;
  perdidos: number | null;
  goles_favor: number | null;
  goles_contra: number | null;
  puntos: number | null;
  partidos_cubiertos: number | null;
  ultima_jornada: number | null;
  ultimo_partido_id: number | null;
  ultima_fecha: string | null;
  /** Últimos resultados de la temporada, del más reciente al más antiguo: `G`, `E` o `P`. */
  racha: string[] | null;
};

/**
 * La línea de un equipo temporada a temporada.
 *
 * Parámetros: (1) inscripción de equipo (`core.team_entry.id`).
 *
 * El ancla es la inscripción pedida. Con ella se busca su línea en `analytics.linea_equipo_temporada`;
 * si existe, se traen todas las inscripciones de esa línea (más el ancla, por si acaso) y si no, sólo
 * el ancla. La racha se calcula sólo con partidos con marcador publicado: un partido sin acta no es
 * una derrota.
 */
export const HISTORIAL_DEL_EQUIPO: Consulta<FilaHistorialEquipo> = {
  nombre: 'historial-del-equipo',
  descripcion: 'Las temporadas de la línea de una inscripción de equipo (club, categoría y letra), con competición, grupo, puesto, movimiento, partidos, goles, racha y enlaces a jornada y acta.',
  plan: 'indexado',
  presupuestoMs: 250,
  columnas: ['equipo_id', 'equipo', 'club_id', 'club', 'federacion', 'federacion_nombre', 'tiene_escudo',
    'temporada', 'temporada_orden', 'edicion_id', 'edicion', 'edicion_categoria', 'edicion_genero',
    'edicion_ambito', 'edicion_division', 'edicion_nivel', 'edicion_estado', 'grupo_id', 'grupo',
    'jornadas_previstas', 'letra', 'linea', 'equipos', 'posicion_linea', 'origen_posicion', 'movimiento',
    'jugo_fase_ascenso', 'posicion_oficial', 'jornada_oficial', 'jugados', 'ganados', 'empatados',
    'perdidos', 'goles_favor', 'goles_contra', 'puntos', 'partidos_cubiertos', 'ultima_jornada',
    'ultimo_partido_id', 'ultima_fecha', 'racha'],
  sql: `
    with ancla as (
      select te.id as team_entry_id
        from core.team_entry te
        join core.team_season ts on ts.id = te.team_season_id
        join core.phase_group g on g.id = te.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
       where te.id = $1
    ),
    linea_del_equipo as (
      select l.linea
        from analytics.linea_equipo_temporada l
        join ancla a on a.team_entry_id = l.team_entry_id
    ),
    entradas as (
      select l.team_entry_id
        from analytics.linea_equipo_temporada l
       where l.linea = (select linea from linea_del_equipo)
      union
      select a.team_entry_id from ancla a
    )
    select en.team_entry_id::int                 as equipo_id,
           te.nombre_en_fuente                   as equipo,
           cl.id::int                            as club_id,
           cl.nombre_canonico                    as club,
           f.codigo                              as federacion,
           f.nombre                              as federacion_nombre,
           exists (select 1 from core.club_asset ca
                    where ca.club_id = cl.id and ca.tipo = 'escudo' and ca.vigente) as tiene_escudo,
           s.etiqueta                            as temporada,
           s.orden::int                          as temporada_orden,
           e.id::int                             as edicion_id,
           e.nombre_publicado                    as edicion,
           e.categoria                           as edicion_categoria,
           e.genero                              as edicion_genero,
           e.ambito                              as edicion_ambito,
           e.division                            as edicion_division,
           e.nivel::int                          as edicion_nivel,
           e.estado                              as edicion_estado,
           g.id::int                             as grupo_id,
           g.nombre                              as grupo,
           g.jornadas_previstas,
           l.letra,
           l.linea,
           l.equipos::int                        as equipos,
           l.posicion                            as posicion_linea,
           l.origen_posicion,
           l.movimiento,
           l.jugo_fase_ascenso,
           ofi.posicion                          as posicion_oficial,
           ofi.jornada                           as jornada_oficial,
           t.jugados,
           t.ganados,
           t.empatados,
           t.perdidos,
           t.goles_favor,
           t.goles_contra,
           t.puntos,
           t.partidos_cubiertos,
           ult.jornada                           as ultima_jornada,
           ult.partido_id::int                   as ultimo_partido_id,
           ult.fecha                             as ultima_fecha,
           racha.signos                          as racha
      from entradas en
      join core.team_entry te on te.id = en.team_entry_id
      join core.team_season ts on ts.id = te.team_season_id
      join core.club cl on cl.id = ts.club_id
      join core.phase_group g on g.id = te.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = e.season_id
      left join analytics.linea_equipo_temporada l on l.team_entry_id = en.team_entry_id
      left join analytics.team_edition_summary t on t.team_entry_id = en.team_entry_id
      left join lateral (
           select ss.posicion, md.numero as jornada
             from core.standing_snapshot ss
             left join core.matchday md on md.id = ss.matchday_id
            where ss.team_entry_id = en.team_entry_id
              and ss.phase_group_id = g.id
              and ss.origen = 'oficial'
            order by ss.matchday_id desc
            limit 1) ofi on true
      left join lateral (
           select m.id as partido_id, md.numero as jornada,
                  coalesce(to_char(m.played_at, 'YYYY-MM-DD'), to_char(m.fecha_prevista, 'YYYY-MM-DD')) as fecha
             from core.match m
             left join core.matchday md on md.id = m.matchday_id
            where m.phase_group_id = g.id
              and (m.home_team_entry_id = en.team_entry_id or m.away_team_entry_id = en.team_entry_id)
              and m.goles_local is not null and m.goles_visitante is not null
            order by coalesce(m.played_at, m.fecha_prevista::timestamptz) desc nulls last, md.numero desc, m.id desc
            limit 1) ult on true
      left join lateral (
           select array_agg(signo order by orden desc) as signos
             from (
               select case
                        when (m.home_team_entry_id = en.team_entry_id and m.goles_local > m.goles_visitante)
                          or (m.away_team_entry_id = en.team_entry_id and m.goles_visitante > m.goles_local) then 'G'
                        when m.goles_local = m.goles_visitante then 'E'
                        else 'P' end as signo,
                      row_number() over (
                        order by coalesce(m.played_at, m.fecha_prevista::timestamptz) desc nulls last, m.id desc
                      ) as orden
                 from core.match m
                where m.phase_group_id = g.id
                  and (m.home_team_entry_id = en.team_entry_id or m.away_team_entry_id = en.team_entry_id)
                  and m.goles_local is not null and m.goles_visitante is not null
                order by orden
                limit 5
             ) ultimos) racha on true
     order by s.orden desc, e.nombre_publicado
     limit 50`,
};

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Historial de un club
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Una inscripción de un club en una temporada, con su contexto y su balance.
 *
 * Los campos del club se repiten en todas las filas: así la cabecera de la pantalla se monta con la
 * misma consulta y no hay una segunda lectura. En un club sin equipos publicados, la fila existe y los
 * campos del equipo llegan `null` (el club existe; lo que no hay son equipos).
 */
export type FilaHistorialClub = {
  club_id: number;
  club: string;
  municipio: string | null;
  provincia: string | null;
  federacion: string;
  federacion_nombre: string;
  tiene_escudo: boolean;
  equipo_id: number | null;
  equipo: string | null;
  equipo_temporada_id: number | null;
  equipo_temporada: string | null;
  temporada: string | null;
  temporada_orden: number | null;
  edicion_id: number | null;
  edicion: string | null;
  edicion_categoria: string | null;
  edicion_genero: string | null;
  edicion_ambito: string | null;
  edicion_division: string | null;
  edicion_nivel: number | null;
  grupo_id: number | null;
  grupo: string | null;
  jornadas_previstas: number | null;
  grupo_tipo: string | null;
  letra: string | null;
  linea: string | null;
  equipos: number | null;
  posicion_linea: number | null;
  puntos_linea: number | null;
  origen_posicion: string | null;
  movimiento: string | null;
  jugo_fase_ascenso: boolean | null;
  posicion_oficial: number | null;
  jornada_oficial: number | null;
  jugados: number | null;
  ganados: number | null;
  empatados: number | null;
  perdidos: number | null;
  goles_favor: number | null;
  goles_contra: number | null;
  puntos_resumen: number | null;
  partidos_cubiertos: number | null;
  ultima_jornada: number | null;
  ultimo_partido_id: number | null;
  total: number | null;
};

/**
 * Los equipos de un club, temporada a temporada.
 *
 * Parámetros: (1) club, (2) límite de inscripciones. El club se lee aparte (`club` CTE) y se une con
 * `left join` a sus inscripciones: un club sin equipos publicados devuelve una fila con el club y los
 * campos del equipo a `null`, que es distinto de «el club no existe» (eso son 0 filas → 404).
 *
 * El `total` es el número de inscripciones del club (ventana antes del límite): si se supera el
 * límite, la pantalla puede decirlo en vez de fingir que no falta nada.
 */
export const HISTORIAL_DEL_CLUB: Consulta<FilaHistorialClub> = {
  nombre: 'historial-del-club',
  descripcion: 'Todas las inscripciones de un club, temporada a temporada, con su competición, grupo, puesto, movimiento y balance; el club va en la misma fila para montar la cabecera sin otra lectura.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['club_id', 'club', 'municipio', 'provincia', 'federacion', 'federacion_nombre', 'tiene_escudo',
    'equipo_id', 'equipo', 'equipo_temporada_id', 'equipo_temporada', 'temporada', 'temporada_orden',
    'edicion_id', 'edicion', 'edicion_categoria', 'edicion_genero', 'edicion_ambito', 'edicion_division',
    'edicion_nivel', 'grupo_id', 'grupo', 'jornadas_previstas', 'grupo_tipo', 'letra', 'linea', 'equipos',
    'posicion_linea', 'puntos_linea', 'origen_posicion', 'movimiento', 'jugo_fase_ascenso', 'posicion_oficial', 'jornada_oficial',
    'jugados', 'ganados', 'empatados', 'perdidos', 'goles_favor', 'goles_contra', 'puntos_resumen',
    'partidos_cubiertos', 'ultima_jornada', 'ultimo_partido_id', 'total'],
  sql: `
    with club as (
      select c.id::int          as club_id,
             c.nombre_canonico  as club,
             c.municipio,
             c.provincia,
             f.codigo           as federacion,
             f.nombre           as federacion_nombre,
             exists (select 1 from core.club_asset ca
                      where ca.club_id = c.id and ca.tipo = 'escudo' and ca.vigente) as tiene_escudo
        from core.club c
        join core.federation f on f.id = c.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
       where c.id = $1
    ),
    equipos as (
      select te.id::int                         as equipo_id,
             te.nombre_en_fuente                as equipo,
             ts.id::int                         as equipo_temporada_id,
             ts.nombre                          as equipo_temporada,
             s.etiqueta                         as temporada,
             s.orden::int                       as temporada_orden,
             e.id::int                          as edicion_id,
             e.nombre_publicado                 as edicion,
             e.categoria                        as edicion_categoria,
             e.genero                           as edicion_genero,
             e.ambito                           as edicion_ambito,
             e.division                         as edicion_division,
             e.nivel::int                       as edicion_nivel,
             g.id::int                          as grupo_id,
             g.nombre                           as grupo,
             g.jornadas_previstas,
             g.tipo                             as grupo_tipo,
             coalesce(l.letra, core.letra_de_equipo(coalesce(te.nombre_en_fuente, ts.nombre))) as letra,
             l.linea,
             l.equipos::int                     as equipos,
             l.posicion                         as posicion_linea,
             l.puntos                           as puntos_linea,
             l.origen_posicion,
             l.movimiento,
             l.jugo_fase_ascenso,
             ofi.posicion                       as posicion_oficial,
             ofi.jornada                        as jornada_oficial,
             t.jugados,
             t.ganados,
             t.empatados,
             t.perdidos,
             t.goles_favor,
             t.goles_contra,
             t.puntos                           as puntos_resumen,
             t.partidos_cubiertos,
             ult.jornada                        as ultima_jornada,
             ult.partido_id::int                as ultimo_partido_id,
             (count(*) over ())::int            as total
        from core.team_season ts
        join core.team_entry te on te.team_season_id = ts.id
        join core.phase_group g on g.id = te.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
        join core.season s on s.id = e.season_id
        left join analytics.linea_equipo_temporada l on l.team_entry_id = te.id
        left join analytics.team_edition_summary t on t.team_entry_id = te.id
        left join lateral (
             select ss.posicion, md.numero as jornada
               from core.standing_snapshot ss
               left join core.matchday md on md.id = ss.matchday_id
              where ss.team_entry_id = te.id
                and ss.phase_group_id = g.id
                and ss.origen = 'oficial'
              order by ss.matchday_id desc
              limit 1) ofi on true
        left join lateral (
             select m.id as partido_id, md.numero as jornada
               from core.match m
               left join core.matchday md on md.id = m.matchday_id
              where m.phase_group_id = g.id
                and (m.home_team_entry_id = te.id or m.away_team_entry_id = te.id)
                and m.goles_local is not null and m.goles_visitante is not null
              order by coalesce(m.played_at, m.fecha_prevista::timestamptz) desc nulls last, md.numero desc, m.id desc
              limit 1) ult on true
       where ts.club_id = $1
       order by s.orden desc, e.categoria, letra, e.nombre_publicado, g.nombre
       limit $2
    )
    select c.club_id, c.club, c.municipio, c.provincia, c.federacion, c.federacion_nombre, c.tiene_escudo,
           eq.equipo_id, eq.equipo, eq.equipo_temporada_id, eq.equipo_temporada, eq.temporada, eq.temporada_orden,
           eq.edicion_id, eq.edicion, eq.edicion_categoria, eq.edicion_genero, eq.edicion_ambito,
           eq.edicion_division, eq.edicion_nivel, eq.grupo_id, eq.grupo, eq.jornadas_previstas, eq.grupo_tipo,
           eq.letra, eq.linea, eq.equipos, eq.posicion_linea, eq.puntos_linea, eq.origen_posicion, eq.movimiento,
           eq.jugo_fase_ascenso, eq.posicion_oficial, eq.jornada_oficial, eq.jugados, eq.ganados,
           eq.empatados, eq.perdidos, eq.goles_favor, eq.goles_contra, eq.puntos_resumen,
           eq.partidos_cubiertos, eq.ultima_jornada, eq.ultimo_partido_id, eq.total
      from club c
      left join equipos eq on true
     order by eq.temporada_orden desc nulls last, eq.edicion_categoria, eq.letra, eq.edicion, eq.grupo`,
};

/** Todas las consultas de los historiales, para la prueba de contrato. */
export const CONSULTAS_HISTORIAL = [HISTORIAL_DEL_EQUIPO, HISTORIAL_DEL_CLUB] as const;

/** Parámetros por defecto: equipo 2526 (C. y D. Leonesa «B», 2025-26) y club 16 (Ciudad Rodrigo C.F.). */
export const PARAMETROS_HISTORIAL: Record<string, readonly unknown[]> = {
  'historial-del-equipo': [2526],
  'historial-del-club': [16, 1200],
};
