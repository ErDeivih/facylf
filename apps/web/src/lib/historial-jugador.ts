/**
 * Reglas del historial de jugador, puras y probadas: cómo se agrupan las apariciones en tramos, cómo se
 * detectan los cambios de equipo o club a mitad de temporada y qué se escribe cuando no hay datos.
 *
 * Las reglas que fija, y que son el motivo de que exista este fichero:
 *  · un tramo es una inscripción (`team_entry`) dentro de una temporada; la misma temporada puede tener
 *    varios tramos (varios equipos, incluso del mismo club);
 *  · dos tramos con fechas solapadas NO son un cambio: son dos equipos a la vez (cedido, filial, copa…);
 *  · sin fechas no se afirma que haya cambio; decir «no se sabe» es distinto de inventar una fecha;
 *  · los minutos son del equipo-temporada y sólo se enseñan si son fiables; si no, «Sin datos», nunca 0.
 */

import type { AparicionDeHistorial } from '@/consultas/historial';
import { rangoDeFechas } from './jornadas';

/** Un tramo: la estancia de la persona en una inscripción de equipo dentro de una temporada. */
export type TramoDeHistorial = {
  temporada: string;
  temporadaOrden: number;
  equipoId: number;
  equipo: string;
  clubId: number;
  club: string;
  edicion: string;
  edicionId: number;
  grupoId: number;
  grupo: string;
  federacion: string;
  federacionNombre: string;
  /** Primera y última aparición registrada en ese equipo, o `null` si no hay fecha publicada. */
  desde: string | null;
  hasta: string | null;
  partidos: number;
  titularidades: number;
  suplencias: number;
  convocadosSinCondicion: number;
  goles: number;
  golesPenalti: number;
  propias: number;
  amarillas: number;
  rojas: number;
  /** Minutos exactos del equipo-temporada. `null` cuando no hay dato o no es fiable. */
  minutos: number | null;
  minutosEstimados: number | null;
  minutosFiables: boolean;
};

/** Cómo termina un tramo y empieza el siguiente dentro de una misma temporada. */
export type TransicionDeHistorial = {
  tipo: 'cambio-club' | 'cambio-equipo' | 'simultaneo' | 'sin-fechas';
  desdeEquipo: string;
  hastaEquipo: string;
  desdeEquipoId: number;
  hastaEquipoId: number;
  desdeClubId: number;
  hastaClubId: number;
  /** Fecha del primer partido del tramo nuevo; `null` si no se puede afirmar. */
  fecha: string | null;
};

/** Totales de una temporada, sumando sus tramos. */
export type TotalesDeTemporada = {
  partidos: number;
  titularidades: number;
  suplencias: number;
  goles: number;
  golesPenalti: number;
  propias: number;
  amarillas: number;
  rojas: number;
  minutos: number | null;
  minutosFiables: boolean;
};

/** Una temporada con sus tramos (uno por equipo) y las transiciones entre ellos. */
export type TemporadaDeHistorial = {
  temporada: string;
  orden: number;
  tramos: TramoDeHistorial[];
  transiciones: TransicionDeHistorial[];
  totales: TotalesDeTemporada;
};

/** Resumen de toda la carrera, para las tarjetas de cabecera. */
export type ResumenDeHistorial = {
  temporadas: number;
  equipos: number;
  clubes: number;
  federaciones: string[];
  partidos: number;
  titularidades: number;
  goles: number;
  amarillas: number;
  rojas: number;
  minutos: number | null;
  minutosFiables: boolean;
};

/** Un cambio de equipo o club dentro de una temporada, para el aviso de la ficha. */
export type CambioAMitadDeTemporada = {
  temporada: string;
  tipo: 'cambio-club' | 'cambio-equipo';
  desdeEquipo: string;
  hastaEquipo: string;
  fecha: string | null;
};

/** Formato de número en castellano (miles con punto). */
const numero = (n: number): string => new Intl.NumberFormat('es-ES').format(n);

/** Texto de una fecha de tramo: «21 ago – 20 feb», «13 mar» o `null` si no hay fechas. */
export function textoDeFechas(desde: string | null, hasta: string | null): string | null {
  return rangoDeFechas(desde, hasta);
}

/** Texto de los minutos de un tramo: exactos si son fiables; si no, «Sin datos». */
export function textoDeMinutos(tramo: { minutos: number | null; minutosFiables: boolean; minutosEstimados: number | null }): string {
  if (tramo.minutos === null || !tramo.minutosFiables) return 'Sin datos';
  return `${numero(tramo.minutos)}′`;
}

