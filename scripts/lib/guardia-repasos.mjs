/*
 * guardia-repasos.mjs — ¿toca pagar hoy un repaso caro de la cola?
 *
 * POR QUÉ EXISTE (medido el 10/11/2026). Al arrancar, el worker repasa el ámbito de TODAS las actas (165.585 filas,
 * 0,81 GB de tabla) para reclasificarlas por categoría. En el HDD del PC ese recorrido en frío son decenas de
 * minutos: cada reinicio se comía la recolección entera de la mañana. La reconciliación es idempotente y no tiene
 * prisa (corrige etiquetas de menores/adultos), así que basta con hacerla una vez al día: igual que ya se hace con
 * `cierraCompeticionesSinDatos`.
 *
 * La regla es la del proyecto: ante la duda, repasar. Una fecha ilegible o del futuro (reloj movido) NO debe
 * bloquear el repaso para siempre.
 */

/**
 * ¿Toca repasar?
 * @param {{ultimaVez?: string|null, ahoraMs?: number, horasMaximas?: number}} opciones
 * @returns {boolean}
 */
export function tocaRepaso({ ultimaVez = null, ahoraMs = Date.now(), horasMaximas = 24 } = {}) {
  if (!ultimaVez) return true;
  const cuando = Date.parse(ultimaVez);
  if (!Number.isFinite(cuando)) return true;
  const edadMs = ahoraMs - cuando;
  if (edadMs < 0) return true; // fecha futura: reloj movido, mejor repasar
  return edadMs >= horasMaximas * 3600_000;
}
