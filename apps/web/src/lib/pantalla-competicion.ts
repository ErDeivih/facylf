/**
 * Reglas de presentación de la pantalla de competición (pantalla 2 del prototipo).
 *
 * Están aquí, y no dentro del JSX, para poder probarlas: las franjas de zona, las siglas del escudo y
 * el reparto de la forma son reglas de producto (qué significa cada color, qué se enseña cuando no hay
 * dato) y una prueba tiene que poder fijarlas sin renderizar la página.
 */

import { etiquetaAmbito, etiquetaCategoria, etiquetaDivision, etiquetaModalidad } from './vocabulario-pantalla';
import { TEMPORADA_MINIMA } from './temporadas';

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
 * La forma (`ultimos5` de la consulta, del más antiguo al más reciente) como los `Signo` del dato
 * (`G`/`E`/`P`). Cualquier carácter que no sea G, E o P se descarta: no se interpreta lo que no se
 * entiende.
 *
 * Ojo: `G`/`E`/`P` es el vocabulario del **dato**, no el de la pantalla. La letra que se pinta es
 * V/E/D y se saca con `letraFormaVisible` de `lib/forma-equipo.ts` (decisión de David, 04/11/2026).
 */
export function formaDe(ultimos5: string | null | undefined): Array<'G' | 'E' | 'P'> {
  return (ultimos5 ?? '').toUpperCase().split('').filter((c): c is 'G' | 'E' | 'P' => c === 'G' || c === 'E' || c === 'P');
}

/** Lo mínimo que necesita un partido para calcular la forma de un equipo. */
export type PartidoParaForma = {
  jornada: number;
  local_id: number;
  visitante_id: number;
  goles_local: number | null;
  goles_visitante: number | null;
};

/**
 * Forma de un equipo HASTA la jornada de la tabla, del partido más antiguo al más reciente y como máximo
 * cinco.
 *
 * Por qué no se usa `rachas-del-grupo`: esa consulta cuenta todos los partidos con resultado del grupo,
 * y la clasificación que se enseña puede ser la foto de una jornada anterior (en el grupo 3769 la tabla
 * oficial es de la jornada 2 y el grupo ya lleva 4 jugadas). Mezclar las dos coberturas en la misma fila
 * es el fallo I2 del QA: «PJ 2» junto a cuatro insignias. Aquí la ventana es la misma que la de la tabla.
 *
 * Un partido sin resultado publicado no se cuenta (ni como empate ni como derrota): no se inventa.
 */
export function formaHasta(
  partidos: readonly PartidoParaForma[],
  equipoId: number,
  jornadaMaxima: number,
): Array<'G' | 'E' | 'P'> {
  return partidos
    .filter((p) => p.jornada <= jornadaMaxima
      && p.goles_local !== null && p.goles_visitante !== null
      && (p.local_id === equipoId || p.visitante_id === equipoId))
    // `filter` ya devuelve un array nuevo; el `sort` es estable, así que dentro de una jornada se
    // conserva el orden de la consulta (source_order).
    .sort((a, b) => a.jornada - b.jornada)
    .slice(-5)
    .map((p): 'G' | 'E' | 'P' => {
      const gf = p.local_id === equipoId ? p.goles_local! : p.goles_visitante!;
      const gc = p.local_id === equipoId ? p.goles_visitante! : p.goles_local!;
      return gf > gc ? 'G' : gf < gc ? 'P' : 'E';
    });
}

/**
 * Colores de una insignia de forma, a partir del `Signo` del dato (`G`/`E`/`P`; la letra visible es
 * V/E/D y la pone `lib/forma-equipo.ts`).
 *
 * No se usa el token tal cual como fondo: medido, el verde de `--victoria` con texto casi blanco da
 * 4,16:1 y el ámbar 3:1, por debajo del 4,5 que exige AA para una letra de 10 px. Se oscurece el token
 * mezclándolo con la superficie fuerte del producto (`color-mix` en oklab, que conserva el tono) hasta
 * que el texto blanco se lee: el peor caso medido queda en 5,1:1 en tema oscuro.
 */
export function estiloForma(signo: 'G' | 'E' | 'P'): { backgroundColor: string; color: string } {
  const base = signo === 'G' ? 'var(--victoria)' : signo === 'P' ? 'var(--derrota)' : 'var(--empate)';
  return {
    backgroundColor: `color-mix(in oklab, ${base} 60%, var(--fondo-fuerte))`,
    color: 'var(--texto-fuerte)',
  };
}

