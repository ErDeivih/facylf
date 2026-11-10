/*
 * repaso-actas.mjs — cuándo hay que volver a contar las actas guardadas con un parser viejo.
 *
 * POR QUÉ EXISTE (09/11/2026). El recolector cuenta las actas desactualizadas una vez por sesión
 * (`cuentaActasDesactualizadas`), y ese `count(*)` recorre la tabla `actas` entera, con el JSON de cada
 * acta: 2,4 GB. En el PC, con la cola en un HDD, son 40-60 minutos con el bucle bloqueado: medido esa
 * noche, el worker estuvo 42 minutos sin una sola petición en el paso 25 de la sesión. El recuento es
 * necesario cuando de verdad hay actas que reparar o cuando cambia el parser, pero repetirlo en cada
 * arranque de sesión (y esa noche hubo varios reinicios) es tirar la noche.
 *
 * La decisión es pura y se prueba aparte: se salta el recuento sólo si el último dejó la cola LIMPIA,
 * lo hizo con la MISMA versión de parser y no han pasado demasiadas horas. En cualquier otra situación
 * se cuenta (es más barato pagar el escaneo que dejar actas con un parser viejo sin reparar).
 */

/** Horas que se puede dar por bueno un recuento que dejó la cola limpia. */
export const HORAS_ENTRE_REPASOS = 24;

/**
 * @param {object} opciones
 * @param {{version?: number|string, limpio?: boolean, cuando?: string}|null|undefined} opciones.guardado
 *   lo que se guardó la última vez (metadato `actas_repaso` de la cola)
 * @param {number} opciones.versionActual versión del parser que usa esta sesión
 * @param {number} opciones.ahoraMs reloj actual en milisegundos
 * @param {number} [opciones.horasMaximas] horas que vale un recuento limpio
 * @returns {'contar'|'saltar'}
 */
export function decisionDeRepaso({ guardado, versionActual, ahoraMs, horasMaximas = HORAS_ENTRE_REPASOS }) {
  if (guardado === null || typeof guardado !== 'object') return 'contar';
  if (Number(guardado.version) !== Number(versionActual)) return 'contar';
  if (guardado.limpio !== true) return 'contar';
  const cuando = Date.parse(String(guardado.cuando ?? ''));
  if (!Number.isFinite(cuando)) return 'contar';
  const horas = (Number(ahoraMs) - cuando) / 3_600_000;
  // Un reloj que va hacia atrás (o un metadato del futuro) no sirve para saltarse el repaso.
  if (!Number.isFinite(horas) || horas < 0) return 'contar';
  if (horas > Number(horasMaximas)) return 'contar';
  return 'saltar';
}

/**
 * Lo que se guarda en la cola después de contar.
 * @param {{versionActual: number, pendientes: number, ahoraMs: number}} opciones
 * @returns {string} JSON listo para `guardaMetadato(db, 'actas_repaso', …)`
 */
export function metadatoDeRepaso({ versionActual, pendientes, ahoraMs }) {
  return JSON.stringify({
    version: Number(versionActual),
    limpio: Number(pendientes) === 0,
    cuando: new Date(Number(ahoraMs)).toISOString(),
  });
}

/**
 * Decisión + recuento en un paso, para que TODOS los sitios que cuentan (el arranque y el paso 25 de la
 * sesión) apliquen la misma regla. `contar` sólo se llama cuando de verdad toca.
 *
 * @param {object} opciones
 * @param {{version?: number|string, limpio?: boolean, cuando?: string}|null|undefined} opciones.guardado
 * @param {number} opciones.versionActual
 * @param {number} opciones.ahoraMs
 * @param {() => number} opciones.contar el `count(*)` caro de la cola
 * @param {number} [opciones.horasMaximas]
 * @returns {{pendientes: number, contado: boolean, metadato?: string}}
 */
export function pendientesAPartirDe({ guardado, versionActual, ahoraMs, contar, horasMaximas = HORAS_ENTRE_REPASOS }) {
  const decision = decisionDeRepaso({ guardado, versionActual, ahoraMs, horasMaximas });
  if (decision === 'saltar') return { pendientes: 0, contado: false };
  const pendientes = Number(contar()) || 0;
  return { pendientes, contado: true, metadato: metadatoDeRepaso({ versionActual, pendientes, ahoraMs }) };
}
