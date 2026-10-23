/**
 * ── ACTAS DE iSquad (MADRID Y VALENCIA) LEÍDAS CON EL ACTA AÚN ABIERTA (22/10/2026) ───────────────────────────
 *
 * La ficha trae `acta_cerrada` y `partido_en_juego`. Se pedía en cuanto llegaba el día del partido y se daba por
 * hecha aunque el acta estuviera ABIERTA: medido en Madrid 2026-27, 64 actas guardadas así (53 con el partido EN
 * JUEGO; la 5572982 se leyó a las 19:55 de un partido de las 18:45), 47 de ellas sin alineaciones. No se volvían
 * a pedir nunca. Igual que en Cataluña (`decideActaSinJugar`): con el acta abierta no se da por hecha y se vuelve
 * a mirar; sólo en la temporada en curso y sólo durante tres semanas desde el partido (un acta que el árbitro
 * nunca cierra no se pide para siempre).
 *
 * @param {{ actaCerrada?: string|null, enJuego?: string|null, suspendido?: string|null, temporada: string|number,
 *           temporadaActual: number, fechaPartido?: string|null, hoy: string }} f  fechas «AAAA-MM-DD».
 * @returns {null | { dias: number, motivo: string }}
 */
export function decideActaAbierta({ actaCerrada = null, enJuego = null, suspendido = null, temporada, temporadaActual, fechaPartido = null, hoy }) {
  if (String(actaCerrada ?? '').trim() !== '0') return null;
  if (String(suspendido ?? '').trim() === '1') return null;
  if (!Number.isFinite(Number(temporadaActual)) || Number(temporada) < Number(temporadaActual)) return null;
  if (fechaPartido && /^\d{4}-\d{2}-\d{2}$/.test(fechaPartido)) {
    const limite = new Date(Date.parse(`${hoy}T12:00:00Z`) - 21 * 24 * 60 * 60_000).toISOString().slice(0, 10);
    if (fechaPartido < limite) return null;
  }
  const jugando = String(enJuego ?? '').trim() === '1';
  // En juego: se vuelve en unas horas (el acta suele cerrarse esa misma noche); abierta sin jugarse: al día siguiente.
  return jugando
    ? { dias: 0.25, motivo: 'el partido está en juego y el acta aún no está cerrada' }
    : { dias: 1, motivo: 'el acta aún no está cerrada' };
}
