import {
  FEDERACION_POR_DEFECTO, federacionDeFiltro, temporadaDeFiltro, temporadaPorDefecto,
} from './estadisticas';
import { desplazamientoDeFiltro, enteroDeFiltro } from './calendario';

/**
 * Reglas de las pantallas de Rankings y Ojeo.
 *
 * Son funciones puras: los filtros de la URL, la edad del ojeo y los parámetros exactos de las
 * consultas se prueban sin Next y sin base de datos.
 *
 * Lo que se decide aquí:
 *  · **nada se inventa**: una federación o temporada que no está en el catálogo se dice y se usa la de
 *    por defecto, no se sustituye en silencio; la edad del ojeo se traduce a un año de nacimiento
 *    calculado desde la temporada (sub-19 de 2026-27 = nacidos en 2008 o después);
 *  · un parámetro inválido no rompe la página: se ignora;
 *  · **los nombres de menores se publican** (decisión del 05/11/2026): el ojeo pide los nombres a la
 *    consulta con el último parámetro en `true`. El parámetro de permiso de la consulta existente se
 *    conserva (lo usan otras superficies), pero esta pantalla no oculta a nadie;
 *  · el estado vive en la URL (`fed`, `temp`, `tipo`, `ed`, `grupo`, `min`, `offset` en rankings;
 *    `fed`, `temp`, `cat`, `edad`, `min`, `pos` en ojeo).
 */

export const RUTA_RANKINGS = '/explorar/rankings';
export const RUTA_OJEO = '/explorar/ojeo';

/** Cuántos jugadores caben en una página del ranking. */
export const TAMANO_PAGINA_RANKING = 25;

/** Cuántos perfiles devuelve el buscador de ojeo (la consulta no pagina: se dice el tope). */
export const LIMITE_OJEO = 40;

/** Los dos rankings que existen hoy. La pestaña activa va en la URL (`tipo`). */
export const TIPOS_RANKING = [
  { valor: 'goles', etiqueta: 'Goleadores' },
  { valor: 'tarjetas', etiqueta: 'Tarjetas' },
] as const;

export type TipoRanking = (typeof TIPOS_RANKING)[number]['valor'];

export type FiltrosRanking = {
  federacion: string | null;
  temporada: string | null;
  tipo: TipoRanking;
  /** `core.competition_edition.id`, o `null` = todas las de la federación y temporada. */
  edicion: number | null;
  /** `core.phase_group.id`, o `null` = todos los grupos de la competición. */
  grupo: number | null;
  minimoPartidos: number;
  desplazamiento: number;
};

/** Los mínimos de partidos que se ofrecen; un valor de la URL fuera de la lista se ignora. */
export const MINIMOS_PARTIDOS = [0, 1, 5, 10] as const;

/**
 * Mínimo de partidos por defecto: 5, como el prototipo. Sin él, el ranking de una temporada en curso
 * lo encabezan categorías de fútbol base con dos o tres partidos jugados y diez goles, que no es lo que
 * nadie busca en un ranking. La pantalla deja el filtro a la vista para poder bajarlo.
 */
export const MINIMO_PARTIDOS_POR_DEFECTO = 5;

/** Edades que entiende el buscador de talento (sub-19, sub-17, sub-16 y sub-15). */
export const EDADES_OJEO = [19, 17, 16, 15] as const;

/** Mínimos de minutos que se ofrecen en ojeo. */
export const MINUTOS_OJEO = [0, 270, 540, 900] as const;

export type PosicionOjeo = 'cualquiera' | 'portero' | 'defensa' | 'medio' | 'delantero';

export const POSICIONES_OJEO = [
  { valor: 'cualquiera', etiqueta: 'Cualquiera' },
  { valor: 'portero', etiqueta: 'Portero' },
  { valor: 'defensa', etiqueta: 'Defensa' },
  { valor: 'medio', etiqueta: 'Medio' },
  { valor: 'delantero', etiqueta: 'Delantero' },
] as const;

export type FiltrosOjeo = {
  federacion: string | null;
  temporada: string | null;
  categoria: string | null;
  /** Sub-N: la edad máxima de la temporada. `null` = sin límite de edad. */
  edad: number | null;
  minutos: number;
  posicion: PosicionOjeo;
};

type Parametros = Record<string, string | string[] | undefined>;

/** Primer valor de un parámetro; los repetidos no se interpretan. */
function uno(valor: string | string[] | undefined): string {
  return Array.isArray(valor) ? (valor[0] ?? '') : (valor ?? '');
}

/** Un código de faceta (categoría): minúsculas, letras, dígitos y guiones. */
function codigoDeFiltro(valor: string | string[] | undefined): string | null {
  const crudo = uno(valor).trim().toLowerCase();
  return /^[a-z0-9-]{1,40}$/.test(crudo) ? crudo : null;
}

