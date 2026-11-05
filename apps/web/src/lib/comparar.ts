/**
 * Reglas del comparador de jugadores: los cálculos que no van en el JSX y que se pueden probar sin base
 * de datos.
 *
 * La regla que manda, como en el resto del producto: **desconocido ≠ 0**. Una métrica que falta se queda
 * `null`, la ficha dice «sin datos» en ese lado y la barra del otro se pinta sola: no se rellena con un
 * cero que parezca un hecho.
 */
import type { FilaTemporadaDePersona } from '@/consultas/entidades';
import type { FilaPersonaComparada } from '@/consultas/comparar';
import { golesCadaMinutos, totalesDeCarrera, type TotalesDeCarrera } from './fichas';

export type ContextoComparado = {
  /** Equipo de la temporada más reciente con actas, o `null` si no tiene ninguno. */
  equipoActual: { equipo_id: number; nombre: string; edicion: string; temporada: string } | null;
  federaciones: string[];
  temporadas: number;
};

/** Un lado del comparador, ya resuelto: la persona, su trayectoria, sus totales y su contexto. */
export type LadoComparado = {
  persona: FilaPersonaComparada;
  trayectoria: FilaTemporadaDePersona[];
  totales: TotalesDeCarrera;
  /** Minutos jugados sobre los posibles del equipo, sumando toda la carrera. `null` si falta el denominador. */
  porcentajeMinutos: number | null;
  contexto: ContextoComparado;
};

/**
 * Porcentaje de minutos de toda la carrera: minutos exactos entre los posibles de los equipos.
 *
 * Sólo se calcula si TODAS las temporadas con partidos tienen minutos exactos y partidos elegibles; con
 * un hueco, el porcentaje sería una media de lo conocido disfrazada de total.
 */
export function porcentajeMinutosDeCarrera(filas: readonly FilaTemporadaDePersona[]): number | null {
  let minutos = 0;
  let posibles = 0;
  let completo = true;
  for (const fila of filas) {
    if (fila.partidos_con_aparicion <= 0) continue;
    if (fila.minutos_exactos === null || fila.minutos_fiables !== true || fila.partidos_elegibles === null) {
      completo = false;
      break;
    }
    minutos += fila.minutos_exactos;
    posibles += fila.partidos_elegibles * 90;
  }
  if (!completo || posibles <= 0) return null;
  return Math.round((minutos / posibles) * 100);
}

/** Contexto de un jugador para su tarjeta del comparador. */
export function contextoDeJugador(filas: readonly FilaTemporadaDePersona[]): ContextoComparado {
  const ordenadas = [...filas].sort((a, b) => b.temporada_orden - a.temporada_orden || b.partidos_con_aparicion - a.partidos_con_aparicion);
  const primera = ordenadas[0];
  return {
    equipoActual: primera
      ? { equipo_id: Number(primera.equipo_id), nombre: primera.nombre_en_fuente, edicion: primera.edicion, temporada: primera.temporada }
      : null,
    federaciones: [...new Set(ordenadas.map((f) => f.federacion_nombre))],
    temporadas: new Set(ordenadas.map((f) => f.temporada)).size,
  };
}

/** Construye un lado del comparador a partir de la persona y sus filas de trayectoria. */
export function construyeLado(persona: FilaPersonaComparada, filas: readonly FilaTemporadaDePersona[]): LadoComparado {
  return {
    persona,
    trayectoria: [...filas],
    totales: totalesDeCarrera(filas),
    porcentajeMinutos: porcentajeMinutosDeCarrera(filas),
    contexto: contextoDeJugador(filas),
  };
}

export type FormatoDeMetrica = 'entero' | 'minutos' | 'porcentaje';
export type DireccionDeMejor = 'mas' | 'menos' | null;

/** Una métrica comparada: los dos valores y si uno de los dos es «mejor» (sólo para resaltarlo). */
export type MetricaComparada = {
  clave: string;
  etiqueta: string;
  formato: FormatoDeMetrica;
  a: number | null;
  b: number | null;
  /** Sentido en el que un valor mayor es mejor. `null` = no se resalta ninguno (disciplina, por ejemplo). */
  direccion: DireccionDeMejor;
  /** Nota corta bajo la etiqueta, si la métrica necesita contexto. */
  nota?: string;
};

/**
 * Las métricas que se comparan, en el orden del prototipo.
 *
 * No se inventa ninguna: todas salen de los totales de `TRAYECTORIA_DE_PERSONA` (partidos, minutos,
 * goles, titularidades, tarjetas). «Minutos por gol» sólo aparece con goles y minutos exactos; si no,
 * cada lado enseña «sin datos».
 */
