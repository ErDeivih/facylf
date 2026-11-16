import { formateaPorcentaje, lineaDePrediccion, type PrediccionDePartido } from '@/lib/prediccion';
import { Barra1X2 } from './Barra1X2';

/**
 * Predicción del partido en su ficha: 1-X-2, marcador más probable y una línea de explicación.
 *
 * Es un dato derivado y así se etiqueta. Un partido sin predicción no enseña un reparto inventado:
 * dice que no hay datos suficientes. Un partido ya jugado lleva «expectativa previa» y, si el desenlace
 * real coincide con una celda, se marca «Pasó»; no se juzga como acierto ni fallo.
 *
 * El favorito (si saca más de 5 puntos al segundo) se destaca con borde y cuerpo mayor, no sólo con color.
 */
export function PrediccionPartido({ local, visitante, prediccion, jugado, resultado = null }: {
  local: string;
  visitante: string;
  prediccion: PrediccionDePartido | null;
  jugado: boolean;
  /** Desenlace real cuando el partido ya se jugó: local, empate o visitante. */
  resultado?: 'local' | 'empate' | 'visitante' | null;
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
    { clave: 'local' as const, etiqueta: '1', nombre: local, valor: prediccion.prob_local },
    { clave: 'empate' as const, etiqueta: 'X', nombre: 'Empate', valor: prediccion.prob_empate },
    { clave: 'visitante' as const, etiqueta: '2', nombre: visitante, valor: prediccion.prob_visitante },
  ];
  const ordenados = [...porcentajes].sort((a, b) => b.valor - a.valor);
  const favorito = ordenados[0].valor - ordenados[1].valor > 5 ? ordenados[0].clave : null;

  return (
    <section aria-labelledby="prediccion"
      className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="prediccion" className="m-0 text-bloque font-bold text-[var(--texto)]">Predicción</h2>
        <p className="m-0 text-etiqueta text-[var(--texto-suave)]">
          {jugado ? 'Expectativa previa al partido' : 'Expectativa antes de jugar'}
        </p>
      </div>
      <div className="mt-2">
        <Barra1X2 local={prediccion.prob_local} empate={prediccion.prob_empate} visitante={prediccion.prob_visitante} />
      </div>
      <dl className="m-0 mt-2 grid grid-cols-3 gap-2">
        {porcentajes.map((p) => (
          <div key={p.etiqueta}
            className={`rounded-[var(--radius-md)] px-2 py-1.5 text-center ${favorito === p.clave
              ? 'border border-[var(--texto)] bg-[var(--fondo-sutil)]'
              : 'bg-[var(--fondo-sutil)]'}`}>
            <dt className="text-etiqueta leading-tight text-[var(--texto-suave)]">
              <span className="font-bold text-[var(--texto)]">{p.etiqueta}</span>
              <span className="ml-1 break-words">{p.nombre}</span>
            </dt>
            <dd className={`m-0 font-bold tabular-nums text-[var(--texto)] ${favorito === p.clave ? 'text-bloque' : 'text-cuerpo'}`}>
              {formateaPorcentaje(p.valor)}
            </dd>
            {prediccion.banda && (
              <span className="block text-[10px] leading-tight tabular-nums text-[var(--texto-suave)]">
                {Math.round(prediccion.banda[p.clave][0])}–{Math.round(prediccion.banda[p.clave][1])} %
              </span>
            )}
            {resultado === p.clave && (
              <span className="text-etiqueta font-semibold text-[var(--texto-suave)]">Pasó</span>
            )}
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
