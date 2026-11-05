/**
 * Reglas de las fichas de jugador, equipo y club: los cálculos que NO van en el JSX.
 *
 * Están aquí para poder probarlos sin base de datos y sin renderizar, y porque varios los comparten la
 * página y su prueba. La regla que manda en todas: **un `null` es «no se sabe»** y no se convierte en
 * cero. Cuando una cifra es una suma de datos incompletos se dice que es «lo seguro» (≥) en vez de
 * presentarla como el total.
 */
import type { FilaEquipoDeClub, FilaPartidoDeEquipo, FilaTemporadaDePersona } from '@/consultas/entidades';
import type { FilaTramoGoles } from '@/consultas/fichas';
import { etiquetaCategoria, etiquetaGenero } from './vocabulario-pantalla';

/** Los seis tramos de quince minutos del prototipo. */
export const TRAMOS = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'] as const;
export type Tramo = (typeof TRAMOS)[number];

/** Formato de número castellano: 2.850, no 2850. */
export function formatoNumero(valor: number): string {
  return new Intl.NumberFormat('es-ES').format(valor);
}

/**
 * Iniciales del avatar de una persona: como mucho dos letras, sin partículas («de», «del», «la»).
 * Sin nombre no se dibuja una letra inventada: se devuelve `·`.
 */
