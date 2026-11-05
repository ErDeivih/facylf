import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Consultas del selector de temporada y competición (WALL objetivo 4).
 *
 * Por qué hay dos consultas nuevas y no se reutilizan `LISTADO_DE_GRUPOS` y `FACETAS_DEL_CATALOGO`
 * tal cual:
 *
 * - **`GRUPOS_DEL_SELECTOR`** devuelve `g.id` (`grupo_id`), que es lo que lleva la URL de la ficha
 *   (`/explorar/competicion/<id>`) y que `LISTADO_DE_GRUPOS` no selecciona; y añade `nivel`, que
 *   `LISTADO_DE_GRUPOS` filtra pero no devuelve. Además busca por **palabras** («Segunda Juvenil
 *   2017, Burgos»), no por una única subcadena: cada palabra tiene que empezar alguna del nombre de la
 *   competición, del grupo, de la categoría o de la federación. `LISTADO_DE_GRUPOS` busca la frase
 *   entera y no encontraría «Segunda Juvenil» contra «2ª División Provincial de Juveniles»; los
 *   ordinales («segunda» → «2») los traduce `lib/selector-competiciones.ts`, no el SQL.
 * - **`OPCIONES_DEL_SELECTOR`** trae en una sola pasada todas las opciones de los filtros (federación,
 *   temporada, categoría, modalidad, género, provincia y nivel). Con las consultas existentes harían
 *   falta tres viajes a la base para lo mismo (facetas no trae federación ni nivel).
 *
 * Ninguna de las dos consulta tablas de hechos. La más pesada es la del catálogo sin filtros (40.000
 * grupos y el recuento total en ventana): unos 400 ms medidos; con filtros de federación/temporada o
 * texto baja a decenas de milisegundos.
 */

/** Una fila del selector: el grupo con su contexto, su cobertura medida y el id de su ficha. */
export type FilaGrupoSelector = {
  /** `core.phase_group.id`: es el id que lleva la URL de la ficha de competición. */
  grupo_id: number;
  federacion: string;
  federacion_nombre: string;
  /** Nombre corto de la federación (`core.federacion_perfil`), si lo tiene. */
  federacion_corta: string | null;
  temporada: string;
  edicion_codigo: string;
  edicion: string;
  ambito: string | null;
  modalidad: string | null;
  genero: string | null;
  categoria: string | null;
  provincia: string | null;
  /** Nivel ordinal del catálogo (sólo comparable dentro de su federación y temporada). */
  nivel: number | null;
  grupo_codigo: string;
  grupo: string;
  grupo_tipo: string;
  jornadas_previstas: number | null;
  partidos_conocidos: number | null;
  partidos_con_resultado: number | null;
  actas_disponibles: number | null;
  actas_parseadas: number | null;
  complete_through_matchday: number | null;
  visibility_state: string | null;
  calculado_en: string | null;
  /** Cuántos grupos cumplen los filtros, no cuántos se devuelven: es el total de la paginación. */
  total: number;
};

/**
 * Grupos del catálogo para el selector.
 *
 * Parámetros, en orden: (1) federación, (2) temporada exacta, (3) categoría, (4) modalidad, (5) género,
 * (6) provincia, (7) nivel, (8) palabras de búsqueda (`text[]`, ya normalizadas por el llamador),
 * (9) límite, (10) desplazamiento.
 *
 * Dos reglas que se ven en el SQL:
 *
 * - **La provincia se busca también en el nombre del grupo.** Hay ediciones importadas (las de Castilla
 *   y León, por ejemplo) que no traen `provincia` rellena pero cuyos grupos se llaman «Primera -
 *   Burgos»: negar ese grupo al filtrar por Burgos sería mentir sobre lo que hay. El filtro sólo añade
 *   el nombre como segunda vía; no inventa provincias que no estén escritas.
 * - **El texto va por palabras**: cada palabra tiene que empezar alguna palabra de la competición, el
 *   grupo, la categoría, la modalidad, el género, la provincia o la federación. Se compara con
 *   `core.normaliza_nombre`, la misma función que usa el buscador por nombre, así que las tildes y las
 *   mayúsculas dan igual.
 *
 * El orden es estable (temporada de más reciente a más antigua, federación, edición, grupo) para que la
 * paginación por `offset` no repita ni se salte filas.
 */
