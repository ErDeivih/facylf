/**
 * Regla de nombres de menores de edad (`CLAUDE.md`, `SEGURIDAD-OPERACION.md` §5).
 *
 * La instancia es privada, pero un nombre de menor no se publica nunca sin el permiso
 * `ver_menores_nombres`. Las consultas traen `es_menor`; quien pinta decide con esta función, y no
 * con un `if` suelto en cada pantalla: si mañana cambia la etiqueta, cambia en un solo sitio.
 *
 * No se inventa un nombre cuando la federación no lo publica: se dice que no está publicado.
 */
export const ETIQUETA_MENOR = 'Jugador menor de edad';
export const ETIQUETA_SIN_NOMBRE = 'Nombre no publicado';

export function nombreVisible(
  esMenor: boolean | null | undefined,
  nombre: string | null | undefined,
): string {
  if (esMenor === true) return ETIQUETA_MENOR;
  const limpio = (nombre ?? '').trim();
  return limpio === '' ? ETIQUETA_SIN_NOMBRE : limpio;
}
