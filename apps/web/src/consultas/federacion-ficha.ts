import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Consultas propias de la ficha de federación.
 *
 * El perfil de la fuente (qué porcentaje de partidos tienen resultado, cambios, tarjetas…) ya existe en
 * `consultas/federaciones.ts` (`FICHA_FEDERACION`) y se reutiliza; los avisos, en `AVISOS_DE_DATOS`.
 * Aquí sólo vive lo que no existía: la identidad de la federación para la cabecera (con su escudo) y las
 * competiciones de la temporada con su cobertura medida por edición.
 */

/** La federación tal y como la enseña su cabecera. */
export type FilaFederacionCabecera = {
  federacion_id: number;
  codigo: string;
  nombre: string;
  portal_url: string | null;
  activa: boolean;
  adaptador: string;
  tiene_escudo: boolean;
};

/**
 * Identidad de una federación por su código.
 *
 * Se excluyen las federaciones de pruebas y todo lo que esta web no publica: desde la fase C, la única
 * federación publicada es `castilla-leon` (`FEDERACIONES_PUBLICADAS` en `lib/federaciones-excluidas.ts`);
 * `FACYLF_EXCLUIR` sigue retirando además las que la flota tiene fuera. Parámetros: (1) código.
 */
export const FEDERACION_POR_CODIGO: Consulta<FilaFederacionCabecera> = {
  nombre: 'federación-por-código',
  descripcion: 'Identidad de una federación para su ficha: nombre, portal, plataforma y si tiene escudo guardado.',
  plan: 'indexado',
  presupuestoMs: 100,
  columnas: ['federacion_id', 'codigo', 'nombre', 'portal_url', 'activa', 'adaptador', 'tiene_escudo'],
  sql: `
    select f.id                     as federacion_id,
           f.codigo,
           f.nombre,
           f.portal_url,
           f.activa,
           f.adaptador,
           exists (select 1 from core.federation_asset fa
                    where fa.federation_id = f.id and fa.tipo = 'escudo' and fa.vigente) as tiene_escudo
      from core.federation f
     where f.codigo = $1
       and f.codigo not like 'pruebas%'
       and (${SQL_FEDERACION_NO_EXCLUIDA})
     limit 1`,
};

/** Una competición (edición) de la federación con la cobertura medida de sus partidos. */
export type FilaEdicionDeFederacion = {
  edicion_id: number;
  edicion: string;
  categoria: string;
  ambito: string | null;
  genero: string;
  modalidad: string;
  temporada: string;
  grupos: number;
  primer_grupo_id: number | null;
  partidos: number | null;
  con_resultado: number | null;
  con_acta: number | null;
  lados_con_cambios: number | null;
  partidos_con_tarjetas: number | null;
  goles: number | null;
  goles_con_minuto: number | null;
  con_arbitro: number | null;
  con_posicion: number | null;
  personas: number | null;
  personas_con_codigo: number | null;
  nivel: string | null;
};

/**
 * Las competiciones de una federación en una temporada, con su cobertura medida.
 *
 * Si no se pasa temporada se usa la más reciente que tenga competiciones en la federación: así la ficha
 * abre siempre en la temporada de la que hay datos y no en una inventada. La cobertura sale de
 * `analytics.edicion_capacidad`, que se calcula al proyectar; si una edición no está medida, sus cifras
 * llegan `null` y la interfaz dice «sin medir», no 0.
 *
 * Parámetros: (1) código de federación, (2) temporada o `null`, (3) límite.
 */
export const EDICIONES_DE_LA_FEDERACION: Consulta<FilaEdicionDeFederacion> = {
  nombre: 'ediciones-de-la-federación',
  descripcion: 'Competiciones de una federación en una temporada, con grupos, partidos y la cobertura medida (resultados, actas, cambios, tarjetas, minuto del gol, árbitro y posición).',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['edicion_id', 'edicion', 'categoria', 'ambito', 'genero', 'modalidad', 'temporada', 'grupos',
    'primer_grupo_id', 'partidos', 'con_resultado', 'con_acta', 'lados_con_cambios', 'partidos_con_tarjetas',
    'goles', 'goles_con_minuto', 'con_arbitro', 'con_posicion', 'personas', 'personas_con_codigo', 'nivel'],
  sql: `
    select e.id                     as edicion_id,
           e.nombre_publicado       as edicion,
           e.categoria,
           e.ambito,
           e.genero,
           e.modalidad,
           s.etiqueta               as temporada,
           (select count(*)::int from core.phase_group g where g.competition_edition_id = e.id) as grupos,
           (select min(g2.id) from core.phase_group g2 where g2.competition_edition_id = e.id) as primer_grupo_id,
           ec.partidos,
           ec.con_resultado,
           ec.con_acta,
           ec.lados_con_cambios,
           ec.partidos_con_tarjetas,
           ec.goles,
           ec.goles_con_minuto,
           ec.con_arbitro,
           ec.con_posicion,
           ec.personas,
           ec.personas_con_codigo,
           ec.nivel
      from core.competition_edition e
      join core.season s on s.id = e.season_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      left join analytics.edicion_capacidad ec on ec.competition_edition_id = e.id
     where f.codigo = $1
       and s.id = coalesce(
             (select s2.id from core.season s2 where s2.etiqueta = $2::text limit 1),
             (select s3.id
                from core.competition_edition e3
                join core.season s3 on s3.id = e3.season_id
                join core.federation f3 on f3.id = e3.federation_id
               where f3.codigo = $1
               order by s3.orden desc
               limit 1))
     order by (ec.partidos is null), ec.partidos desc nulls last, e.nombre_publicado
     limit $3`,
};

export const CONSULTAS_FEDERACION_FICHA = [FEDERACION_POR_CODIGO, EDICIONES_DE_LA_FEDERACION] as const;

export const PARAMETROS_FEDERACION_FICHA: Record<string, readonly unknown[]> = {
  'federación-por-código': ['castilla-leon'],
  'ediciones-de-la-federación': ['castilla-leon', null, 80],
};
