import type { Competicion } from './catalogo.js';

export const BASE = 'https://www.rfcylf.es/pnfg/NPcd';
export const COD_PRIMARIA = '1000120';

/** Página de una jornada. Esta URL sí está confirmada: viene de la que nos pasó el club. */
export function urlJornada(c: Competicion, jornada: number): string {
  const q = new URLSearchParams({
    cod_primaria: COD_PRIMARIA,
    CodCompeticion: c.codCompeticion,
    CodGrupo: c.codGrupo,
    CodTemporada: c.codTemporada,
    CodJornada: String(jornada),
    Sch_Codigo_Delegacion: c.codDelegacion,
  });
  return `${BASE}/NFG_CmpJornada?${q}`;
}

/**
 * PENDIENTE — no inventar.
 *
 * Las URLs que hay detrás de los botones "Calendario Excel" y "Clasificación Excel"
 * todavía no las tenemos. Se sacan en dos minutos: abrir la página de la competición,
 * F12 → pestaña Red, pulsar el botón, copiar la URL completa.
 *
 * Hasta que estén, esta función falla a propósito. Escribir aquí una URL "plausible"
 * sería inventarse un dato (CLAUDE.md) y el fallo aparecería mucho más tarde y peor.
 */
export function urlCalendarioExcel(_c: Competicion): string {
  throw new Error(
    'Falta la URL real del botón "Calendario Excel". ' +
    'Sácala con F12 → Red en la página de la competición y ponla aquí. ' +
    'Mientras tanto, el parser se prueba contra datos-ejemplo/Calendario.xls.',
  );
}

export function urlClasificacionExcel(_c: Competicion): string {
  throw new Error(
    'Falta la URL real del botón "Clasificación Excel". Ver urlCalendarioExcel().',
  );
}