export const GRUPOS_DEL_SELECTOR: Consulta<FilaGrupoSelector> = {
  nombre: 'grupos-del-selector',
  descripcion: 'Grupos del canónico para el selector de temporada y competición: id de la ficha, federación, temporada, edición, grupo, nivel y cobertura medida, filtrables por federación, temporada, categoría, modalidad, género, provincia, nivel y palabras.',
  plan: 'indexado',
  // Sin filtros recorre el catálogo (50.000 grupos) y cuenta el total en ventana: medido el 05/11/2026
  // entre 0,5 y 0,9 s con la máquina compartida con los recolectores (la misma consulta oscila entre
  // pasadas). Con federación/temporada o palabras baja a decenas de ms: 32–43 ms el caso «Segunda
  // Juvenil 2017, Burgos» y ~90 ms filtrando sólo por categoría. No toca ninguna tabla de hechos.
  presupuestoMs: 1_000,
  columnas: ['grupo_id', 'federacion', 'federacion_nombre', 'federacion_corta', 'temporada',
    'edicion_codigo', 'edicion', 'ambito', 'modalidad', 'genero', 'categoria', 'provincia', 'nivel',
    'grupo_codigo', 'grupo', 'grupo_tipo', 'jornadas_previstas', 'partidos_conocidos',
    'partidos_con_resultado', 'actas_disponibles', 'actas_parseadas', 'complete_through_matchday',
    'visibility_state', 'calculado_en', 'total'],
  sql: `
    select g.id                             as grupo_id,
           f.codigo                         as federacion,
           f.nombre                         as federacion_nombre,
           fp.nombre_corto                  as federacion_corta,
           s.etiqueta                       as temporada,
           e.codigo_externo                 as edicion_codigo,
           e.nombre_publicado               as edicion,
           e.ambito,
           e.modalidad,
           e.genero,
           e.categoria,
           e.provincia,
           e.nivel,
           g.codigo_externo                 as grupo_codigo,
           g.nombre                         as grupo,
           g.tipo                           as grupo_tipo,
           g.jornadas_previstas,
           c.partidos_conocidos,
           c.partidos_con_resultado,
           c.actas_disponibles,
           c.actas_parseadas,
           c.complete_through_matchday,
           c.visibility_state,
           c.calculado_en,
           (count(*) over ())::int          as total
      from core.phase_group g
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      -- Sólo se necesita el nombre corto: se lee de la tabla de perfiles y no de la vista
      -- analytics.federacion_ficha, que arrastra agregados de cobertura que aquí no se usan.
      left join core.federacion_perfil fp on fp.codigo = f.codigo
      join core.season s on s.id = e.season_id
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
     where ($1::text is null or f.codigo = $1)
       and ($2::text is null or s.etiqueta = $2)
       and ($3::text is null or e.categoria = $3)
       and ($4::text is null or e.modalidad = $4)
       and ($5::text is null or e.genero = $5)
       and ($6::text is null or e.provincia = $6
            or core.normaliza_nombre(g.nombre) like '%' || core.normaliza_nombre($6) || '%')
       and ($7::smallint is null or e.nivel = $7)
       and (coalesce(array_length($8::text[], 1), 0) = 0
            or not exists (
              select 1
                from unnest($8::text[]) as tk(token)
               where (' ' || core.normaliza_nombre(e.nombre_publicado)
                          || ' ' || core.normaliza_nombre(g.nombre)
                          || ' ' || core.normaliza_nombre(coalesce(e.categoria, ''))
                          || ' ' || core.normaliza_nombre(coalesce(e.modalidad, ''))
                          || ' ' || core.normaliza_nombre(coalesce(e.genero, ''))
                          || ' ' || core.normaliza_nombre(coalesce(e.provincia, ''))
                          || ' ' || core.normaliza_nombre(f.nombre))
                     not like '% ' || core.normaliza_nombre(tk.token) || '%'
            ))
     order by s.orden desc, f.codigo, e.nombre_publicado, g.orden, g.codigo_externo
     limit $9 offset $10`,
};