export function metricasComparadas(a: LadoComparado, b: LadoComparado): MetricaComparada[] {
  const minutosPorGolA = golesCadaMinutos(a.totales.goles, a.totales.minutos);
  const minutosPorGolB = golesCadaMinutos(b.totales.goles, b.totales.minutos);
  return [
    { clave: 'partidos', etiqueta: 'Partidos', formato: 'entero', a: a.totales.partidos, b: b.totales.partidos, direccion: 'mas' },
    { clave: 'minutos', etiqueta: 'Minutos', formato: 'minutos', a: a.totales.minutos, b: b.totales.minutos, direccion: 'mas' },
    { clave: 'goles', etiqueta: 'Goles', formato: 'entero', a: a.totales.goles, b: b.totales.goles, direccion: 'mas' },
    { clave: 'minutos-por-gol', etiqueta: 'Minutos por gol', formato: 'minutos', a: minutosPorGolA, b: minutosPorGolB, direccion: 'menos' },
    { clave: 'porcentaje-minutos', etiqueta: '% de minutos del equipo', formato: 'porcentaje', a: a.porcentajeMinutos, b: b.porcentajeMinutos, direccion: 'mas' },
    { clave: 'titularidades', etiqueta: 'Titularidades', formato: 'entero', a: a.totales.titularidades, b: b.totales.titularidades, direccion: 'mas' },
    { clave: 'amarillas', etiqueta: 'Amarillas', formato: 'entero', a: a.totales.amarillas, b: b.totales.amarillas, direccion: null },
    { clave: 'rojas', etiqueta: 'Rojas', formato: 'entero', a: a.totales.rojas, b: b.totales.rojas, direccion: null },
  ];
}

/** Qué lado va «mejor» en una métrica, o `null` si no hay comparación posible o no se resalta. */
export function ladoDestacado(metrica: MetricaComparada): 'a' | 'b' | null {
  const { a, b, direccion } = metrica;
  if (a === null || b === null || direccion === null || a === b) return null;
  const ganaA = direccion === 'mas' ? a > b : a < b;
  return ganaA ? 'a' : 'b';
}

/** Una temporada en la rejilla de trayectorias comparadas. */
export type TemporadaComparada = { temporada: string; orden: number };

/**
 * Las temporadas que se enseñan en la rejilla: la unión de las de los dos jugadores, de la más reciente
 * a la más antigua y como mucho `maximo`. Si una temporada sólo la tiene uno, el otro lado deja el hueco.
 */
export function temporadasComparadas(
  a: readonly FilaTemporadaDePersona[],
  b: readonly FilaTemporadaDePersona[],
  maximo = 8,
): TemporadaComparada[] {
  const porTemporada = new Map<string, number>();
  for (const fila of [...a, ...b]) {
    porTemporada.set(fila.temporada, Math.max(porTemporada.get(fila.temporada) ?? 0, fila.temporada_orden));
  }
  return [...porTemporada.entries()]
    .map(([temporada, orden]) => ({ temporada, orden }))
    .sort((x, y) => y.orden - x.orden)
    .slice(0, maximo);
}

const ABREVIATURA: Record<string, string> = {
  aficionados: 'Afi.', juvenil: 'Juv.', cadete: 'Cad.', infantil: 'Inf.', alevin: 'Ale.',
  benjamin: 'Ben.', prebenjamin: 'Pre.', veteranos: 'Vet.',
};

/** Abreviatura de la categoría para una casilla estrecha. Sin vocabulario, las tres primeras letras. */
export function abreviarCategoria(categoria: string | null | undefined): string {
  const clave = (categoria ?? '').trim();
  if (clave === '') return '—';
  return ABREVIATURA[clave] ?? `${clave.slice(0, 3)}.`;
}

/** Una casilla de la rejilla: la temporada de un jugador en un equipo. */
export type CeldaDeTemporada = {
  abreviatura: string;
  etiqueta: string;
  detalle: string;
  partidos: number;
  minutos: number | null;
  equipoId: number;
};

/**
 * La casilla de una temporada. Si el jugador tuvo dos equipos ese año (juvenil y sénior, por ejemplo) se
 * enseña el que más partidos jugó, y el detalle lo dice con los dos: no se esconde el otro.
 */
export function celdaDeTemporada(
  filas: readonly FilaTemporadaDePersona[],
  temporada: string,
): CeldaDeTemporada | null {
  const deLaTemporada = filas.filter((f) => f.temporada === temporada);
  if (deLaTemporada.length === 0) return null;
  const ordenadas = [...deLaTemporada].sort((x, y) => y.partidos_con_aparicion - x.partidos_con_aparicion);
  const principal = ordenadas[0]!;
  const otros = ordenadas.length > 1 ? ` (+${ordenadas.length - 1} equipo${ordenadas.length > 2 ? 's' : ''})` : '';
  return {
    abreviatura: abreviarCategoria(principal.edicion_categoria),
    etiqueta: principal.nombre_en_fuente,
    detalle: `${principal.club} · ${principal.federacion_nombre}${otros}`,
    partidos: principal.partidos_con_aparicion,
    minutos: principal.minutos_exactos,
    equipoId: Number(principal.equipo_id),
  };
}

/** El nombre de un jugador para los títulos y las tarjetas. Sin nombre no se inventa uno. */
export function nombreDeJugador(persona: FilaPersonaComparada): string {
  return (persona.nombre_mostrado ?? '').trim() || 'Jugador sin nombre publicado';
}

/** Texto de la consulta de selección: qué se ha escrito, recortado para no romper la cabecera. */
export function textoDeSeleccion(valor: string | string[] | undefined): string | null {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  const limpio = (crudo ?? '').trim();
  return limpio === '' ? null : limpio.slice(0, 80);
}