/** Clases del color de una franja de zona. */
export function claseZona(zona: ZonaPantalla): string {
  switch (zona) {
    case 'asciende': return 'bg-[var(--zona-ascenso)]';
    case 'fase-ascenso': return 'bg-[var(--zona-fase-ascenso)]';
    case 'permanencia': return 'bg-[var(--zona-permanencia)]';
    case 'desciende': return 'bg-[var(--zona-descenso)]';
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

/**
 * `true` sólo si TODAS las filas traen reconstrucción de goles: si falta en alguna, la pantalla no
 * puede decir «estos son los goles de la jornada» porque no lo son.
 */
export function hayReconstruccionCompleta(filas: readonly GolesDeFila[]): boolean {
  return filas.length > 0
    && filas.every((f) => f.goles_favor_reconstruida !== null && f.goles_contra_reconstruida !== null);
}

/*
 * ── EL ESCUDO NO ES LA IDENTIDAD DEL CLUB ─────────────────────────────────────────────────────────────
 *
 * SISTEMA-DISENO §5: el escudo de club, cuando no hay imagen, es un marcador de posición determinista
 * (iniciales sobre un color derivado del identificador). No es el color del club y la pantalla no lo
 * presenta como tal. La función es pura para poder probar dos cosas que importan: que el mismo equipo
 * recibe siempre el mismo color, y que el texto blanco se lee encima (AA, contraste ≥ 4,5).
 */

/** Ángulo áureo: reparte los tonos de identificadores consecutivos sin amontonarlos. */
const ANGULO_AUREO = 137.508;

/** Tono (0–360) derivado del identificador del equipo. Determinista y estable entre peticiones. */
export function tonoDeEquipo(equipoId: number): number {
  const id = Math.abs(Math.trunc(Number.isFinite(equipoId) ? equipoId : 0));
  return ((id * ANGULO_AUREO) % 360 + 360) % 360;
}

/**
 * Color del marcador de escudo, derivado del id. L=0,42 y C=0,07: se queda dentro de sRGB en toda la
 * rueda de tono (sin recortes del navegador) y el peor contraste con texto casi blanco medido es 8,8:1.
 * No es el color real del club.
 */
export function colorDeEquipo(equipoId: number): string {
  return `oklch(0.42 0.07 ${tonoDeEquipo(equipoId).toFixed(1)})`;
}

/** Lo que enseña la insignia de un partido: resultado, hora publicada o, si no hay nada, un guion. */
export type MarcadorDePartido = {
  /** Texto visible. */
  texto: string;
  /** Lo que se anuncia a quien usa un lector de pantalla. */
  accesible: string;
  jugado: boolean;
};

/**
 * Un partido sin marcador NUNCA se pinta 0-0: si la federación publicó la hora, se enseña la hora; si
 * tampoco, un guion con su texto accesible. Y un marcador a medias (un lado nulo) tampoco se completa
 * con ceros.
 */
export function marcadorDePartido(p: {
  goles_local: number | null;
  goles_visitante: number | null;
  hora: string | null;
}): MarcadorDePartido {
  if (p.goles_local !== null && p.goles_visitante !== null) {
    return {
      texto: `${p.goles_local} - ${p.goles_visitante}`,
      accesible: `Resultado ${p.goles_local} a ${p.goles_visitante}`,
      jugado: true,
    };
  }
  return { texto: '—', accesible: 'Sin resultado publicado', jugado: false };
}

/**
 * Título de la pestaña del navegador para la pantalla de competición (hallazgo C7 del QA): sin esto la
 * pestaña decía siempre el título del sitio y no se distinguía una ficha de otra.
 */
export function tituloDeCompeticion(x: { edicion: string; grupo: string }): string {
  return `${x.edicion} · ${x.grupo} — Fondo Popular`;
}

/** ¿El valor del vocabulario aporta algo, o es uno de los «no se sabe» del esquema? */
const conocida = (v: string | null | undefined): v is string =>
  typeof v === 'string' && v !== '' && v !== 'desconocida' && v !== 'desconocido';

/**
 * Temporadas del desplegable que la web declara publicadas.
 *
 * Hallazgo I9 del QA: la consulta devuelve todas las ediciones de la competición (en el grupo 3769,
 * desde 2013-14) mientras el pie dice «Se publican las temporadas 2023-24 en adelante». Ofrecer una
 * temporada en el desplegable es prometer que se puede consultar, así que se filtra con la misma ventana
 * que el pie (`lib/temporadas.ts`), sin tocar la consulta: la pantalla de una temporada antigua sigue
 * sirviéndose por URL, pero no se ofrece desde la cabecera.
 */
export function temporadasPublicables<T extends { temporada: string; edicion_id?: number }>(
  temporadas: readonly T[],
  minima: string = TEMPORADA_MINIMA,
  incluirEdicion?: number | null,
): T[] {
  return temporadas.filter(
    (t) => t.temporada >= minima || (incluirEdicion != null && t.edicion_id === incluirEdicion),
  );
}

/**
 * Subtítulo de la cabecera: categoría · modalidad · ámbito y la división SÓLO si no repite la edición.
 * Lo que el vocabulario no sabe se omite: no se rellena con «Sin clasificar» dentro de una frase, que
 * se leería como un dato.
 */
export function subtituloCompeticion(x: {
  categoria: string | null | undefined;
  modalidad: string | null | undefined;
  ambito: string | null | undefined;
  division: string | null | undefined;
  edicion: string | null | undefined;
}): string {
  const normaliza = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const yaLoDiceLaEdicion = (texto: string) => normaliza(x.edicion ?? '').includes(normaliza(texto));
  const division = conocida(x.division) ? etiquetaDivision(x.division) : '';
  return [
    conocida(x.categoria) ? etiquetaCategoria(x.categoria) : '',
    conocida(x.modalidad) ? etiquetaModalidad(x.modalidad) : '',
    conocida(x.ambito) ? etiquetaAmbito(x.ambito) : '',
    division !== '' && !yaLoDiceLaEdicion(division) ? division : '',
  ].filter((parte) => parte !== '' && parte !== 'Sin clasificar').join(' · ');
}
