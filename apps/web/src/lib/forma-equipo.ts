/**
 * La forma del equipo tal como se enseña en la interfaz: **V-E-D** (Victoria / Empate / Derrota).
 *
 * Decisión de David del 04/11/2026 (`ESPECIFICACION.md`): la aplicación usa V-E-D y el prototipo, que
 * mezclaba V-E-D en Inicio y G-E-P en Competición, se unifica a V-E-D. Es lo que entiende cualquiera.
 *
 * ── EL DATO DE ORIGEN NO CAMBIA ────────────────────────────────────────────────────────────────────
 *
 * El dominio y las consultas siguen devolviendo el `Signo` `G/E/P` (`packages/dominio`), y su
 * vocabulario no se toca: `G` significa ganado en la base y en la ingesta, y seguirá significándolo.
 * Lo que cambia es **sólo la letra que se pinta** y la palabra que se anuncia.
 *
 * Por eso la traducción vive aquí y en ningún otro sitio: un mapa por componente acabaría con una
 * pantalla en V-E-D y otra en G-E-P, que es justo el fallo que esta decisión corrige.
 */

import type { Signo } from '@facylf/dominio';

/** La letra que ve el usuario. Nunca es la del dato: `G` y `P` no llegan a la pantalla. */
export type LetraFormaVisible = 'V' | 'E' | 'D';

/** El nombre de la letra para quien usa lector de pantalla. */
export type EtiquetaForma = 'Victoria' | 'Empate' | 'Derrota';

/** El mapa `Signo` → letra visible, completo y sin huecos. */
const LETRA_VISIBLE: Record<Signo, LetraFormaVisible> = { G: 'V', E: 'E', P: 'D' };

/** El mapa `Signo` → palabra. Es lo que hace que la insignia no dependa del color (DESIGN.md §Color). */
const ETIQUETA: Record<Signo, EtiquetaForma> = { G: 'Victoria', E: 'Empate', P: 'Derrota' };

/** La letra que se pinta para un resultado del dato (`G` → `V`, `E` → `E`, `P` → `D`). */
export function letraFormaVisible(signo: Signo): LetraFormaVisible {
  return LETRA_VISIBLE[signo];
}

/** La palabra de un resultado del dato: Victoria, Empate o Derrota. */
export function etiquetaForma(signo: Signo): EtiquetaForma {
  return ETIQUETA[signo];
}

/** Lo que pinta una insignia: la letra y su palabra, juntas para que no puedan desincronizarse. */
export type InsigniaForma = {
  letra: LetraFormaVisible;
  etiqueta: EtiquetaForma;
};

/** La insignia completa de un resultado: la letra visible y el texto accesible, de una vez. */
export function insigniaForma(signo: Signo): InsigniaForma {
  return { letra: letraFormaVisible(signo), etiqueta: etiquetaForma(signo) };
}
