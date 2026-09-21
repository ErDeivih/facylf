/**
 * Interpreta la cabecera de una jornada tal como la pinta la FCF.
 *
 * La web usaba antes dos nodos separados ("JORNADA 1" y la fecha), pero ahora publica un
 * único nodo: "JORNADA 1 2025-09-20". El extractor exigía que el texto terminase justo tras
 * el número y por eso confundió calendarios completos con calendarios vacíos.
 * Esta función no depende de Node y se inyecta también en el navegador.
 */
export function interpretaCabeceraJornadaFcf(texto) {
  const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim();
  const jornada = limpio.match(/^JORNADA\s+(\d+)\b/i);
  if (!jornada) return null;
  return {
    numero: Number(jornada[1]),
    fecha: (limpio.match(/\b\d{4}-\d{2}-\d{2}\b/) || [])[0] ?? null,
  };
}
