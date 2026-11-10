import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';
import { TEMPORADA_MINIMA } from '@/lib/temporadas';

/**
 * Consultas del calendario (WALL objetivo 2): el global de todas las competiciones y el de un grupo.
 *
 * El calendario de un grupo se lee con `PARTIDOS_DE_GRUPO` (ya existente y probada) porque su conjunto
 * está acotado al grupo. El global necesita filtros que aquella consulta no tiene —fechas y texto— y
 * campos de escudo en la misma fila, así que vive aquí en vez de ampliar `partidos.ts`, que usa otra
 * pantalla.
 *
 * Reglas que respeta el SQL:
 *  · una sola consulta por página para los partidos (nada de una consulta por jornada ni por equipo);
 *  · `LIMIT` explícito y `OFFSET` acotado: nunca se traen dos millones de partidos;
 *  · todos los filtros van por parámetro numerado (`$n is null or …`), sin concatenar valores;
 *  · la fecha se toma de la jugada y, si el partido aún no se jugó, de la publicada (`fecha_prevista`);
 *    si no hay ninguna, es `null` y la pantalla no la inventa;
 *  · los escudos viajan en la fila del partido (club + vigencia del escudo), sin una petición por equipo.
 */

/** Un partido en el calendario global, con su competición, sus equipos y su contexto. */
export type FilaCalendarioGlobal = {
  partido_id: number;
  /** Número de jornada publicado, o `null` si el partido no tiene jornada asociada. */
  jornada: number | null;
  /** Fecha del partido jugado (`played_at`), o `null` si no se ha jugado. */
  fecha_jugada: string | null;
  /** Fecha publicada en el calendario (`fecha_prevista`), aunque no se haya jugado. */
  fecha_prevista: string | null;
  /**
   * La fecha que se enseña: la jugada si existe y, si no, la prevista publicada. `null` cuando la
   * fuente no publicó ninguna de las dos; no se rellena con la de otro partido.
   */
  fecha: string | null;
  /** Hora de comienzo publicada (`HH24:MI`), o `null` si la federación no la confirmó. */
  hora: string | null;
  temporada: string;
  federacion: string;
  federacion_nombre: string;
  /** Nombre corto real de la federación; el largo queda como respaldo. */
  federacion_corta: string | null;
  edicion: string;
  grupo: string;
  /** Id de `core.phase_group`: es lo que lleva la ruta de competición. */
  grupo_id: number;
  local_id: number;
  local: string;
  local_codigo: string | null;
  visitante_id: number;
  visitante: string;
  visitante_codigo: string | null;
  local_club_id: number | null;
  visitante_club_id: number | null;
  local_tiene_escudo: boolean | null;
  visitante_tiene_escudo: boolean | null;
  goles_local: number | null;
  goles_visitante: number | null;
  campo: string | null;
  /** Calidad del acta analizada; `null` es «sin acta», no «acta vacía». */
  calidad_acta: string | null;
  estado: string | null;
};

/**
 * Partidos del calendario global, con filtros opcionales.
 *
 * Parámetros: (1) federación, (2) temporada, (3) número de jornada, (4) fecha desde, (5) fecha hasta,
 * (6) texto de búsqueda, (7) límite, (8) desplazamiento.
 *
 * El prefiltro de grupos va en un CTE `materialized` a propósito: medido el 05/11/2026, sin él el
 * planificador elegía recorrer los grupos de todas las federaciones y bajar al partido después
 * (658 ms y ~50 MB leídos para la primera página de CyL); con la lista de grupos ya resuelta, el
 * partido se alcanza por índice grupo a grupo (~146 ms en caliente).
 */
