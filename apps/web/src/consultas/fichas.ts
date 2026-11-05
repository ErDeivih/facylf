import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Lo que las tres fichas necesitan y no estaba ya en el catálogo de consultas.
 *
 * Las fichas se montan sobre las consultas de `entidades.ts` —`PERSONA_POR_ID`, `TRAYECTORIA_DE_PERSONA`,
 * `EQUIPO_POR_ID`, `PLANTILLA_DEL_EQUIPO`, `PARTIDOS_DEL_EQUIPO`, `CLUB_POR_ID`, `EQUIPOS_DEL_CLUB`—,
 * que ya devuelven el club y la competición de cada fila. Aquí sólo vive lo que faltaba:
 *
 *  · **los últimos partidos de una persona**, con su resultado y sus goles/tarjetas de cada partido;
 *  · **los goles por tramo de un equipo**, para el gráfico del prototipo;
 *  · **si un club tiene escudo vigente**, que las consultas de entidades no devuelven (el escudo no es
 *    parte de la identidad del club) y que la ficha necesita para decidir entre imagen y marcador.
 *
 * Reglas que respetan las tres:
 *  · una fila por hecho, con `LIMIT` y parámetros `$n`: nada se interpola en el SQL;
 *  · el club, el equipo, la competición y el rival viajan en la MISMA fila del partido, así que ninguna
 *    pantalla pide una consulta por fila (nada de N+1);
 *  · lo que la fuente no publicó llega `null`, nunca un cero.
 */

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Últimos partidos de una persona
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Un partido en el que una persona aparece en el acta, desde su punto de vista. */
export type FilaPartidoDePersona = {
  partido_id: number;
  jornada_numero: number | null;
  /** Fecha jugada (`played_at`) y, si aún no se jugó, la publicada en el calendario. */
  fecha: string | null;
  temporada: string;
  equipo_id: number;
  equipo: string;
  /** El club del equipo: lo pide la ficha para el enlace y para el escudo, sin consultas extra. */
  club_id: number;
  grupo_id: number;
  edicion: string;
  rival_id: number;
  rival: string;
  /** Nombres cortos guardados (0060) del equipo y del rival; `null` si aún no se han derivado. */
  equipo_corto?: string | null;
  rival_corto?: string | null;
  /** `casa` o `fuera`, ya resuelto desde el punto de vista del equipo de la persona. */
  condicion: string;
  /** `starter`, `substitute` o `called_up_unknown`: convocado no es lo mismo que jugado. */
  convocatoria: string;
  goles_propios: number | null;
  goles_rival: number | null;
  /** `ganado`, `empatado`, `perdido` o `sin_resultado`. */
  resultado: string;
  /** Goles de la persona en ese partido. Los de propia puerta no cuentan para ella. */
  goles: number;
  goles_penalti: number;
  amarillas: number;
  rojas: number;
  total: number;
};

/**
 * Los últimos partidos de una persona, de la fecha más reciente a la más antigua.
 *
 * Sale de `core.appearance` —las actas son el hecho— y no de una lista de convocados que el esquema no
 * guarda. Los goles y las tarjetas se cuentan desde `core.match_event` para esa persona y ese partido.
 * Los goles en propia puerta NO se suman a su cuenta: los apunta el acta a su nombre, pero el gol es
 * del rival (ver `subtipo`).
 *
 * Parámetros: (1) persona, (2) límite.
 */
