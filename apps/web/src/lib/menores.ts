/**
 * Nombres y fotos de menores de edad.
 *
 * Decisión de David (05/11/2026, `DOCTRINA-CALIDAD.md` §9): la federación tiene **consentimiento de
 * tratamiento** de los datos de los menores, así que **el nombre se publica igual que el de un
 * adulto**. Las **fotos** tienen su propia regla (`lib/fotos.ts`): sólo adultos, y nunca en la
 * demo pública.
 *
 * `esMenor` se conserva en la firma porque las consultas lo traen y porque es la marca que decide esa
 * regla de fotos; para el nombre ya no cambia nada. No se inventa un nombre cuando la federación no lo
 * publica: se dice que no está publicado.
 */
export const ETIQUETA_SIN_NOMBRE = 'Nombre no publicado';

export function nombreVisible(
  _esMenor: boolean | null | undefined,
  nombre: string | null | undefined,
): string {
  const limpio = (nombre ?? '').trim();
  return limpio === '' ? ETIQUETA_SIN_NOMBRE : limpio;
}