/** Texto de las tarjetas: «A 2 · R 1»; si no hay ninguna, «Sin tarjetas». */
export function textoDeTarjetas(tramo: { amarillas: number; rojas: number }): string {
  if (tramo.amarillas === 0 && tramo.rojas === 0) return 'Sin tarjetas';
  return `A ${tramo.amarillas} · R ${tramo.rojas}`;
}

/** Título de la pestaña del navegador para el historial. */
export function tituloDeHistorial(nombre: string): string {
  return `${nombre} · Historial — Balompié`;
}

/** La fecha completa (con año) de un cambio, para no confundir «13 mar» de dos temporadas. */
export function fechaDeCambio(fecha: string | null): string | null {
  if (fecha === null) return null;
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(d)
    .replace(/\.$/, '');
}

/**
 * Agrupa las apariciones en tramos y temporadas.
 *
 * Una sola pasada: la página pide las apariciones UNA vez y reparte aquí, sin una consulta por equipo.
 * Las temporadas salen de la más reciente a la más antigua; dentro de cada una, los tramos de más
 * antiguo a más reciente.
 */
export function agrupaHistorial(apariciones: readonly AparicionDeHistorial[]): TemporadaDeHistorial[] {
  const porEquipo = new Map<number, TramoDeHistorial>();
  for (const a of apariciones) {
    const clave = Number(a.team_entry_id);
    const tramo = porEquipo.get(clave) ?? {
      temporada: a.temporada,
      temporadaOrden: Number(a.temporada_orden),
      equipoId: clave,
      equipo: a.equipo,
      clubId: Number(a.club_id),
      club: a.club,
      edicion: a.edicion,
      edicionId: Number(a.edicion_id),
      grupoId: Number(a.grupo_id),
      grupo: a.grupo,
      federacion: a.federacion,
      federacionNombre: a.federacion_nombre,
      desde: null,
      hasta: null,
      partidos: 0,
      titularidades: 0,
      suplencias: 0,
      convocadosSinCondicion: 0,
      goles: 0,
      golesPenalti: 0,
      propias: 0,
      amarillas: 0,
      rojas: 0,
      minutos: null,
      minutosEstimados: null,
      minutosFiables: false,
    };

    tramo.partidos += 1;
    if (a.condicion === 'starter') tramo.titularidades += 1;
    else if (a.condicion === 'substitute') tramo.suplencias += 1;
    else tramo.convocadosSinCondicion += 1;
    tramo.goles += Number(a.goles ?? 0);
    tramo.golesPenalti += Number(a.goles_penalti ?? 0);
    tramo.propias += Number(a.propias ?? 0);
    tramo.amarillas += Number(a.amarillas ?? 0);
    tramo.rojas += Number(a.rojas ?? 0);
    if (a.fecha !== null) {
      if (tramo.desde === null || a.fecha < tramo.desde) tramo.desde = a.fecha;
      if (tramo.hasta === null || a.fecha > tramo.hasta) tramo.hasta = a.fecha;
    }
    // Los minutos llegan repetidos (son del equipo-temporada): se toma el primero, no se suman.
    if (tramo.minutos === null && a.minutos_fiables === true && a.minutos_exactos !== null) {
      tramo.minutos = Number(a.minutos_exactos);
      tramo.minutosFiables = true;
    }
    if (tramo.minutosEstimados === null && a.minutos_estimados !== null) {
      tramo.minutosEstimados = Number(a.minutos_estimados);
    }
    porEquipo.set(clave, tramo);
  }

  const porTemporada = new Map<string, TemporadaDeHistorial>();
  for (const tramo of porEquipo.values()) {
    const temporada = porTemporada.get(tramo.temporada) ?? {
      temporada: tramo.temporada,
      orden: tramo.temporadaOrden,
      tramos: [],
      transiciones: [],
      totales: {
        partidos: 0, titularidades: 0, suplencias: 0, goles: 0, golesPenalti: 0, propias: 0,
        amarillas: 0, rojas: 0, minutos: null, minutosFiables: false,
      },
    };
    temporada.tramos.push(tramo);
    porTemporada.set(tramo.temporada, temporada);
  }

  const temporadas = [...porTemporada.values()].sort((a, b) => b.orden - a.orden);
  for (const temporada of temporadas) {
    temporada.tramos.sort((a, b) => {
      if (a.desde === null && b.desde === null) return a.equipo.localeCompare(b.equipo, 'es');
      if (a.desde === null) return 1;
      if (b.desde === null) return -1;
      return a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : a.equipo.localeCompare(b.equipo, 'es');
    });
    temporada.transiciones = transicionesDe(temporada.tramos);
    temporada.totales = totalesDe(temporada.tramos);
  }
  return temporadas;
}