export const PARTIDOS_DE_PERSONA: Consulta<FilaPartidoDePersona> = {
  nombre: 'partidos-de-persona',
  descripcion: 'Los últimos partidos en los que una persona aparece en el acta, con equipo, club, competición, rival, marcador desde su punto de vista, si fue titular y sus goles y tarjetas de cada partido.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['partido_id', 'jornada_numero', 'fecha', 'temporada', 'equipo_id', 'equipo', 'equipo_corto',
    'club_id', 'grupo_id', 'edicion', 'rival_id', 'rival', 'rival_corto', 'condicion', 'convocatoria',
    'goles_propios', 'goles_rival', 'resultado', 'goles', 'goles_penalti', 'amarillas', 'rojas', 'total'],
  sql: `
    select m.id                                as partido_id,
           j.numero                            as jornada_numero,
           coalesce(to_char(m.played_at, 'YYYY-MM-DD'), to_char(m.fecha_prevista, 'YYYY-MM-DD')) as fecha,
           s.etiqueta                          as temporada,
           te.id                               as equipo_id,
           te.nombre_en_fuente                 as equipo,
           cl.id                               as club_id,
           g.id                                as grupo_id,
           e.nombre_publicado                  as edicion,
           riv.id                              as rival_id,
           riv.nombre_en_fuente                as rival,
           nce.nombre_corto                    as equipo_corto,
           ncr.nombre_corto                    as rival_corto,
           case when m.home_team_entry_id = te.id then 'casa' else 'fuera' end as condicion,
           a.condition                         as convocatoria,
           case when m.home_team_entry_id = te.id then m.goles_local else m.goles_visitante end as goles_propios,
           case when m.home_team_entry_id = te.id then m.goles_visitante else m.goles_local end   as goles_rival,
           case when m.goles_local is null or m.goles_visitante is null then 'sin_resultado'
                when (m.home_team_entry_id = te.id and m.goles_local > m.goles_visitante)
                  or (m.away_team_entry_id = te.id and m.goles_visitante > m.goles_local) then 'ganado'
                when m.goles_local = m.goles_visitante then 'empatado'
                else 'perdido' end            as resultado,
           ev.goles,
           ev.goles_penalti,
           ev.amarillas,
           ev.rojas,
           (count(*) over ())::int            as total
      from core.appearance a
      join core.match m on m.id = a.match_id
      join core.team_entry te on te.id = a.team_entry_id
      join core.team_season ts on ts.id = te.team_season_id
      join core.club cl on cl.id = ts.club_id
      join core.team_entry riv
        on riv.id = case when m.home_team_entry_id = te.id then m.away_team_entry_id
                         else m.home_team_entry_id end
      join core.phase_group g on g.id = m.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = e.season_id
      left join core.matchday j on j.id = m.matchday_id
      left join analytics.nombre_corto_equipo nce on nce.team_entry_id = te.id
      left join analytics.nombre_corto_equipo ncr on ncr.team_entry_id = riv.id
      -- Los hechos de esa persona en ESE partido, en una sola lectura lateral (no una consulta por partido).
      left join lateral (
        select (count(*) filter (where e2.event_type = 'gol'
                                  and coalesce(e2.subtipo, 'normal') <> 'propia_puerta'))::int as goles,
               (count(*) filter (where e2.event_type = 'gol' and e2.subtipo = 'penalti'))::int   as goles_penalti,
               (count(*) filter (where e2.event_type = 'tarjeta_amarilla'))::int                as amarillas,
               (count(*) filter (where e2.event_type in ('tarjeta_roja', 'tarjeta_roja_directa')))::int as rojas
          from core.match_event e2
         where e2.match_id = a.match_id and e2.person_id = a.person_id
      ) ev on true
     where a.person_id = $1
     order by coalesce(m.played_at, m.fecha_prevista::timestamptz) desc nulls last, j.numero desc, m.id desc
     limit $2`,
};

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Goles por tramo de un equipo
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Goles de un tramo del partido: los del equipo consultado y los del rival. */
export type FilaTramoGoles = {
  /** `0-15`, `16-30`, `31-45`, `46-60`, `61-75`, `76-90`. */
  tramo: string;
  favor: number;
  contra: number;
};

/**
 * Goles por tramo de quince minutos, a favor y en contra, de una inscripción de equipo.
 *
 * El equipo beneficiado de cada gol se resuelve así: `core.match_event.team_entry_id` es el equipo del
 * jugador (en un gol normal coincide con el que marca) y `lado_beneficiado` dice de qué lado cuenta el
 * gol. En un gol en propia puerta el jugador es de un equipo y el gol es del otro, y por eso manda
 * `lado_beneficiado`, no `team_entry_id`. Esa es la diferencia entre un gráfico que cuadra con el
 * marcador y uno que le suma al equipo los goles que se marcó en su propia portería.
 *
 * Sólo se cuentan los goles con minuto publicado: sin minuto no se puede asignar a un tramo y
 * inventarle uno sería peor que no pintarlo. El total de los tramos cuadra con el marcador de la
 * temporada (comprobado en la prueba de contrato con el equipo 2526: 67 a favor y 29 en contra).
 *
 * Parámetros: (1) inscripción de equipo.
 */
