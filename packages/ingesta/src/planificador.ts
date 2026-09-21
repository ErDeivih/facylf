/**
 * Cadencia de descarga de los `.xls` de cada competición.
 *
 * Esto es distinto del ritmo de resultados en vivo (frecuencia.ts). Aquí se decide
 * "cada cuánto vuelvo a bajar el fichero de esta competición", no "cada cuánto vigilo
 * un partido". La idea del proyecto (uso personal, espaciado y respetuoso) es no
 * machacar el servidor: entre semana cada competición se descarga con calma, y en fin
 * de semana se espacia menos para pillar los resultados de la jornada.
 */

export interface CompeticionConCadencia {
  slug: string;
  /** Minutos entre descargas para esta competición. Si no se indica, se usa la
   *  cadencia por defecto del momento (fin de semana vs. resto). */
  cadaMinutos?: number;
}

/** Minutos por defecto entre descargas, según el día. Ajustable por competición. */
export function cadenciaDefault(ahora: Date): number {
  const dia = ahora.getDay(); // 0 domingo … 6 sábado
  const finDeSemana = dia === 6 || dia === 0;
  return finDeSemana ? 24 * 60 : 2 * 24 * 60; // finde: a diario; entre semana: cada 2 días
}

/**
 * Qué competiciones toca revisar ahora (descargar el `.xls`).
 *
 * Una competición está "debida" si nunca se ha descargado o si hace más de su cadencia
 * desde la última descarga. `ultima` es slug → epoch en ms (fecha de la última pasada
 * que la tocó).
 */
export function debidas(
  ahora: Date,
  competiciones: CompeticionConCadencia[],
  ultima: Record<string, number>,
): string[] {
  const ahoraMs = ahora.getTime();
  return competiciones
    .filter((c) => {
      const antes = ultima[c.slug];
      if (antes === undefined) return true;
      const cada = (c.cadaMinutos ?? cadenciaDefault(ahora)) * 60_000;
      return ahoraMs - antes >= cada;
    })
    .map((c) => c.slug);
}
