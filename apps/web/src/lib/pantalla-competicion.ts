/**
 * Reglas de presentación de la pantalla de competición (pantalla 2 del prototipo).
 *
 * Están aquí, y no dentro del JSX, para poder probarlas: las franjas de zona, las siglas del escudo y
 * el reparto de la forma son reglas de producto (qué significa cada color, qué se enseña cuando no hay
 * dato) y una prueba tiene que poder fijarlas sin renderizar la página.
 */

/** Las cuatro franjas del prototipo. `null` = sin zona asignada. */
export type ZonaPantalla = 'asciende' | 'fase-ascenso' | 'permanencia' | 'desciende' | null;

/** Lo que la pantalla necesita de `analytics.zonas_de_grupo`; no se inventa nada si falta. */
export type ZonasDelGrupo = {
  ascensos: number;
  promocion: number;
  descensos: number;
  promocion_permanencia: number;
  origen: string;
  confianza: number | null;
  temporadas: number | null;
};

/**
 * Qué franja le toca a una posición. Se cuenta desde arriba para ascenso y fase de ascenso y desde
 * abajo para descenso y permanencia, que es como se publica el reglamento; si las zonas se solapan o
 * se salen del grupo, la de arriba/abajo manda y lo de en medio se queda sin franja (mejor sin color
 * que con un color inventado).
 */
export function zonaDe(posicion: number, equipos: number, zonas: ZonasDelGrupo | null): ZonaPantalla {
  if (!zonas || equipos <= 0) return null;
  const desdeAbajo = equipos - posicion + 1;
  if (posicion <= zonas.ascensos) return 'asciende';
  if (posicion <= zonas.ascensos + zonas.promocion) return 'fase-ascenso';
  if (desdeAbajo <= zonas.descensos) return 'desciende';
  if (desdeAbajo <= zonas.descensos + zonas.promocion_permanencia) return 'permanencia';
  return null;
}

const IGNORADAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'o']);

/**
 * Siglas del escudo de la competición, sacadas del nombre publicado («Liga Nacional Juvenil» → `LN`).
 * Sin nombre no se pone una decoración cualquiera: se pone `?`, que se lee como «no se sabe».
 */
export function siglas(texto: string | null | undefined): string {
  const palabras = (texto ?? '').trim().split(/\s+/)
    .filter((p) => p.length > 0 && !IGNORADAS.has(p.toLocaleLowerCase('es')) && /[a-z0-9áéíóúüñ]/i.test(p));
  const letras = palabras.map((p) => p[0]!.toLocaleUpperCase('es')).slice(0, 2);
  return letras.length > 0 ? letras.join('') : '?';
}

/**
 * La forma (`ultimos5` de la consulta, del más antiguo al más reciente) como letras que se puedan
 * pintar. Cualquier carácter que no sea G, E o P se descarta: no se interpreta lo que no se entiende.
 */
export function formaDe(ultimos5: string | null | undefined): Array<'G' | 'E' | 'P'> {
  return (ultimos5 ?? '').toUpperCase().split('').filter((c): c is 'G' | 'E' | 'P' => c === 'G' || c === 'E' || c === 'P');
}

/** Clases del color de una insignia de forma, del vocabulario del sistema de diseño. */
export function claseForma(letra: 'G' | 'E' | 'P'): string {
  if (letra === 'G') return 'bg-[var(--victoria)]';
  if (letra === 'P') return 'bg-[var(--derrota)]';
  return 'bg-[var(--empate)]';
}

/** Clases del color de una franja de zona. */
export function claseZona(zona: ZonaPantalla): string {
  switch (zona) {
    case 'asciende': return 'bg-[var(--victoria)]';
    case 'fase-ascenso': return 'bg-[var(--foco)]';
    case 'permanencia': return 'bg-[var(--amarilla)]';
    case 'desciende': return 'bg-[var(--derrota)]';
    default: return 'bg-transparent';
  }
}

/** Texto de la leyenda para cada zona; `null` cuando no hay franja que explicar. */
export function etiquetaZona(zona: Exclude<ZonaPantalla, null>): string {
  switch (zona) {
    case 'asciende': return 'Asciende';
    case 'fase-ascenso': return 'Fase de ascenso';
    case 'permanencia': return 'Promoción de permanencia';
    case 'desciende': return 'Desciende';
  }
}

/** Los campos de goles que necesita la tabla; vale tanto para la oficial como para la reconstruida. */
export type GolesDeFila = {
  goles_favor: number;
  goles_contra: number;
  goles_favor_reconstruida: number | null;
  goles_contra_reconstruida: number | null;
};

/**
 * ¿La tabla que se está enseñando publica goles de verdad?
 *
 * La tabla oficial de algunas federaciones no trae goles y el canónico los guarda como 0 (la columna
 * es `not null`). Enseñar «0:0» en todas las filas de una liga de juveniles no es un dato: es un
 * hueco disfrazado. Medido en CyL el 04/11/2026: la oficial del grupo 797 trae 0:0 y la reconstruida
 * trae 67:29. Se considera que NO publica goles cuando TODAS las filas están a cero.
 */
export function publicaGoles(filas: readonly GolesDeFila[], origen: string | null): boolean {
  if (origen !== 'oficial') return true;
  return filas.some((f) => f.goles_favor !== 0 || f.goles_contra !== 0);
}

/**
 * Los goles que se pintan en la fila: los de la tabla si los publica, y si no los reconstruidos.
 * Sin ninguno de los dos, un guion: no se enseña un cero que no significa cero.
 */
export function golesDeLaFila(f: GolesDeFila, usarReconstruccion: boolean): string {
  if (usarReconstruccion) {
    if (f.goles_favor_reconstruida === null || f.goles_contra_reconstruida === null) return '—';
    return `${f.goles_favor_reconstruida}:${f.goles_contra_reconstruida}`;
  }
  return `${f.goles_favor}:${f.goles_contra}`;
}