/** Un id positivo de la URL; cualquier otra cosa es «sin filtro». */
function idDeFiltro(valor: string | string[] | undefined): number | null {
  return enteroDeFiltro(valor, 1_000_000_000);
}

/** ¿El valor está en la lista blanca? Si no, se usa el de por defecto. */
function unoDe<T extends number>(lista: readonly T[], valor: number | null, porDefecto: T): T {
  return valor !== null && (lista as readonly number[]).includes(valor) ? (valor as T) : porDefecto;
}

/** Lee los filtros del ranking de los `searchParams` de Next. */
export function leeFiltrosRanking(parametros: Parametros): FiltrosRanking {
  const tipoCrudo = uno(parametros.tipo).trim();
  const tipo = TIPOS_RANKING.some((t) => t.valor === tipoCrudo) ? (tipoCrudo as TipoRanking) : 'goles';
  return {
    federacion: federacionDeFiltro(parametros.fed),
    temporada: temporadaDeFiltro(parametros.temp),
    tipo,
    edicion: idDeFiltro(parametros.ed),
    grupo: idDeFiltro(parametros.grupo),
    minimoPartidos: unoDe(MINIMOS_PARTIDOS, enteroDeFiltro(parametros.min, 100), MINIMO_PARTIDOS_POR_DEFECTO),
    desplazamiento: desplazamientoDeFiltro(parametros.offset, TAMANO_PAGINA_RANKING),
  };
}

/** La URL del ranking con los filtros puestos; los valores por defecto no se escriben. */
export function urlDeRanking(filtros: FiltrosRanking, cambios: Partial<FiltrosRanking> = {}): string {
  const f = { ...filtros, ...cambios };
  const query = new URLSearchParams();
  if (f.federacion) query.set('fed', f.federacion);
  if (f.temporada) query.set('temp', f.temporada);
  if (f.tipo !== 'goles') query.set('tipo', f.tipo);
  if (f.edicion !== null) query.set('ed', String(f.edicion));
  if (f.grupo !== null) query.set('grupo', String(f.grupo));
  if (f.minimoPartidos !== MINIMO_PARTIDOS_POR_DEFECTO) query.set('min', String(f.minimoPartidos));
  if (f.desplazamiento > 0) query.set('offset', String(f.desplazamiento));
  const cadena = query.toString();
  return cadena === '' ? RUTA_RANKINGS : `${RUTA_RANKINGS}?${cadena}`;
}

/** ¿Hay algún filtro que no sea el de por defecto? Sirve para ofrecer «Quitar filtros». */
export function tieneFiltrosRanking(filtros: FiltrosRanking, porDefecto: FiltrosRanking): boolean {
  return filtros.federacion !== porDefecto.federacion
    || filtros.temporada !== porDefecto.temporada
    || filtros.edicion !== null
    || filtros.grupo !== null
    || filtros.minimoPartidos !== MINIMO_PARTIDOS_POR_DEFECTO
    || filtros.desplazamiento !== 0;
}

/**
 * Los parámetros de `RANKING_DE_JUGADORES`, en el orden del contrato.
 *
 * (1) federación, (2) temporada, (3) tipo, (4) edición, (5) grupo, (6) mínimo de partidos,
 * (7) límite, (8) desplazamiento.
 */
export function parametrosDeRanking(filtros: FiltrosRanking, limite: number): unknown[] {
  return [
    filtros.federacion, filtros.temporada, filtros.tipo, filtros.edicion, filtros.grupo,
    filtros.minimoPartidos, limite, filtros.desplazamiento,
  ];
}

/**
 * Año de nacimiento a partir del cual se considera sub-N en una temporada.
 *
 * Se calcula desde el año de INICIO de la temporada: en 2026-27, sub-19 son los nacidos en 2008 o
 * después (2026 − 18). No hay tablas de edades escritas a mano: si cambia la temporada, cambia el año.
 */
export function nacimientoDesde(temporada: string | null, edad: number | null): number | null {
  if (!temporada || edad === null) return null;
  const anio = Number(temporada.slice(0, 4));
  if (!Number.isInteger(anio)) return null;
  return anio - (edad - 1);
}

/** Las opciones del desplegable de edad, con el año que les toca en la temporada elegida. */
export function etiquetasDeEdad(temporada: string | null): Array<{ valor: string; etiqueta: string }> {
  return EDADES_OJEO.map((edad) => {
    const desde = nacimientoDesde(temporada, edad);
    return {
      valor: String(edad),
      etiqueta: desde === null ? `Sub-${edad}` : `Sub-${edad} (${desde} o después)`,
    };
  });
}

