/** Cada cuánto se mira cada competición. Los "cada 5 minutos" sólo tienen sentido
 *  mientras se juega; el resto del tiempo es ruido para su servidor y para el nuestro.
 *  Ver PROYECTO.md §3.4. */

export type Ritmo = 'partidos' | 'finde' | 'lunes' | 'semana' | 'verano' | 'parado';

export const MINUTOS: Record<Ritmo, number> = {
  partidos: 5,
  finde: 60,
  lunes: 30,
  semana: 360,
  verano: 1440,
  parado: 0,
};

/** `momento` en hora local de España. Se pasa explícito para poder probarlo. */
export function ritmo(momento: Date, hayPartidosHoy: boolean): Ritmo {
  const dia = momento.getDay();          // 0 domingo … 6 sábado
  const hora = momento.getHours() + momento.getMinutes() / 60;
  const mes = momento.getMonth() + 1;    // 1..12

  if (mes === 7 || mes === 8) return 'verano';
  if (hora < 8) return 'parado';         // nunca de madrugada

  if (dia === 6 || dia === 0) {
    if (hayPartidosHoy && hora >= 9 && hora <= 21.5) return 'partidos';
    return 'finde';
  }
  if (dia === 1 && hora >= 9 && hora <= 23) return 'lunes';
  return 'semana';
}

export const minutosEntreCiclos = (momento: Date, hayPartidosHoy: boolean): number =>
  MINUTOS[ritmo(momento, hayPartidosHoy)];