/** Calcula las transiciones entre tramos consecutivos de una temporada ya ordenada por fecha. */
function transicionesDe(tramos: readonly TramoDeHistorial[]): TransicionDeHistorial[] {
  const transiciones: TransicionDeHistorial[] = [];
  for (let i = 1; i < tramos.length; i += 1) {
    const anterior = tramos[i - 1]!;
    const siguiente = tramos[i]!;
    const base = {
      desdeEquipo: anterior.equipo,
      hastaEquipo: siguiente.equipo,
      desdeEquipoId: anterior.equipoId,
      hastaEquipoId: siguiente.equipoId,
      desdeClubId: anterior.clubId,
      hastaClubId: siguiente.clubId,
    };
    if (anterior.desde === null || anterior.hasta === null || siguiente.desde === null) {
      transiciones.push({ ...base, tipo: 'sin-fechas', fecha: null });
      continue;
    }
    if (anterior.hasta < siguiente.desde) {
      transiciones.push({
        ...base,
        tipo: anterior.clubId === siguiente.clubId ? 'cambio-equipo' : 'cambio-club',
        fecha: siguiente.desde,
      });
      continue;
    }
    // Las fechas se solapan: son dos equipos a la vez, no un cambio.
    transiciones.push({ ...base, tipo: 'simultaneo', fecha: null });
  }
  return transiciones;
}

/** Suma los tramos de la temporada; los minutos sólo se suman si TODOS son fiables. */
function totalesDe(tramos: readonly TramoDeHistorial[]): TotalesDeTemporada {
  const totales = tramos.reduce((acc, t) => ({
    partidos: acc.partidos + t.partidos,
    titularidades: acc.titularidades + t.titularidades,
    suplencias: acc.suplencias + t.suplencias,
    goles: acc.goles + t.goles,
    golesPenalti: acc.golesPenalti + t.golesPenalti,
    propias: acc.propias + t.propias,
    amarillas: acc.amarillas + t.amarillas,
    rojas: acc.rojas + t.rojas,
  }), { partidos: 0, titularidades: 0, suplencias: 0, goles: 0, golesPenalti: 0, propias: 0, amarillas: 0, rojas: 0 });
  const minutosFiables = tramos.length > 0 && tramos.every((t) => t.minutos !== null && t.minutosFiables);
  return {
    ...totales,
    minutos: minutosFiables ? tramos.reduce((n, t) => n + (t.minutos ?? 0), 0) : null,
    minutosFiables,
  };
}

/** Los cambios de equipo o club dentro de una temporada, de la más reciente a la más antigua. */
export function cambiosAMitadDeTemporada(temporadas: readonly TemporadaDeHistorial[]): CambioAMitadDeTemporada[] {
  return temporadas.flatMap((temporada) => temporada.transiciones
    .filter((t): t is TransicionDeHistorial & { tipo: 'cambio-club' | 'cambio-equipo' } =>
      t.tipo === 'cambio-club' || t.tipo === 'cambio-equipo')
    .map((t) => ({
      temporada: temporada.temporada,
      tipo: t.tipo,
      desdeEquipo: t.desdeEquipo,
      hastaEquipo: t.hastaEquipo,
      fecha: t.fecha,
    })));
}

/** Resumen de toda la carrera a partir de las temporadas ya agrupadas. */
export function resumenDeCarrera(temporadas: readonly TemporadaDeHistorial[]): ResumenDeHistorial {
  const tramos = temporadas.flatMap((t) => t.tramos);
  const minutosFiables = tramos.length > 0 && tramos.every((t) => t.minutos !== null && t.minutosFiables);
  return {
    temporadas: temporadas.length,
    equipos: new Set(tramos.map((t) => t.equipoId)).size,
    clubes: new Set(tramos.map((t) => t.clubId)).size,
    federaciones: [...new Set(tramos.map((t) => t.federacionNombre))].sort((a, b) => a.localeCompare(b, 'es')),
    partidos: tramos.reduce((n, t) => n + t.partidos, 0),
    titularidades: tramos.reduce((n, t) => n + t.titularidades, 0),
    goles: tramos.reduce((n, t) => n + t.goles, 0),
    amarillas: tramos.reduce((n, t) => n + t.amarillas, 0),
    rojas: tramos.reduce((n, t) => n + t.rojas, 0),
    minutos: minutosFiables ? tramos.reduce((n, t) => n + (t.minutos ?? 0), 0) : null,
    minutosFiables,
  };
}

/** El equipo actual: el primer tramo de la temporada más reciente (o `null` sin historial). */
export function equipoActual(temporadas: readonly TemporadaDeHistorial[]): TramoDeHistorial | null {
  return temporadas[0]?.tramos[0] ?? null;
}

/** Formatea un número de la pantalla (miles en castellano). */
export function formateaNumero(n: number): string {
  return numero(n);
}
