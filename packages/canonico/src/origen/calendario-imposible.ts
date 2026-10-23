/**
 * ¿El calendario de un grupo es IMPOSIBLE, o sea está inventado?
 *
 * Esto no es una comprobación de estilo: es la puerta que impide que entren partidos que no existieron.
 *
 * ── POR QUÉ HACE FALTA, MEDIDO ───────────────────────────────────────────────────────────────────────────
 *
 * El recolector de Cataluña repetía una jornada en todas las demás (§3.11 de `GUIA-INFORMES-EQUIPO.md`), y el
 * importador importa fielmente lo que dice la cola. Resultado el 24/09/2026: **242 grupos y 95.876 apariciones
 * infladas** dentro del canónico, y **1.277 grupos de los 1.603 que Cataluña tiene en su cola (el 80 %) con
 * un calendario imposible**, 170.012 partidos. La misma acta escrita en 34 partidos y sus jugadores contados
 * varias veces: un informe sobre uno de esos equipos puede decir «jugó 3 partidos» cuando jugó 1.
 *
 * La alternativa —importarlo y arreglarlo después— no es gratis: lo que entra hay que sacarlo, y mientras
 * tanto cualquier consulta se apoya en un dato falso sin saberlo. Eso es exactamente lo que el encargo manda
 * evitar.
 *
 * ── LAS DOS REGLAS, Y LAS DOS SON IMPOSIBLES EN CUALQUIER LIGA ────────────────────────────────────────────
 *
 *   1. **Todas las jornadas con las mismas parejas y el mismo lado.** Es la huella exacta del defecto de
 *      copia. El lado importa: en una liga a doble vuelta la jornada de vuelta empareja a los mismos equipos
 *      con los lados cambiados, así que comparar sólo los equipos marcaría como imposible cualquier grupo de
 *      dos jornadas. Se aprendió midiendo: la primera versión de la regla daba 434 grupos «imposibles» de
 *      fuera de Cataluña que eran normales.
 *   2. **Más de cuatro partidos por pareja.** Ni a cuatro vueltas se juega cinco veces contra el mismo rival.
 *      Esta regla hace falta porque el defecto no siempre repite UNA jornada: hay grupos que repiten dos (240
 *      partidos con 16 parejas), y ésos no los ve la regla 1.
 *
 * Las filas de descanso NO cuentan: no son partidos y el importador ya las descarta (`filaDeDescanso`).
 */

/** Lo mínimo que necesita una fila de partido para entrar en la cuenta. */
export type FilaDeCalendario = { jornada: number; local: string; visitante: string };

/**
 * Palabras con las que las fuentes nombran el descanso, como palabra entera.
 *
 * Es el mismo vocabulario que usa el importador para descartar esas filas
 * (`packages/ingesta/src/parsers/filas-informativas.ts`): `descansa`, `descans` y `atsedena`. Medido: sin
 * esto, el grupo 795406 de La Rioja salía marcado con 42 «partidos» que eran en su mayoría
 * `Descansa vs Descansa`.
 */
const PALABRAS_DESCANSO = ['descansa', 'descans', 'atsedena'];

const normalizaLiteral = (texto: string): string => String(texto ?? '')
  .replace(/\([^)]*\)/g, ' ')                     // `Descansa (Ganador)` es la misma palabra con marcador de estado
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function filaDeDescanso(fila: FilaDeCalendario): boolean {
  return PALABRAS_DESCANSO.includes(normalizaLiteral(fila.local))
    || PALABRAS_DESCANSO.includes(normalizaLiteral(fila.visitante));
}

export type CalendarioImposible = {
  motivo: 'todas-las-jornadas-iguales' | 'demasiadas-vueltas';
  partidos: number;
  jornadas: number;
  parejas: number;
  mensaje: string;
};

/**
 * Devuelve el motivo por el que el calendario no puede ser real, o `null` si es plausible.
 *
 * `umbralVueltas` se puede bajar en una prueba, pero no en producción: cuatro vueltas ya es raro y cinco no
 * lo hace nadie.
 */
export function calendarioImposible(
  filas: readonly FilaDeCalendario[],
  umbralVueltas = 4,
): CalendarioImposible | null {
  const reales = filas.filter((f) => !filaDeDescanso(f) && f.local && f.visitante);
  if (reales.length < 2) return null;

  const jornadas = new Set(reales.map((f) => f.jornada));
  // La pareja CON LADO: `A vs B` y `B vs A` son dos partidos distintos (ida y vuelta).
  const parejas = new Set(reales.map((f) => `${f.local.trim().toUpperCase()}|${f.visitante.trim().toUpperCase()}`));

  const comun = { partidos: reales.length, jornadas: jornadas.size, parejas: parejas.size };
  if (jornadas.size > 1 && parejas.size * jornadas.size === reales.length) {
    return { ...comun, motivo: 'todas-las-jornadas-iguales',
      mensaje: `el calendario de la cola es imposible: ${reales.length} partidos en ${jornadas.size} jornadas con `
        + `sólo ${parejas.size} parejas distintas y repetidas en el mismo lado. Es la huella del recolector que `
        + 'repetía una jornada en todas las demás; se repara reconstruyendo el calendario desde las actas' };
  }
  if (reales.length > umbralVueltas * parejas.size) {
    return { ...comun, motivo: 'demasiadas-vueltas',
      mensaje: `el calendario de la cola es imposible: ${reales.length} partidos entre sólo ${parejas.size} parejas `
        + `distintas son más de ${umbralVueltas} vueltas, y eso no lo juega ninguna liga. Es la huella del `
        + 'recolector que repetía jornadas; se repara reconstruyendo el calendario desde las actas' };
  }
  return null;
}