export const PARTIDOS_DEL_CALENDARIO: Consulta<FilaCalendarioGlobal> = {
  nombre: 'partidos-del-calendario',
  descripcion: 'Partidos del canónico para el calendario global, con su jornada, competición, grupo, equipos, escudos, marcador, hora, campo y acta, filtrables por federación, temporada, jornada, rango de fechas y texto.',
  plan: 'indexado',
  presupuestoMs: 800,
  columnas: ['partido_id', 'jornada', 'fecha_jugada', 'fecha_prevista', 'fecha', 'hora', 'temporada', 'federacion',
    'federacion_nombre', 'federacion_corta', 'edicion', 'grupo', 'grupo_id', 'local_id', 'local', 'local_codigo',
    'visitante_id', 'visitante', 'visitante_codigo', 'local_club_id', 'visitante_club_id', 'local_tiene_escudo',
    'visitante_tiene_escudo', 'goles_local', 'goles_visitante', 'campo', 'calidad_acta', 'estado'],
  sql: `
    with grupos as materialized (
      select g.id::int             as grupo_id,
             g.nombre              as grupo,
             f.codigo              as federacion,
             f.nombre              as federacion_nombre,
             fp.nombre_corto       as federacion_corta,
             e.nombre_publicado    as edicion,
             s.etiqueta            as temporada
        from core.federation f
        join core.competition_edition e on e.federation_id = f.id
        join core.season s on s.id = e.season_id
        join core.phase_group g on g.competition_edition_id = e.id
        left join core.federacion_perfil fp on fp.codigo = f.codigo
       where ($1::text is null or f.codigo = $1)
         and ($2::text is null or s.etiqueta = $2)
         -- La búsqueda de equipo o competición resuelve el GRUPO: un partido entra si su grupo tiene un
         -- equipo o un nombre que coincide. Se filtra una vez por grupo (team_entry tiene índice por
         -- grupo), no una vez por partido: medido el 05/11/2026, la búsqueda global por texto con el
         -- filtro puesto en cada partido superaba los 5 s; resuelta por grupo, ~0,3-0,5 s.
         and (coalesce($6::text, '') = ''
              or core.normaliza_nombre(e.nombre_publicado || ' ' || g.nombre || ' ' || f.nombre)
                   like '%' || core.normaliza_nombre($6) || '%'
              or exists (select 1 from core.team_entry te
                          where te.phase_group_id = g.id
                            and te.nombre_en_fuente_norm like '%' || core.normaliza_nombre($6) || '%'))
    ),
    -- Dos pasos a propósito: primero se eligen las 61 filas de la página (barato: partido y jornada) y
    -- después se completa el detalle de esas 61 con equipos, escudos y acta. Con una sola pasada, el
    -- plan resolvía los equipos y las existencias de escudo de TODOS los partidos filtrados antes de
    -- ordenar y limitar: medido el 05/11/2026, 3-4 s de primera página con todas las federaciones
    -- frente a ~200 ms con este corte.
    pagina as materialized (
      select m.id::int                    as partido_id,
             m.phase_group_id::int,
             m.home_team_entry_id::int   as local_id,
             m.away_team_entry_id::int   as visitante_id,
             m.matchday_id::int,
             m.played_at,
             m.fecha_prevista,
             m.hora_confirmada,
             m.goles_local,
             m.goles_visitante,
             m.venue_id,
             m.official_status,
             coalesce((m.played_at at time zone 'UTC')::date, m.fecha_prevista) as fecha_orden
        from grupos gr
        join core.match m on m.phase_group_id = gr.grupo_id
        left join core.matchday d on d.id = m.matchday_id
       where m.home_team_entry_id is not null
         and m.away_team_entry_id is not null
         and ($3::int is null or d.numero = $3)
         and ($4::date is null or coalesce((m.played_at at time zone 'UTC')::date, m.fecha_prevista) >= $4)
         and ($5::date is null or coalesce((m.played_at at time zone 'UTC')::date, m.fecha_prevista) <= $5)
       order by fecha_orden desc nulls last, m.id desc
       limit $7 offset $8
    )
    select p.partido_id,
           d.numero                  as jornada,
           to_char(p.played_at at time zone 'UTC', 'YYYY-MM-DD') as fecha_jugada,
           to_char(p.fecha_prevista, 'YYYY-MM-DD')               as fecha_prevista,
           -- La fecha que se enseña, ya formateada a texto: un date crudo lo devuelve el driver como
           -- Date y se colaría una hora de diferencia al comparar en el servidor (2026-10-24T22:00Z).
           to_char(p.fecha_orden, 'YYYY-MM-DD')                  as fecha,
           case
             when p.hora_confirmada and p.played_at is not null
               then to_char(p.played_at at time zone 'UTC', 'HH24:MI')
           end                       as hora,
           gr.temporada,
           gr.federacion,
           gr.federacion_nombre,
           gr.federacion_corta,
           gr.edicion,
           gr.grupo,
           gr.grupo_id,
           el.id::int                as local_id,
           el.nombre_en_fuente       as local,
           el.codigo_externo         as local_codigo,
           ev.id::int                as visitante_id,
           ev.nombre_en_fuente       as visitante,
           ev.codigo_externo         as visitante_codigo,
           (select ts.club_id from core.team_season ts where ts.id = el.team_season_id) as local_club_id,
           (select ts.club_id from core.team_season ts where ts.id = ev.team_season_id) as visitante_club_id,
           exists (select 1 from core.team_season ts
                     join core.club_asset ca on ca.club_id = ts.club_id
                    where ts.id = el.team_season_id and ca.tipo = 'escudo' and ca.vigente) as local_tiene_escudo,
           exists (select 1 from core.team_season ts
                     join core.club_asset ca on ca.club_id = ts.club_id
                    where ts.id = ev.team_season_id and ca.tipo = 'escudo' and ca.vigente) as visitante_tiene_escudo,
           p.goles_local,
           p.goles_visitante,
           v.nombre                  as campo,
           r.quality                 as calidad_acta,
           p.official_status         as estado
      from pagina p
      join grupos gr on gr.grupo_id = p.phase_group_id
      left join core.matchday d on d.id = p.matchday_id
      join core.team_entry el on el.id = p.local_id
      join core.team_entry ev on ev.id = p.visitante_id
      left join core.venue v on v.id = p.venue_id
      left join core.match_report r on r.match_id = p.partido_id
     order by p.fecha_orden desc nulls last, p.partido_id desc`,
};

