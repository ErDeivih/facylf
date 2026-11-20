import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';
import type { FilaTemporadaDePersona } from './entidades';

/**
 * Consultas del comparador de jugadores.
 *
 * Dos consultas en una sola foto: las personas y sus trayectorias (una fila por equipo y temporada). El
 * comparador no pide una consulta por jugador ni una por temporada, y no trae el historial de
 * apariciones completo: para eso están las fichas y su historial.
 *
 * Estas consultas son DEL COMPARADOR: no se tocan las de entidades porque son de otros agentes. Aun así
 * devuelven las mismas formas y respetan las mismas reglas (parámetros, LIMIT, sin interpolación).
 */

/** Una persona para la cabecera de su lado del comparador. */
export type FilaPersonaComparada = {
  persona_id: number;
  nombre_mostrado: string;
  identidad_nominal: boolean;
  es_menor: boolean;
  codigos: string | null;
  decisiones_identidad: number;
  total: number;
};

/**
 * Las personas de una lista de identificadores. Parámetros: (1) array de ids.
 *
 * El `total` es el número de filas que ha devuelto la consulta (como mucho dos): la pantalla no lo usa
 * para paginar, pero mantiene el mismo contrato que el resto del catálogo.
 */
export const PERSONAS_POR_IDS: Consulta<FilaPersonaComparada> = {
  nombre: 'personas-por-ids',
  descripcion: 'Dos personas del canónico por sus identificadores, con su nombre, si su identidad es nominal, si son menores y sus códigos federativos.',
  plan: 'indexado',
  presupuestoMs: 800,
  columnas: ['persona_id', 'nombre_mostrado', 'identidad_nominal', 'es_menor', 'codigos',
    'decisiones_identidad', 'total'],
  sql: `
    select p.id                                 as persona_id,
           p.nombre_mostrado,
           p.identidad_nominal,
           p.es_menor,
           (select string_agg(distinct psi.codigo_externo, ' · ')
              from core.person_source_identity psi
             where psi.person_id = p.id)        as codigos,
           (select count(*)::int from core.identity_decision d
             where d.person_a = p.id or d.person_b = p.id) as decisiones_identidad,
           (count(*) over ())::int              as total
      from core.person p
     where p.id = any($1::bigint[])
       and exists (
         select 1 from core.appearance a
           join core.team_entry te on te.id = a.team_entry_id
           join core.phase_group g on g.id = te.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where a.person_id = p.id and (${SQL_FEDERACION_NO_EXCLUIDA})
       )
     order by p.nombre_mostrado
     limit 10`,
};

/** Una temporada de un jugador en un equipo, con el `persona_id` delante para separar los dos lados. */
export type FilaTrayectoriaComparada = FilaTemporadaDePersona & { persona_id: number };

/**
 * Las trayectorias de las dos personas en UNA consulta: una fila por persona, equipo y temporada.
 *
 * Es la misma forma que devuelve `TRAYECTORIA_DE_PERSONA` (entidades.ts) más el `persona_id`, que es lo
 * único que hace falta para repartir las filas entre los dos lados sin consultar dos veces.
 * Parámetros: (1) array de ids, (2) límite total.
 */
export const TRAYECTORIAS_DE_PERSONAS: Consulta<FilaTrayectoriaComparada> = {
  nombre: 'trayectorias-de-personas',
  descripcion: 'Las temporadas y equipos de dos personas a la vez, con su contexto y sus cifras, para compararlas sin una consulta por jugador.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['persona_id', 'temporada', 'temporada_orden', 'equipo_id', 'club_id', 'club', 'nombre_en_fuente',
    'edicion', 'edicion_categoria', 'edicion_ambito', 'grupo', 'federacion', 'federacion_nombre',
    'partidos_con_aparicion', 'convocatorias', 'partidos_demostrados', 'titularidades', 'suplencias',
    'minutos_exactos', 'minutos_estimados', 'minutos_fiables', 'goles', 'goles_penalti',
    'propias_puerta', 'amarillas', 'rojas', 'partidos_elegibles', 'partidos_cubiertos', 'total'],
  sql: `
    with por_equipo as (
      select a.person_id,
             a.team_entry_id,
             a.season_id,
             count(distinct a.match_id)::int as partidos_con_aparicion
        from core.appearance a
       where a.person_id = any($1::bigint[])
       group by a.person_id, a.team_entry_id, a.season_id
    )
    select pe.person_id                        as persona_id,
           s.etiqueta                           as temporada,
           s.orden::int                         as temporada_orden,
           te.id                                as equipo_id,
           cl.id                                as club_id,
           cl.nombre_canonico                   as club,
           te.nombre_en_fuente,
           e.nombre_publicado                   as edicion,
           e.categoria                          as edicion_categoria,
           e.ambito                             as edicion_ambito,
           g.nombre                             as grupo,
           f.codigo                             as federacion,
           f.nombre                             as federacion_nombre,
           pe.partidos_con_aparicion,
           res.convocatorias,
           res.partidos_demostrados,
           res.titularidades,
           res.suplencias,
           res.minutos_exactos,
           res.minutos_estimados,
           res.minutos_fiables,
           res.goles,
           res.goles_penalti,
           res.propias_puerta,
           res.amarillas,
           res.rojas,
           res.partidos_elegibles,
           res.partidos_cubiertos,
           (count(*) over ())::int              as total
      from por_equipo pe
      join core.team_entry te on te.id = pe.team_entry_id
      join core.team_season ts on ts.id = te.team_season_id
      join core.club cl on cl.id = ts.club_id
      join core.phase_group g on g.id = te.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id
      join core.season s on s.id = e.season_id
      left join analytics.player_team_season_summary res
             on res.person_id = pe.person_id and res.team_entry_id = te.id
     where (${SQL_FEDERACION_NO_EXCLUIDA})
     order by pe.person_id, s.orden desc, e.nombre_publicado, te.id
     limit $2`,
};

export const CONSULTAS_COMPARAR = [PERSONAS_POR_IDS, TRAYECTORIAS_DE_PERSONAS] as const;

export const PARAMETROS_COMPARAR: Record<string, readonly unknown[]> = {
  // Dos jugadores reales de Castilla y León con trayectoria en 797 y 3769.
  'personas-por-ids': [[19057, 19054]],
  'trayectorias-de-personas': [[19057, 19054], 200],
};
