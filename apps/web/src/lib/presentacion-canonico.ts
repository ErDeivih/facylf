/**
 * Cómo se enseña un dato del canónico: formato, vocabulario y estados.
 *
 * Vive aparte de las páginas para que las tres que leen el canónico hablen igual, y para poder
 * comprobarlo sin levantar Next.
 *
 * La regla que gobierna este fichero es el invariante del proyecto: **`desconocido`, `no publicado`,
 * `pendiente` y «sin datos» son estados distintos y nunca se convierten en `0`**. Un valor ausente se
 * enseña como `—` o se dice con palabras («sin punto de control»), nunca como cero ni como 0-0. Por eso
 * casi todo lo que entra aquí es `number | null` y `string | null`: el `null` es información, no ruido.
 */

import { PROVINCIAS_CYL } from './provincias-cyl';
import { opcionesDeDemo } from './facetas-demo';

/** Un dato que no existe. Es un guion, no un cero: no es lo mismo «no hay» que «no lo sé». */
export const SIN_DATO = '—';

/** Formatea un recuento. `null` (no medido) sale como `—`, jamás como 0. */
export function numero(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? SIN_DATO : valor.toLocaleString('es-ES');
}

/** Formatea un instante del canónico (`timestamptz` en ISO) en hora local. Sin fecha, guion. */
export function fechaHora(valor: string | null | undefined): string {
  if (!valor) return SIN_DATO;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? SIN_DATO : fecha.toLocaleString('es-ES');
}

/** Sólo el día, para pies de tabla: la medición de cobertura no necesita segundos. */
export function fechaCorta(valor: string | null | undefined): string {
  if (!valor) return SIN_DATO;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? SIN_DATO : fecha.toLocaleDateString('es-ES');
}

/**
 * Porcentaje entero, o `null` si no se puede calcular.
 *
 * Devolver `null` —y no 0— cuando falta el total es lo que impide que una barra de progreso diga «0 %»
 * de algo que en realidad no se ha medido. Quien pinta la barra decide qué texto poner en ese caso.
 */
export function porcentaje(parte: number | null | undefined, total: number | null | undefined): number | null {
  if (parte === null || parte === undefined || total === null || total === undefined) return null;
  if (total <= 0) return null;
  return Math.round((parte / total) * 100);
}

/** Texto de un valor opcional: si no lo hay, se dice con un guion. */
export function texto(valor: string | null | undefined): string {
  return valor === null || valor === undefined || valor.trim() === '' ? SIN_DATO : valor;
}

/**
 * Etiquetas de `visibility_state`. Un valor que no esté en el esquema se enseña tal cual: preferimos
 * que se vea raro a esconderlo con una etiqueta amable.
 */
export const ETIQUETA_ESTADO: Record<string, string> = {
  completa: 'completa',
  verificada_hasta_jornada: 'hasta jornada',
  parcial_privada: 'parcial',
  oculta: 'sin publicar',
};

/** El estado de visibilidad de un grupo en palabras. `null` = no hay punto de control. */
export function estadoVisibilidad(valor: string | null | undefined): string {
  if (!valor) return 'sin punto de control';
  return ETIQUETA_ESTADO[valor] ?? valor;
}

/**
 * Vocabularios del esquema, traducidos a lo que se lee en pantalla.
 *
 * Los valores `desconocido`/`desconocida` son un dato real de la fuente (`core.competition_edition`
 * los admite a propósito), así que no se ocultan ni se pintan como un hueco: se dice «sin determinar».
 */