/** Una opción de un filtro: el valor que viaja en la URL y lo que se lee en pantalla. */
export type FilaOpcionSelector = {
  /** `federacion`, `temporada`, `categoria`, `modalidad`, `genero`, `provincia` o `nivel`. */
  dimension: string;
  valor: string;
  etiqueta: string;
  /** Sólo temporadas y niveles lo tienen: sirve para ordenar (temporada: año de inicio). */
  orden: number | null;
};

/**
 * Todas las opciones del selector, en una sola pasada.
 *
 * No hay listas escritas a mano: se ofrecen los valores que existen hoy en el catálogo. Un valor vacío
 * no se ofrece (ni como provincia ni como categoría): un filtro que no puede devolver nada es una
 * promesa falsa. `nivel` se rotula «Nivel N» porque es el ordinal del esquema, y se ordena de menor a
 * mayor.
 *
 * Las federaciones sin ninguna edición importada no salen: aquí se busca una competición, y no hay
 * ninguna que buscar en una federación vacía.
 */
export const OPCIONES_DEL_SELECTOR: Consulta<FilaOpcionSelector> = {
  nombre: 'opciones-del-selector',
  descripcion: 'Valores reales del catálogo canónico para los filtros del selector: federaciones con datos, temporadas, categorías, modalidades, géneros, provincias y niveles.',
  plan: 'agregado',
  // Recorre el catálogo de ediciones (19.500 filas) una vez: ~105 ms medidos el 05/11/2026.
  presupuestoMs: 500,
  columnas: ['dimension', 'valor', 'etiqueta', 'orden'],
  sql: `
    with edicion as (
      select e.federation_id, e.season_id, e.categoria, e.modalidad, e.genero, e.provincia, e.nivel
        from core.competition_edition e
        join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
    )
    select 'federacion'                 as dimension,
           f.codigo                     as valor,
           f.nombre                     as etiqueta,
           null::int                    as orden
      from core.federation f
     where (${SQL_FEDERACION_NO_EXCLUIDA})
       and exists (select 1 from edicion ed where ed.federation_id = f.id)
    union all
    select 'temporada', s.etiqueta, s.etiqueta, s.orden::int
      from core.season s
     where exists (select 1 from edicion ed where ed.season_id = s.id)
    union all
    select 'categoria', v.valor, v.valor, null::int
      from (select distinct categoria as valor from edicion
             where categoria is not null and categoria <> '') v
    union all
    select 'modalidad', v.valor, v.valor, null::int
      from (select distinct modalidad as valor from edicion
             where modalidad is not null and modalidad <> '') v
    union all
    select 'genero', v.valor, v.valor, null::int
      from (select distinct genero as valor from edicion
             where genero is not null and genero <> '') v
    union all
    select 'provincia', v.valor, v.valor, null::int
      from (select distinct provincia as valor from edicion
             where provincia is not null and provincia <> '') v
    union all
    select 'nivel', v.valor::text, 'Nivel ' || v.valor::text, v.valor::int
      from (select distinct nivel as valor from edicion where nivel is not null) v
     order by dimension, orden desc nulls last, etiqueta
     limit 2000`,
};

/** Parámetros de ejemplo: los usan las pruebas de contrato y la medición de planes. */
export const PARAMETROS_SELECTOR: Record<string, readonly unknown[]> = {
  // Sin filtros, primera página.
  'grupos-del-selector': [null, null, null, null, null, null, null, [], 30, 0],
  'opciones-del-selector': [],
};

/** Las dos consultas del selector, para las pruebas de contrato. */
export const CONSULTAS_SELECTOR = [GRUPOS_DEL_SELECTOR, OPCIONES_DEL_SELECTOR] as const;
