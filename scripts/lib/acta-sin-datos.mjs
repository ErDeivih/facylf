/**
 * Decide el destino de una ficha iSquad que existe pero todavía no contiene `game`.
 *
 * La decisión es pura para poder probar la diferencia esencial: una temporada vigente se aplaza
 * sin frenar la federación; una cerrada sólo se declara sin datos después de dos comprobaciones.
 */
export function decideActaSinDatos({ temporada, temporadaActual, intentos, ahoraMs = Date.now() }) {
  const cerrada = Number(temporada) < Number(temporadaActual);
  if (cerrada && Number(intentos) >= 2) return { cerrar: true, cerrada, dias: null, siguiente: null };
  // Dos días coincide con el repaso posterior a cada jornada. Los partidos futuros se apartan
  // antes de llegar aquí, hasta después de su fecha, para no gastar peticiones cada dos días.
  const dias = 2;
  return {
    cerrar: false,
    cerrada,
    dias,
    siguiente: new Date(Number(ahoraMs) + dias * 24 * 60 * 60_000).toISOString(),
  };
}
