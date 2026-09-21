/*
 * ¿POR QUÉ NO HAY TABLA DE CLASIFICACIÓN EN UN GRUPO DE CATALUÑA?
 *
 * La pestaña «CLASSIFICACIÓ» del portal de la FCF pinta la tabla sólo cuando hay algo que clasificar. En la
 * temporada recién empezada hay muchos grupos cuyo primer partido todavía no se ha jugado: la pestaña existe, se
 * puede pulsar, y **no trae ninguna tabla**. Medido el 19/09/2026: el recolector lo trataba como un error de
 * maquetación, así que esos grupos gastaban tres intentos y acababan **descartados** —236 fallos en dos días y
 * varios cientos de trabajos reintentándose— para acabar sin datos que nadie iba a publicar ese día.
 *
 * Y no es lo mismo que falte la tabla porque la federación no publique todavía (normal, se reintenta más tarde)
 * que porque la maquetación haya cambiado (eso sí hay que mirarlo). Lo que los distingue es el CALENDARIO del
 * grupo, que el propio recolector ya tiene en su cola:
 *
 *   · si el grupo ya tiene partidos jugados, la tabla tiene que estar: es un problema de formato;
 *   · si tiene partidos y ninguno jugado, la federación no publica nada todavía: es publicación pendiente;
 *   · y si no se ha leído su calendario, no se puede saber: se reintenta sin llamarlo error.
 *
 * Las tres respuestas son distintas a propósito: la primera tiene que verse en los avisos, y las otras dos no.
 */
export const MENSAJE_FORMATO = 'la clasificación no trae tabla (y el grupo ya tiene partidos jugados)';
export const MENSAJE_SIN_PUBLICAR = 'el grupo todavía no ha jugado: la federación aún no publica clasificación';
export const MENSAJE_CALENDARIO_SIN_LEER = 'la clasificación no trae tabla y todavía no se ha leído el calendario del grupo';

/**
 * Decide qué hacer cuando la pestaña de clasificación no trae tabla.
 *
 * @param {{ partidosConocidos?: number, partidosJugados?: number }} datos
 *   `partidosConocidos`: filas del calendario del grupo que ya están en la cola.
 *   `partidosJugados`: de esas, cuántas tienen marcador.
 */
export function decideClasificacionSinTabla({ partidosConocidos, partidosJugados } = {}) {
  const conocidos = Number(partidosConocidos) || 0;
  const jugados = Number(partidosJugados) || 0;
  if (jugados > 0) return { clase: 'formato', publicacion: false, mensaje: MENSAJE_FORMATO };
  if (conocidos === 0) return { clase: 'calendario-sin-leer', publicacion: true, mensaje: MENSAJE_CALENDARIO_SIN_LEER };
  return { clase: 'sin-publicar', publicacion: true, mensaje: MENSAJE_SIN_PUBLICAR };
}
