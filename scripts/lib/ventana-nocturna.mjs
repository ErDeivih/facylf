/*
 * ventana-nocturna.mjs — ¿estamos en la ventana en la que se permite el repaso pesado de actas?
 *
 * POR QUÉ EXISTE (medido el 10/11/2026). `cierraCompeticionesSinDatos` recorre la tabla de actas entera (0,8 GB) y
 * es una reparación idempotente que no tiene prisa. Si le toca a media tarde, se come la recolección: ese día el
 * worker estuvo más de una hora sin pedir. La regla es: ese repaso se hace de noche (por defecto 02:00-06:00), que
 * es cuando también corre el ciclo diario.
 */

/**
 * @param {{hora?: number, desde?: number, hasta?: number}} opciones
 * @returns {boolean}
 */
export function enVentanaNocturna({ hora = new Date().getHours(), desde = 2, hasta = 6 } = {}) {
  if (!Number.isFinite(hora)) return false;
  const h = ((Math.trunc(hora) % 24) + 24) % 24;
  if (desde === hasta) return true;
  if (desde < hasta) return h >= desde && h < hasta;
  // Ventana que cruza medianoche (p. ej. 23 a 04).
  return h >= desde || h < hasta;
}
