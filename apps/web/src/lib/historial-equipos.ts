/**
 * Reglas de los historiales de equipo y de club: lo que se calcula, fuera del JSX.
 *
 * Están aquí para poder probarlas sin base de datos y sin renderizar. Las tres reglas que mandan:
 *
 *  · **un `null` es «no se sabe»** y no se convierte en `0`: sin partidos publicados no hay «0
 *    partidos», hay «sin datos»; sin puesto no hay «0.º»;
 *  · **la temporada en curso no es una temporada terminada**: su puesto es el de la última jornada
 *    publicada, no un puesto final;
 *  · **lo que la fuente publica se dice de dónde sale**: el puesto puede venir de la clasificación
 *    oficial o de la calculada con resultados; la interfaz no las mezcla a escondidas.
 *
 * La racha se queda en los signos del dato (`G`/`E`/`P`) y la traducción a V-E-D la hace la
 * presentación (`lib/forma-equipo`), que es el único sitio donde vive esa decisión.
 */
import type { FilaHistorialClub, FilaHistorialEquipo } from '@/consultas/historial-equipos';
import { etiquetaCategoria } from './vocabulario-pantalla';

/** Signos de forma tal y como los devuelve el dato. */
export type SignoDeForma = 'G' | 'E' | 'P';

/**
 * La racha de la consulta viene del resultado más reciente al más antiguo; la interfaz la lee de
 * izquierda a derecha, del más antiguo al más reciente. Un signo que no esté en el vocabulario se
 * descarta: no se pinta una letra que no se sabe qué significa.
 */
export function signosDeRacha(racha: readonly string[] | null | undefined): SignoDeForma[] {
  if (!racha) return [];
  return racha
    .filter((signo): signo is SignoDeForma => signo === 'G' || signo === 'E' || signo === 'P')
    .reverse();
}

/** De dónde sale un puesto: de la clasificación publicada o de la calculada con los resultados. */
export type OrigenDePuesto = 'publicada' | 'calculada';

/** Un puesto con su contexto: el número, cuántos equipos tenía el grupo y de dónde sale. */
export type Puesto = {
  posicion: number;
  /** Equipos del grupo, si se conoce. `null` es «no se sabe», no «0 equipos». */
  de: number | null;
  origen: OrigenDePuesto;
};

type ConPuesto = {
  posicion_linea: number | null;
  posicion_oficial: number | null;
  equipos: number | null;
  origen_posicion: string | null;
};

/**
 * El puesto de una fila, con preferencia por el de la línea (que es el de la competición principal de
 * la temporada) y, si no lo hay, el último parte oficial de la clasificación del grupo.
 */
export function puestoDeFila(fila: ConPuesto): Puesto | null {
  const de = fila.equipos ?? null;
  if (fila.posicion_linea !== null && fila.posicion_linea !== undefined) {
    return {
      posicion: fila.posicion_linea,
      de,
      origen: fila.origen_posicion === 'reconstruida' ? 'calculada' : 'publicada',
    };
  }
  if (fila.posicion_oficial !== null && fila.posicion_oficial !== undefined) {
    return { posicion: fila.posicion_oficial, de, origen: 'publicada' };
  }
  return null;
}

/** Cómo de terminada está una temporada. */
export type EstadoDeTemporada = 'en-juego' | 'final' | 'sin-datos';

type ConBalance = Pick<FilaHistorialEquipo | FilaHistorialClub,
  'jugados' | 'jornadas_previstas' | 'ultima_jornada' | 'jornada_oficial'>;

/**
 * Estado de una temporada. Si el equipo jugó menos jornadas de las previstas y **es la temporada más
 * reciente de su historial**, está en juego: su puesto es provisional. Si es una temporada anterior se
 * da por cerrada aunque falten partidos: lo que se enseña es la última clasificación publicada.
 */
export function estadoDeTemporada(fila: ConBalance, esLaTemporadaMasReciente: boolean): EstadoDeTemporada {
  const jugados = fila.jugados ?? fila.ultima_jornada ?? fila.jornada_oficial ?? null;
  const previstas = fila.jornadas_previstas ?? null;
  if (jugados === null || previstas === null) return 'sin-datos';
  if (jugados >= previstas) return 'final';
  return esLaTemporadaMasReciente ? 'en-juego' : 'final';
}

/** El movimiento de categoría que publica la evolución, en palabras que se puedan enseñar. */
export function movimientoLegible(movimiento: string | null | undefined): string | null {
  switch (movimiento) {
    case 'asciende': return 'Asciende';
    case 'desciende': return 'Desciende';
    case 'mantiene': return 'Se mantiene';
    default: return null;
  }
}

type ConLinea = {
  edicion_categoria: string | null | undefined;
  edicion_genero: string | null | undefined;
  letra: string | null | undefined;
};

/** «Juvenil B», «Cadete femenino»: la línea del equipo en una temporada. */
export function etiquetaDeLineaDeEquipo(fila: ConLinea): string {
  const categoria = etiquetaCategoria(fila.edicion_categoria);
  const letra = fila.letra === null || fila.letra === undefined || fila.letra === 'A' ? '' : ` ${fila.letra}`;
  const femenino = fila.edicion_genero === 'femenina' ? ' femenino' : '';
  return `${categoria}${letra}${femenino}`;
}

