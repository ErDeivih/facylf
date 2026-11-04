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
  columnas: ['grupo_id', 'federacion', 'federacion_nombre', 'temporada', 'edicion', 'edicion_id', 'grupo',
    'grupo_codigo', 'categoria', 'division', 'modalidad', 'genero', 'ambito', 'jornadas_previstas', 'equipos',
    'partidos_conocidos', 'partidos_con_resultado', 'complete_through_matchday', 'visibility_state',
    'jornada_actual', 'origen_clasificacion', 'calculado_en'],
  sql: `
    select g.id                       as grupo_id,
           f.codigo                   as federacion,
           f.nombre                   as federacion_nombre,
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
           c.calculado_en
      from core.phase_group g
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
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
    'goles_favor', 'goles_contra', 'goles_favor_reconstruida', 'goles_contra_reconstruida', 'origen', 'jornada'],
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
           d.numero            as jornada
      from core.standing_snapshot s
      join elegido el on el.origen = s.origen
      join ultima u on u.id = s.matchday_id
      join core.team_entry te on te.id = s.team_entry_id
      join core.matchday d on d.id = s.matchday_id
      left join lateral (
        select sr.goles_favor, sr.goles_contra
          from core.standing_snapshot sr
         where sr.phase_group_id = $1 and sr.team_entry_id = s.team_entry_id and sr.origen = 'reconstruida'
         order by sr.matchday_id desc
         limit 1
      ) rh on true
     where s.phase_group_id = $1
     order by s.posicion
     limit 40`,
};

export const CONSULTAS_COMPETICIONES = [GRUPO_POR_ID, GRUPOS_DE_LA_EDICION, EDICIONES_DE_LA_COMPETICION,
  CLASIFICACION_DE_LA_PANTALLA] as const;

export const PARAMETROS_COMPETICIONES: Record<string, readonly unknown[]> = {
  'grupo-por-id': [797],
  'grupos-de-la-edición': [797],
  'ediciones-de-la-competición': [797],
  'clasificación-de-la-pantalla': [797],
};