export const GOLES_POR_TRAMO: Consulta<FilaTramoGoles> = {
  nombre: 'goles-por-tramo',
  descripcion: 'Goles a favor y en contra de una inscripción de equipo repartidos en seis tramos de quince minutos, contando el lado beneficiado del acta.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['tramo', 'favor', 'contra'],
  sql: `
    with partidos as (
      select m.id, m.home_team_entry_id as casa, m.away_team_entry_id as fuera
        from core.match m
        join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
       where m.home_team_entry_id = $1 or m.away_team_entry_id = $1
    ),
    goles as (
      select case
               when e.minute_base <= 15 then '0-15'
               when e.minute_base <= 30 then '16-30'
               when e.minute_base <= 45 then '31-45'
               when e.minute_base <= 60 then '46-60'
               when e.minute_base <= 75 then '61-75'
               else '76-90'
             end as tramo,
             coalesce(
               case e.lado_beneficiado when 'local' then p.casa when 'visitante' then p.fuera end,
               e.team_entry_id
             ) as beneficiario
        from core.match_event e
        join partidos p on p.id = e.match_id
       where e.event_type = 'gol' and e.minute_base is not null
    )
    select tramo,
           (count(*) filter (where beneficiario = $1))::int as favor,
           (count(*) filter (where beneficiario <> $1))::int as contra
      from goles
     group by tramo
     order by min(case tramo
                    when '0-15' then 1 when '16-30' then 2 when '31-45' then 3
                    when '46-60' then 4 when '61-75' then 5 else 6 end)
     limit 6`,
};

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Escudo del club
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Si el club tiene un escudo vigente guardado en el canónico. */
export type FilaEscudoDeClub = {
  club_id: number;
  tiene_escudo: boolean;
};

/**
 * Escudo vigente de un club, para que la ficha decida entre la imagen real y el marcador de posición.
 *
 * Se pregunta a `core.club_asset` con un `EXISTS` sobre el índice del registro vigente: no se trae el
 * binario para decidir si hay imagen; el binario lo sirve `/api/escudo/club/<id>` cuando la ficha ya
 * sabe que existe.
 *
 * Parámetros: (1) club.
 */
export const ESCUDO_DEL_CLUB: Consulta<FilaEscudoDeClub> = {
  nombre: 'escudo-del-club',
  descripcion: 'Dice si un club tiene escudo vigente guardado, para que la ficha pinte la imagen real o su marcador de posición sin descargar el binario para decidirlo.',
  plan: 'indexado',
  presupuestoMs: 100,
  columnas: ['club_id', 'tiene_escudo'],
  sql: `
    select c.id as club_id,
           exists (select 1 from core.club_asset ca
                    where ca.club_id = c.id and ca.tipo = 'escudo' and ca.vigente) as tiene_escudo
      from core.club c
     where c.id = $1
     limit 1`,
};

/** Todas las consultas de las fichas, para la prueba de contrato. */
export const CONSULTAS_FICHAS = [PARTIDOS_DE_PERSONA, GOLES_POR_TRAMO, ESCUDO_DEL_CLUB] as const;

/** Parámetros por defecto: los usan la prueba de contrato y `scripts/planes.mjs` si algún día mide. */
export const PARAMETROS_FICHAS: Record<string, readonly unknown[]> = {
  // Persona 19057: 4 temporadas y 5 equipos en Castilla y León, de 2023-24 a 2026-27.
  'partidos-de-persona': [19057, 12],
  // Equipo 2526: C. y D. Leonesa «B» en la Liga Nacional Juvenil 2025-26 (grupo 797).
  'goles-por-tramo': [2526],
  // Club 16: Ciudad Rodrigo C.F., con escudo guardado.
  'escudo-del-club': [16],
};