type ConEquipoDeClub = Pick<FilaHistorialClub, 'edicion_categoria' | 'edicion_genero' | 'letra'>;

/**
 * Cómo se llama una inscripción dentro de su temporada: categoría y letra del filial. Es lo que
 * distingue al Alevín del Alevín «B» y al femenino del masculino en la misma temporada.
 */
export function etiquetaDeEquipoDeClub(fila: ConEquipoDeClub): string {
  return etiquetaDeLineaDeEquipo({
    edicion_categoria: fila.edicion_categoria,
    edicion_genero: fila.edicion_genero,
    letra: fila.letra,
  });
}

/** Temporadas de mayor a menor orden (la más reciente primero). */
export function masRecientePrimero<T extends { temporada_orden: number }>(filas: readonly T[]): T[] {
  return [...filas].sort((a, b) => b.temporada_orden - a.temporada_orden);
}

/** La fila del ancla pedida (la inscripción de la URL), o la primera si el ancla no está en la lista. */
export function filaAncla(
  filas: readonly FilaHistorialEquipo[],
  idAncla: number,
): FilaHistorialEquipo | undefined {
  return filas.find((fila) => fila.equipo_id === idAncla) ?? filas[0];
}

/** Resumen de la cabecera del historial de un equipo. */
export type ResumenDeHistorial = {
  temporadas: number;
  partidos: number | null;
  golesFavor: number | null;
  golesContra: number | null;
  mejorPuesto: Puesto | null;
  primeraTemporada: string | null;
  ultimaTemporada: string | null;
  /** Temporadas que todavía se están jugando. */
  enJuego: number;
};

function sumaConocida(valores: ReadonlyArray<number | null | undefined>): number | null {
  const conocidos = valores.filter((v): v is number => v !== null && v !== undefined);
  return conocidos.length === 0 ? null : conocidos.reduce((total, v) => total + v, 0);
}

/** Resumen del historial de un equipo, sumando sólo lo que está publicado. */
export function resumenDeHistorial(filas: readonly FilaHistorialEquipo[]): ResumenDeHistorial {
  if (filas.length === 0) {
    return {
      temporadas: 0, partidos: null, golesFavor: null, golesContra: null,
      mejorPuesto: null, primeraTemporada: null, ultimaTemporada: null, enJuego: 0,
    };
  }
  const ordenadas = masRecientePrimero(filas);
  const actual = ordenadas[0]!.temporada_orden;
  const puestos = filas.map(puestoDeFila).filter((p): p is Puesto => p !== null);
  return {
    temporadas: new Set(filas.map((fila) => fila.temporada)).size,
    partidos: sumaConocida(filas.map((fila) => fila.jugados)),
    golesFavor: sumaConocida(filas.map((fila) => fila.goles_favor)),
    golesContra: sumaConocida(filas.map((fila) => fila.goles_contra)),
    mejorPuesto: puestos.length === 0 ? null : puestos.reduce((mejor, p) => (p.posicion < mejor.posicion ? p : mejor)),
    primeraTemporada: ordenadas[ordenadas.length - 1]!.temporada,
    ultimaTemporada: ordenadas[0]!.temporada,
    enJuego: filas.filter((fila) => estadoDeTemporada(fila, fila.temporada_orden === actual) === 'en-juego').length,
  };
}

/** Una temporada del historial de un equipo, ya resuelta para pintarla. */
export type TemporadaDeEquipo = {
  fila: FilaHistorialEquipo;
  estado: EstadoDeTemporada;
  puesto: Puesto | null;
  movimiento: string | null;
  racha: SignoDeForma[];
};

/**
 * El historial de un equipo, temporada a temporada y de la más reciente a la más antigua.
 *
 * La «temporada más reciente» es la de mayor orden de la propia línea: es la única que puede estar en
 * juego; insiste en `estadoDeTemporada` la regla de que una temporada vieja con partidos sin jugar no
 * se presenta como si se estuviera jugando.
 */