const VOCABULARIO: Record<string, Record<string, string>> = {
  ambito: {
    nacional: 'Nacional', regional: 'Regional', provincial: 'Provincial', ascenso: 'Ascenso',
    copa: 'Copa', otra: 'Otra', desconocido: 'Ámbito sin determinar',
  },
  modalidad: {
    futbol11: 'Fútbol 11', futbol8: 'Fútbol 8', futbol7: 'Fútbol 7', sala: 'Fútbol sala',
    playa: 'Fútbol playa', desconocida: 'Modalidad sin determinar',
  },
  genero: {
    masculina: 'Masculina', femenina: 'Femenina', mixta: 'Mixta', desconocido: 'Género sin determinar',
  },
  categoria: {
    aficionados: 'Aficionados', juvenil: 'Juvenil', cadete: 'Cadete', infantil: 'Infantil',
    alevin: 'Alevín', benjamin: 'Benjamín', prebenjamin: 'Prebenjamín', veteranos: 'Veteranos',
    desconocida: 'Categoría sin determinar',
  },
  tipo_grupo: { liga: 'Liga', fase: 'Fase', ascenso: 'Ascenso', copa: 'Copa', otra: 'Otra' },
  adaptador: { pnfg: 'PNFG', isquad: 'iSquad', fcf: 'FCF', ninguno: 'sin adaptador' },
};

/** Etiqueta legible de un valor del vocabulario canónico. Un valor desconocido se enseña tal cual. */
export function etiqueta(vocabulario: keyof typeof VOCABULARIO | string, valor: string | null | undefined): string {
  if (!valor) return SIN_DATO;
  return VOCABULARIO[vocabulario]?.[valor] ?? valor;
}

/** Una faceta del catálogo, ya ordenada para pintarla en un `select`. */
export type Faceta = { valor: string; etiqueta: string; orden: number | null };

/** Facetas del catálogo agrupadas por dimensión, tal como las devuelve `FACETAS_DEL_CATALOGO`. */
export type FacetasDelCatalogo = {
  temporadas: Faceta[];
  ambitos: Faceta[];
  categorias: Faceta[];
  modalidades: Faceta[];
  generos: Faceta[];
  provincias: Faceta[];
};

type FilaFaceta = { dimension: string; valor: string; orden: number | null };

/**
 * Agrupa las filas de facetas por dimensión.
 *
 * Las temporadas van de la más reciente a la más vieja (por `orden`, que es el año de inicio) y el
 * resto por etiqueta. No se añade ningún valor que no venga del canónico: si una categoría no tiene
 * ninguna edición, no se ofrece como filtro, porque un filtro que no puede devolver nada es una
 * promesa falsa.
 */
export function agrupaFacetas(filas: readonly FilaFaceta[]): FacetasDelCatalogo {
  const de = (dimension: string, vocabulario?: string): Faceta[] => filas
    .filter((f) => f.dimension === dimension)
    .map((f) => ({ valor: f.valor, etiqueta: vocabulario ? etiqueta(vocabulario, f.valor) : f.valor, orden: f.orden }))
    .sort((a, b) => (dimension === 'temporada'
      ? (b.orden ?? 0) - (a.orden ?? 0)
      : a.etiqueta.localeCompare(b.etiqueta, 'es')));
  return {
    temporadas: opcionesDeDemo('temporada', de('temporada')),
    ambitos: opcionesDeDemo('ambito', de('ambito', 'ambito')),
    categorias: opcionesDeDemo('categoria', de('categoria', 'categoria')),
    modalidades: opcionesDeDemo('modalidad', de('modalidad', 'modalidad')),
    generos: opcionesDeDemo('genero', de('genero', 'genero')),
    // La provincia es la única dimensión con lista propia: **las nueve de Castilla y León**, con su
    // etiqueta canónica («Ávila», «León»…). No se construye con los valores del canónico porque el
    // filtro de provincia es de la fase C y el SQL del selector casa también con el nombre del grupo
    // («Primera - Soria», «Primera - Burgos - Valladolid»), así que las nueve tienen sentido. Un valor
    // del catálogo que no sea una de las nueve no se ofrece.
    provincias: PROVINCIAS_CYL.map((nombre) => ({ valor: nombre, etiqueta: nombre, orden: null })),
  };
}

/**
 * Las etiquetas de temporada más recientes que existen en el canónico. Es lo que filtra el atajo
 * «últimas 5 temporadas»: se calcula con lo que hay, no con el año en curso.
 */
export function ultimasTemporadas(facetas: FacetasDelCatalogo, cuantas = 5): Faceta[] {
  return facetas.temporadas.slice(0, cuantas);
}
