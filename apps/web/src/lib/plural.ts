/**
 * Plurales por la regla del idioma, no por un `=== 1`.
 *
 * `Intl.PluralRules` conoce las categorías del español (`one`, `many`, `other`): así «1 grupo» y
 * «21 grupos» no dependen de un ternario copiado en cada pantalla.
 */
const REGLAS = new Intl.PluralRules('es-ES');

/** Devuelve `uno` cuando el número pide singular y `otros` en el resto de casos. */
export function plural(cantidad: number, uno: string, otros: string): string {
  return REGLAS.select(cantidad) === 'one' ? uno : otros;
}