/** Lee los filtros del ojeo de los `searchParams` de Next. */
export function leeFiltrosOjeo(parametros: Parametros): FiltrosOjeo {
  const posicionCruda = uno(parametros.pos).trim();
  const posicion = POSICIONES_OJEO.some((p) => p.valor === posicionCruda)
    ? (posicionCruda as PosicionOjeo)
    : 'cualquiera';
  const edadCruda = enteroDeFiltro(parametros.edad, 30);
  const minutosCrudo = enteroDeFiltro(parametros.min, 5000);
  return {
    federacion: federacionDeFiltro(parametros.fed),
    temporada: temporadaDeFiltro(parametros.temp),
    categoria: codigoDeFiltro(parametros.cat),
    edad: unoDe(EDADES_OJEO, edadCruda, 19),
    minutos: unoDe(MINUTOS_OJEO, minutosCrudo, 270),
    posicion,
  };
}

/** La URL del ojeo con los filtros puestos; los valores por defecto no se escriben. */
export function urlDeOjeo(filtros: FiltrosOjeo, cambios: Partial<FiltrosOjeo> = {}): string {
  const f = { ...filtros, ...cambios };
  const query = new URLSearchParams();
  if (f.federacion) query.set('fed', f.federacion);
  if (f.temporada) query.set('temp', f.temporada);
  if (f.categoria) query.set('cat', f.categoria);
  if (f.edad !== 19) query.set('edad', String(f.edad));
  if (f.minutos !== 270) query.set('min', String(f.minutos));
  if (f.posicion !== 'cualquiera') query.set('pos', f.posicion);
  const cadena = query.toString();
  return cadena === '' ? RUTA_OJEO : `${RUTA_OJEO}?${cadena}`;
}

/** ¿Hay algún filtro que no sea el de por defecto? */
export function tieneFiltrosOjeo(filtros: FiltrosOjeo, porDefecto: FiltrosOjeo): boolean {
  return filtros.federacion !== porDefecto.federacion
    || filtros.temporada !== porDefecto.temporada
    || filtros.categoria !== null
    || filtros.edad !== 19
    || filtros.minutos !== 270
    || filtros.posicion !== 'cualquiera';
}

/** Traduce la posición del filtro a los dos parámetros que entiende `OJEO_JUGADORES`. */
export function posicionDeFiltro(posicion: PosicionOjeo): { esPortero: boolean | null; linea: string | null } {
  switch (posicion) {
    case 'portero': return { esPortero: true, linea: null };
    case 'defensa': return { esPortero: null, linea: 'DEF' };
    case 'medio': return { esPortero: null, linea: 'MED' };
    case 'delantero': return { esPortero: null, linea: 'DEL' };
    default: return { esPortero: null, linea: null };
  }
}

/**
 * Los parámetros de `OJEO_JUGADORES`, en el orden del contrato:
 * (1) federación, (2) temporada, (3) nacido desde, (4) nacido hasta, (5) categoría, (6) escalón
 * máximo, (7) minutos mínimos, (8) sólo porteros, (9) línea, (10) sólo por encima de su edad,
 * (11) provincia, (12) límite, (13) **puede ver nombres de menores**.
 *
 * El último va en `true` a propósito: desde el 05/11/2026 los nombres de menores se publican (la
 * federación tiene consentimiento de tratamiento). La consulta conserva el parámetro porque lo usan
 * otras superficies, pero esta pantalla no oculta a nadie.
 */
export function parametrosDeOjeo(filtros: FiltrosOjeo, limite: number): unknown[] {
  const { esPortero, linea } = posicionDeFiltro(filtros.posicion);
  return [
    filtros.federacion,
    filtros.temporada,
    nacimientoDesde(filtros.temporada, filtros.edad),
    null,
    filtros.categoria,
    null,
    filtros.minutos,
    esPortero,
    linea,
    null,
    null,
    limite,
    true,
  ];
}

/**
 * Un filtro pedido que no está en el catálogo no se sustituye en silencio: se dice. Devuelve el aviso
 * para pintarlo; la pantalla usa el valor por defecto, pero lo cuenta.
 */
export function avisoDeFiltro(
  federacion: string | null,
  temporada: string | null,
  federaciones: readonly string[],
  temporadas: readonly string[],
): string | null {
  if (federacion !== null && !federaciones.includes(federacion)) {
    return `La federación «${federacion}» no está en el catálogo.`;
  }
  if (temporada !== null && !temporadas.includes(temporada)) {
    return `La temporada «${temporada}» no está publicada.`;
  }
  return null;
}

/** Reexporta el defecto de federación del resto de la plataforma (Castilla y León). */
export { FEDERACION_POR_DEFECTO, temporadaPorDefecto };