export function historialDeEquipo(filas: readonly FilaHistorialEquipo[]): {
  temporadas: TemporadaDeEquipo[];
  resumen: ResumenDeHistorial;
  actual: number | null;
} {
  const actual = filas.length === 0 ? null : Math.max(...filas.map((fila) => fila.temporada_orden));
  return {
    actual,
    resumen: resumenDeHistorial(filas),
    temporadas: masRecientePrimero(filas).map((fila) => ({
      fila,
      estado: estadoDeTemporada(fila, fila.temporada_orden === actual),
      puesto: puestoDeFila(fila),
      movimiento: movimientoLegible(fila.movimiento),
      racha: signosDeRacha(fila.racha),
    })),
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Historial de un club
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Sólo las filas que son un equipo: un club sin equipos devuelve una fila con el equipo a `null`. */
export function filasDeEquiposDelClub(filas: readonly FilaHistorialClub[]): FilaHistorialClub[] {
  return filas.filter((fila) => fila.equipo_id !== null);
}

/** Resumen de una temporada del club. */
export type ResumenDeTemporadaDelClub = {
  equipos: number;
  categorias: number;
  mejorPuesto: Puesto | null;
  ascensos: number;
  descensos: number;
  golesFavor: number | null;
  golesContra: number | null;
};

/** Una temporada del club con sus equipos y un resumen para la cabecera del bloque. */
export type TemporadaDelClub = {
  temporada: string;
  orden: number;
  enJuego: boolean;
  equipos: FilaHistorialClub[];
  resumen: ResumenDeTemporadaDelClub;
};

/** Resumen de los equipos de una misma temporada. */
export function resumenDeTemporadaDelClub(equipos: readonly FilaHistorialClub[]): ResumenDeTemporadaDelClub {
  const puestos = equipos.map(puestoDeFila).filter((p): p is Puesto => p !== null);
  return {
    equipos: equipos.length,
    categorias: new Set(equipos.map((equipo) => equipo.edicion_categoria).filter(Boolean)).size,
    mejorPuesto: puestos.length === 0 ? null : puestos.reduce((mejor, p) => (p.posicion < mejor.posicion ? p : mejor)),
    ascensos: equipos.filter((equipo) => equipo.movimiento === 'asciende').length,
    descensos: equipos.filter((equipo) => equipo.movimiento === 'desciende').length,
    golesFavor: sumaConocida(equipos.map((equipo) => equipo.goles_favor)),
    golesContra: sumaConocida(equipos.map((equipo) => equipo.goles_contra)),
  };
}

/**
 * El historial de un club agrupado por temporada, de la más reciente a la más antigua.
 *
 * Cada equipo de la temporada trae su estado: la temporada está «en juego» si el equipo más reciente
 * del club no ha terminado sus jornadas. Un club sin equipos devuelve una lista vacía, no una
 * temporada inventada.
 */
export function temporadasDelClub(filas: readonly FilaHistorialClub[]): TemporadaDelClub[] {
  const equipos = filasDeEquiposDelClub(filas);
  if (equipos.length === 0) return [];
  const actual = Math.max(...equipos.map((equipo) => equipo.temporada_orden ?? 0));
  const porTemporada = new Map<string, { orden: number; equipos: FilaHistorialClub[] }>();
  for (const equipo of equipos) {
    if (equipo.temporada === null || equipo.temporada_orden === null) continue;
    const grupo = porTemporada.get(equipo.temporada) ?? { orden: equipo.temporada_orden, equipos: [] };
    grupo.equipos.push(equipo);
    porTemporada.set(equipo.temporada, grupo);
  }
  return [...porTemporada.entries()]
    .sort((a, b) => b[1].orden - a[1].orden)
    .map(([temporada, grupo]) => ({
      temporada,
      orden: grupo.orden,
      enJuego: grupo.equipos.some((equipo) => estadoDeTemporada(equipo, grupo.orden === actual) === 'en-juego'),
      equipos: [...grupo.equipos].sort((a, b) =>
        (a.edicion_categoria ?? '').localeCompare(b.edicion_categoria ?? '', 'es')
        || (a.letra ?? '').localeCompare(b.letra ?? '', 'es')
        || (a.edicion ?? '').localeCompare(b.edicion ?? '', 'es')),
      resumen: resumenDeTemporadaDelClub(grupo.equipos),
    }));
}

/** Resumen de la cabecera del historial de un club. */
export type ResumenDeClub = {
  temporadas: number;
  equipos: number;
  categorias: number;
  mejorPuesto: Puesto | null;
  primeraTemporada: string | null;
  ultimaTemporada: string | null;
  enJuego: number;
};

/** Resumen del club a partir de sus inscripciones. */
export function resumenDeClubEnHistorial(filas: readonly FilaHistorialClub[]): ResumenDeClub {
  const equipos = filasDeEquiposDelClub(filas);
  const puestos = equipos.map(puestoDeFila).filter((p): p is Puesto => p !== null);
  const temporadas = [...new Set(equipos.map((equipo) => equipo.temporada).filter((t): t is string => t !== null))]
    .map((temporada) => {
      const fila = equipos.find((equipo) => equipo.temporada === temporada)!;
      return { temporada, orden: fila.temporada_orden ?? 0 };
    })
    .sort((a, b) => b.orden - a.orden);
  const actual = temporadas[0]?.orden ?? null;
  return {
    temporadas: temporadas.length,
    equipos: equipos.length,
    categorias: new Set(equipos.map((equipo) => equipo.edicion_categoria).filter(Boolean)).size,
    mejorPuesto: puestos.length === 0 ? null : puestos.reduce((mejor, p) => (p.posicion < mejor.posicion ? p : mejor)),
    primeraTemporada: temporadas.length === 0 ? null : temporadas[temporadas.length - 1]!.temporada,
    ultimaTemporada: temporadas[0]?.temporada ?? null,
    enJuego: equipos.filter((equipo) => estadoDeTemporada(equipo, actual !== null && equipo.temporada_orden === actual) === 'en-juego').length,
  };
}
