import { formateaPorcentaje, lineaDePrediccion, type PrediccionDePartido } from '@/lib/prediccion';

/**
 * Predicción del partido en su ficha: 1-X-2, marcador más probable y una línea de explicación.
 *
 * Es un dato derivado y así se etiqueta. Un partido sin predicción no enseña un reparto inventado:
 * dice que no hay datos suficientes. Un partido ya jugado lleva «expectativa previa», porque la
 * predicción se calculó antes y no es una explicación del resultado.
 */
export function PrediccionPartido({ local, visitante, prediccion, jugado }: {
  local: string;
  visitante: string;
  prediccion: PrediccionDePartido | null;
  jugado: boolean;
}) {
  if (prediccion === null) {
    return (
      <section aria-labelledby="prediccion"
        className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3.5">
        <h2 id="prediccion" className="m-0 text-bloque font-bold text-[var(--texto)]">Predicción</h2>
        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
          Sin datos suficientes para este partido: su liga aún no tiene marcadores con los que estimar.
        </p>
      </section>
    );
  }

  const porcentajes = [
    { etiqueta: '1', nombre: 'Gana el local', valor: prediccion.prob_local },
    { etiqueta: 'X', nombre: 'Empate', valor: prediccion.prob_empate },
    { etiqueta: '2', nombre: 'Gana el visitante', valor: prediccion.prob_visitante },
  ];
  return (
    <section aria-labelledby="prediccion"
      className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="prediccion" className="m-0 text-bloque font-bold text-[var(--texto)]">Predicción</h2>
        <p className="m-0 text-etiqueta text-[var(--texto-suave)]">
          {jugado ? 'Expectativa previa al partido' : 'Expectativa antes de jugar'}
        </p>
      </div>
      <dl className="m-0 mt-2 grid grid-cols-3 gap-2">
        {porcentajes.map((p) => (
          <div key={p.etiqueta} className="rounded-[var(--radius-md)] bg-[var(--fondo-sutil)] px-2 py-1.5 text-center">
            <dt className="text-etiqueta text-[var(--texto-suave)]">
              <span className="font-bold text-[var(--texto)]">{p.etiqueta}</span>
              <span className="sr-only">: {p.nombre}</span>
            </dt>
            <dd className="m-0 text-bloque font-bold tabular-nums text-[var(--texto)]">
              {formateaPorcentaje(p.valor)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="m-0 mt-2 text-tabla text-[var(--texto)]">
        Marcador más probable: <strong className="tabular-nums">{prediccion.marcador_probable}</strong>
        <span className="text-[var(--texto-suave)]"> ({formateaPorcentaje(prediccion.prob_marcador)})</span>
      </p>
      <p className="m-0 mt-1 text-etiqueta leading-snug text-[var(--texto-suave)]">
        {lineaDePrediccion({
          local, visitante,
          media_total: prediccion.media_total,
          ventaja_casa: prediccion.ventaja_casa,
          partidos_liga: prediccion.partidos_liga,
        })}
      </p>
    </section>
  );
}