export function inicialesDeNombre(nombre: string): string {
  const particulas = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'o', 'da', 'do', 'dos', 'das', 'van', 'von', 'di', 'le']);
  const palabras = (nombre ?? '')
    .split(/[\s,.'’()/-]+/)
    .filter((p) => p.length > 1 && !particulas.has(p.toLocaleLowerCase('es')) && /[a-z0-9áéíóúüñ]/i.test(p));
  return palabras.slice(0, 2).map((p) => p[0]!.toLocaleUpperCase('es')).join('') || '·';
}

/**
 * Fecha `YYYY-MM-DD` a partir de lo que devuelve el driver: `Date` para `timestamptz`, texto para
 * `date`. Una fecha que no se puede leer es `null`, no la de hoy.
 */
export function fechaDeValor(valor: unknown): string | null {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  }
  const texto = String(valor ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
  return null;
}

/** Suma de una lista de cifras que pueden faltar: `null` si no hay ninguna conocida. */
function suma(valores: ReadonlyArray<number | null | undefined>): number | null {
  const conocidos = valores.filter((v): v is number => v !== null && v !== undefined);
  return conocidos.length === 0 ? null : conocidos.reduce((t, v) => t + v, 0);
}

/** Un identificador de la URL sólo vale si es un entero positivo; lo demás no es una ficha. */
export function idDeFicha(crudo: string | undefined): number | null {
  if (!/^\d{1,18}$/.test(crudo ?? '')) return null;
  const id = Number(crudo);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Jugador
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

export type TotalesDeCarrera = {
  temporadas: number;
  equipos: number;
  partidos: number;
  goles: number | null;
  minutos: number | null;
  /** `false` si alguna temporada no permite calcular los minutos exactos: el total es «lo seguro». */
  minutosFiables: boolean;
  convocatorias: number | null;
  titularidades: number | null;
  suplencias: number | null;
  amarillas: number | null;
  rojas: number | null;
};

/** Totales de toda la carrera, sumados de la trayectoria (que ya trae una fila por equipo y temporada). */
export function totalesDeCarrera(filas: readonly FilaTemporadaDePersona[]): TotalesDeCarrera {
  const minutos = suma(filas.map((f) => f.minutos_exactos));
  const conMinutos = filas.filter((f) => f.partidos_con_aparicion > 0);
  const minutosFiables = minutos !== null
    && conMinutos.length > 0
    && conMinutos.every((f) => f.minutos_fiables === true && f.minutos_exactos !== null);
  return {
    temporadas: new Set(filas.map((f) => f.temporada)).size,
    equipos: new Set(filas.map((f) => f.equipo_id)).size,
    partidos: filas.reduce((t, f) => t + Number(f.partidos_con_aparicion ?? 0), 0),
    goles: suma(filas.map((f) => f.goles)),
    minutos,
    minutosFiables,
    convocatorias: suma(filas.map((f) => f.convocatorias)),
    titularidades: suma(filas.map((f) => f.titularidades)),
    suplencias: suma(filas.map((f) => f.suplencias)),
    amarillas: suma(filas.map((f) => f.amarillas)),
    rojas: suma(filas.map((f) => f.rojas)),
  };
}

export type MinutosDeUnaTemporada = {
  temporada: string;
  minutos: number | null;
  fiables: boolean;
  equipos: number;
};

/** Minutos por temporada para el gráfico de barras, de la temporada más reciente a la más antigua. */
export function minutosPorTemporada(filas: readonly FilaTemporadaDePersona[]): MinutosDeUnaTemporada[] {
  const porTemporada = new Map<string, { orden: number; minutos: (number | null)[]; fiables: boolean; equipos: number }>();
  for (const fila of filas) {
    const actual = porTemporada.get(fila.temporada) ?? { orden: fila.temporada_orden, minutos: [], fiables: true, equipos: 0 };
    actual.minutos.push(fila.minutos_exactos);
    actual.fiables = actual.fiables && fila.minutos_fiables === true && fila.minutos_exactos !== null;
    actual.equipos += 1;
    porTemporada.set(fila.temporada, actual);
  }
  return [...porTemporada.entries()]
    .sort((a, b) => b[1].orden - a[1].orden)
    .map(([temporada, datos]) => ({
      temporada,
      minutos: suma(datos.minutos),
      fiables: datos.fiables,
      equipos: datos.equipos,
    }));
}

/** Porcentaje de minutos jugados sobre los posibles del equipo (`partidos_elegibles × 90`). */
export function porcentajeDeMinutos(minutos: number | null, partidosElegibles: number | null): number | null {
  if (minutos === null || partidosElegibles === null || partidosElegibles <= 0) return null;
  return Math.round((minutos / (partidosElegibles * 90)) * 100);
}

/** Un gol cada cuántos minutos. Sólo tiene sentido con goles y minutos exactos. */
export function golesCadaMinutos(goles: number | null, minutos: number | null): number | null {
  if (goles === null || goles <= 0 || minutos === null || minutos <= 0) return null;
  return Math.round(minutos / goles);
}

/** Signos de la forma del dato (`G`/`E`/`P`) desde el resultado ya resuelto de un partido. */
const SIGNO: Record<string, 'G' | 'E' | 'P' | null> = {
  ganado: 'G', empatado: 'E', perdido: 'P', sin_resultado: null,
};

/** La racha de los últimos partidos JUGADOS, del más antiguo al más reciente. */
export function rachaDeResultados(partidos: readonly { resultado: string }[], cuantos = 5): Array<'G' | 'E' | 'P'> {
  return partidos
    .map((p) => SIGNO[p.resultado] ?? null)
    .filter((s): s is 'G' | 'E' | 'P' => s !== null)
    .slice(-cuantos);
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Equipo
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

export type BalanceCasaFuera = { ganados: number; empatados: number; perdidos: number };

export type ResumenDeEquipo = {
  jugados: number;
  sinResultado: number;
  racha: Array<'G' | 'E' | 'P'>;
  casa: BalanceCasaFuera;
  fuera: BalanceCasaFuera;
};

/** Resumen de la temporada a partir de los partidos ya traídos: ni una consulta más. */
export function resumenDeEquipo(partidos: readonly { resultado: string; condicion: string }[]): ResumenDeEquipo {
  const balance = (): BalanceCasaFuera => ({ ganados: 0, empatados: 0, perdidos: 0 });
  const casa = balance();
  const fuera = balance();
  let jugados = 0;
  let sinResultado = 0;
  for (const partido of partidos) {
    const signo = SIGNO[partido.resultado];
    if (signo === null) {
      sinResultado += 1;
      continue;
    }
    jugados += 1;
    const destino = partido.condicion === 'casa' ? casa : fuera;
    if (signo === 'G') destino.ganados += 1;
    else if (signo === 'E') destino.empatados += 1;
    else destino.perdidos += 1;
  }
  return { jugados, sinResultado, racha: rachaDeResultados(partidos), casa, fuera };
}

/**
 * Goles a favor y en contra de un equipo, sumando SÓLO los partidos con marcador publicado.
 *
 * Si no hay ningún partido con resultado, favor y contra son `null` (no 0): un 0-0 de relleno diría
 * que no ha marcado y lo que pasa es que no se sabe.
 */
export function golesDelEquipo(
  partidos: readonly { resultado?: string; goles_propios?: number | null; goles_rival?: number | null }[],
): { jugados: number; favor: number | null; contra: number | null } {
  const conMarcador = partidos.filter((p) => p.goles_propios !== null && p.goles_propios !== undefined
    && p.goles_rival !== null && p.goles_rival !== undefined);
  if (conMarcador.length === 0) return { jugados: 0, favor: null, contra: null };
  return {
    jugados: conMarcador.length,
    favor: conMarcador.reduce((t, p) => t + Number(p.goles_propios), 0),
    contra: conMarcador.reduce((t, p) => t + Number(p.goles_rival), 0),
  };
}

/** Un tramo con sus dos cifras, ya relleno, para el gráfico de barras espejo. */
export type TramoCompleto = { tramo: Tramo; favor: number; contra: number };

/**
 * Los seis tramos completos, o `null` si el acta no trae el minuto de ningún gol.
 *
 * Cuando hay goles con minuto, un tramo sin goles es un cero de verdad (no marcó en ese cuarto de
 * hora). Cuando no hay ninguno, no se pinta el gráfico: no es que marcara cero, es que no se sabe.
 */
export function tramosCompletos(filas: readonly FilaTramoGoles[]): TramoCompleto[] | null {
  if (filas.length === 0) return null;
  return TRAMOS.map((tramo) => {
    const fila = filas.find((f) => f.tramo === tramo);
    return { tramo, favor: Number(fila?.favor ?? 0), contra: Number(fila?.contra ?? 0) };
  });
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Club
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** La temporada más reciente con equipos del club, o `null` si no tiene ninguna. */
export function temporadaActual(equipos: readonly FilaEquipoDeClub[]): string | null {
  if (equipos.length === 0) return null;
  return [...equipos].sort((a, b) => b.temporada_orden - a.temporada_orden)[0]!.temporada;
}

/** La letra del equipo dentro del club (A, B, C…), sacada del nombre publicado entre comillas. */
export function letraDeEquipo(nombre: string): string | null {
  const m = /["“”'']([A-Z])["“”'']/.exec(nombre ?? '');
  return m ? m[1]! : null;
}

/** Cómo se llama una línea de equipo en la ficha: «Juvenil A», «Cadete B femenino», «Aficionado». */
export function etiquetaDeLinea(fila: Pick<FilaEquipoDeClub, 'edicion_categoria' | 'edicion_genero' | 'nombre_en_fuente'>): string {
  const letra = letraDeEquipo(fila.nombre_en_fuente) ?? 'A';
  const femenino = fila.edicion_genero === 'femenina' ? ' femenino' : '';
  return `${etiquetaCategoria(fila.edicion_categoria)} ${letra}${femenino}`;
}

/** Una celda de la evolución: la posición de una línea en una temporada, o `null` si no compitió. */
export type CeldaDeEvolucion = {
  posicion: number | null;
  grupo_id: number | null;
  /** Respecto a la temporada anterior de esa misma línea: sube si la posición mejora (número menor). */
  movimiento: 'sube' | 'baja' | null;
};

export type FilaDeEvolucion = { clave: string; etiqueta: string; celdas: Array<CeldaDeEvolucion | null> };
export type EvolucionDelClub = { temporadas: string[]; filas: FilaDeEvolucion[] };

/**
 * Evolución del club: una fila por línea de equipo y una columna por temporada.
 *
 * Se calcula de la lista de inscripciones que ya se ha pedido para la ficha (sin una consulta por
 * temporada). La clave de línea es categoría + letra + género: es lo que distingue al Juvenil A del
 * Juvenil B, y al cadete femenino del cadete masculino.
 */
export function evolucionDelClub(equipos: readonly FilaEquipoDeClub[], maxTemporadas = 6): EvolucionDelClub {
  const ordenadas = [...equipos].sort((a, b) => b.temporada_orden - a.temporada_orden);
  const temporadas = [...new Set(ordenadas.map((e) => e.temporada))].slice(0, maxTemporadas);
  const lineas = new Map<string, FilaDeEvolucion>();
  for (const equipo of ordenadas) {
    const letra = letraDeEquipo(equipo.nombre_en_fuente) ?? 'A';
    const clave = `${equipo.edicion_categoria}|${letra}|${equipo.edicion_genero ?? ''}`;
    const fila = lineas.get(clave) ?? {
      clave,
      etiqueta: etiquetaDeLinea(equipo),
      celdas: temporadas.map(() => null) as Array<CeldaDeEvolucion | null>,
    };
    const indice = temporadas.indexOf(equipo.temporada);
    if (indice >= 0) {
      fila.celdas[indice] = { posicion: equipo.posicion, grupo_id: equipo.grupo_id, movimiento: null };
    }
    lineas.set(clave, fila);
  }
  for (const fila of lineas.values()) {
    for (let i = 0; i < fila.celdas.length - 1; i += 1) {
      const actual = fila.celdas[i];
      // La columna siguiente es la temporada ANTERIOR (las columnas van de la más reciente a la más vieja).
      const anterior = fila.celdas[i + 1];
      if (!actual || !anterior || actual.posicion === null || anterior.posicion === null) continue;
      if (actual.posicion < anterior.posicion) actual.movimiento = 'sube';
      else if (actual.posicion > anterior.posicion) actual.movimiento = 'baja';
    }
  }
  return {
    temporadas,
    filas: [...lineas.values()].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es')),
  };
}

/** Resumen del club para sus tarjetas: cuántas temporadas, cuántos equipos y su mejor puesto. */
export function resumenDelClub(equipos: readonly FilaEquipoDeClub[]): {
  temporadas: number;
  equipos: number;
  mejorPosicion: number | null;
  ultimaTemporada: string | null;
} {
  const posiciones = equipos.map((e) => e.posicion).filter((p): p is number => p !== null && p !== undefined);
  return {
    temporadas: new Set(equipos.map((e) => e.temporada)).size,
    equipos: equipos.length,
    mejorPosicion: posiciones.length === 0 ? null : Math.min(...posiciones),
    ultimaTemporada: temporadaActual(equipos),
  };
}

/** Re-exporta el traductor de categoría para que las páginas no tengan que saber de dónde sale. */
export { etiquetaCategoria, etiquetaGenero };