/** Las opciones de los filtros, tal como están en el canónico. */
export type FilaOpcionesCalendario = {
  federaciones: Array<{ codigo: string; nombre: string; nombre_corto: string | null }> | null;
  temporadas: Array<{ etiqueta: string; orden: number }> | null;
};

/**
 * Opciones de los filtros del calendario global en UNA consulta: federaciones publicadas (fase C: sólo
 * Castilla y León) y temporadas publicadas (la misma ventana que anuncia el pie). Son tablas de catálogo,
 * no de hechos.
 */
export const OPCIONES_DEL_CALENDARIO: Consulta<FilaOpcionesCalendario> = {
  nombre: 'opciones-del-calendario',
  descripcion: 'Federaciones y temporadas publicadas, para construir los filtros del calendario sin listas escritas a mano.',
  plan: 'agregado',
  presupuestoMs: 300,
  columnas: ['federaciones', 'temporadas'],
  sql: `
    select (select jsonb_agg(jsonb_build_object('codigo', f.codigo, 'nombre', f.nombre,
                                                'nombre_corto', fp.nombre_corto)
                             order by coalesce(fp.nombre_corto, f.nombre))
              from core.federation f
              left join core.federacion_perfil fp on fp.codigo = f.codigo
             where ${SQL_FEDERACION_NO_EXCLUIDA})                     as federaciones,
           (select jsonb_agg(jsonb_build_object('etiqueta', s.etiqueta, 'orden', s.orden) order by s.orden desc)
              from core.season s
             where s.etiqueta >= '${TEMPORADA_MINIMA}')               as temporadas
     limit 1`,
};

export const CONSULTAS_CALENDARIO = [PARTIDOS_DEL_CALENDARIO, OPCIONES_DEL_CALENDARIO] as const;

/** Parámetros de ejemplo: los usan la prueba de contrato y la medición de planes. */
export const PARAMETROS_CALENDARIO: Record<string, readonly unknown[]> = {
  // El caso realista: una federación y su temporada más reciente, primera página.
  'partidos-del-calendario': ['castilla-leon', '2026-27', null, null, null, '', 61, 0],
  'opciones-del-calendario': [],
};
