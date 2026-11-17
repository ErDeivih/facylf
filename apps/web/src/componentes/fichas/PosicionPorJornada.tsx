import type { FilaPosicionPorJornada } from '@/consultas/evolucion';

/**
 * Posición por jornada de uno o dos equipos, en una gráfica de líneas sin JavaScript.
 *
 * El puesto 1 queda arriba. Con dos equipos, el segundo va en trazo discontinuo además de en otro tono:
 * la diferencia no depende sólo del color. Debajo va la misma información en tabla, plegada, para quien
 * no ve la gráfica o quiere el número exacto.
 */
export type SerieDePosicion = { nombre: string; filas: readonly FilaPosicionPorJornada[] };

const ANCHO = 320;
const ALTO = 104;
const MARGEN = { izquierda: 26, derecha: 30, arriba: 10, abajo: 20 };

export function PosicionPorJornada({ series, titulo = 'Posición por jornada' }: {
  series: readonly SerieDePosicion[];
  titulo?: string;
}) {
  const conDatos = series.filter((s) => s.filas.length > 0);
  if (conDatos.length === 0) return null;

  const equipos = Math.max(2, ...conDatos.flatMap((s) => s.filas.map((f) => f.equipos)));
  const jornadas = conDatos.flatMap((s) => s.filas.map((f) => f.jornada));
  const primera = Math.min(...jornadas);
  const ultima = Math.max(...jornadas);
  const x = (jornada: number) => MARGEN.izquierda
    + (ultima === primera ? 0.5 : (jornada - primera) / (ultima - primera)) * (ANCHO - MARGEN.izquierda - MARGEN.derecha);
  const y = (posicion: number) => MARGEN.arriba
    + ((posicion - 1) / (equipos - 1)) * (ALTO - MARGEN.arriba - MARGEN.abajo);
  const idTitulo = `posicion-${conDatos.map((s) => s.filas[0]?.jornada).join('-')}-${conDatos.length}`;

  return (
    <section aria-labelledby={idTitulo}
      className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-4">
      <h2 id={idTitulo} className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
      {conDatos.length > 1 && (
        <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-nota text-[var(--texto-suave)]">
          {conDatos.map((s, i) => (
            <li key={s.nombre} className="flex items-center gap-1.5">
              <svg width="20" height="8" aria-hidden="true" className={i === 0 ? 'text-[var(--accion)]' : 'text-[var(--texto)]'}>
                <line x1="0" y1="4" x2="20" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={i === 0 ? undefined : '4 3'} />
              </svg>
              {s.nombre}
            </li>
          ))}
        </ul>
      )}
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" className="mt-2 block h-auto w-full"
        aria-label={conDatos.map((s) => {
          const fin = s.filas[s.filas.length - 1];
          return `${s.nombre}: ${fin.posicion}.º con ${fin.puntos} puntos tras la jornada ${fin.jornada}`;
        }).join('. ')}>
        {[1, equipos].map((p) => (
          <g key={p} className="text-[var(--borde)]">
            <line x1={MARGEN.izquierda} x2={ANCHO - MARGEN.derecha} y1={y(p)} y2={y(p)} stroke="currentColor" strokeWidth="1" />
            <text x={MARGEN.izquierda - 4} y={y(p) + 3} textAnchor="end" fontSize="10" className="fill-[var(--texto-suave)]">{p}.º</text>
          </g>
        ))}
        <text x={x(primera)} y={ALTO - 4} textAnchor="start" fontSize="10" className="fill-[var(--texto-suave)]">J{primera}</text>
        {ultima !== primera && (
          <text x={x(ultima)} y={ALTO - 4} textAnchor="end" fontSize="10" className="fill-[var(--texto-suave)]">J{ultima}</text>
        )}
        {conDatos.map((s, i) => (
          <g key={s.nombre} className={i === 0 ? 'text-[var(--accion)]' : 'text-[var(--texto)]'}>
            <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={i === 0 ? undefined : '4 3'}
              points={s.filas.map((f) => `${x(f.jornada).toFixed(1)},${y(f.posicion).toFixed(1)}`).join(' ')} />
            {s.filas.map((f) => (
              <circle key={f.jornada} cx={x(f.jornada)} cy={y(f.posicion)} r="1.8" fill="currentColor" />
            ))}
            {(() => {
              const fin = s.filas[s.filas.length - 1];
              // Con dos equipos en el mismo puesto final, la segunda etiqueta baja para no pisar a la primera.
              const otro = conDatos[1 - i]?.filas.at(-1);
              const choca = i === 1 && otro !== undefined && Math.abs(y(otro.posicion) - y(fin.posicion)) < 11;
              return (
                <>
                  <circle cx={x(fin.jornada)} cy={y(fin.posicion)} r="3.2" fill="currentColor" />
                  <text x={x(fin.jornada) + 6} y={y(fin.posicion) + 3.5 + (choca ? 11 : 0)} fontSize="10" fontWeight="700" fill="currentColor">
                    {fin.posicion}.º
                  </text>
                </>
              );
            })()}
          </g>
        ))}
      </svg>
      <details className="mt-1">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-nota font-semibold text-[var(--accion)]">
          Ver como tabla
        </summary>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${titulo}, en tabla`}>
          <table className="w-full border-collapse text-nota tabular-nums">
            <thead>
              <tr className="text-left text-[var(--texto-suave)]">
                <th scope="col" className="py-1 pr-3 font-semibold">Jornada</th>
                {conDatos.map((s) => (
                  <th key={s.nombre} scope="col" className="py-1 pr-3 text-right font-semibold">{s.nombre}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...new Set(jornadas)].sort((a, b) => a - b).map((j) => (
                <tr key={j} className="border-t border-[var(--fondo-sutil)]">
                  <th scope="row" className="py-1 pr-3 text-left font-normal text-[var(--texto-suave)]">{j}</th>
                  {conDatos.map((s) => {
                    const f = s.filas.find((fila) => fila.jornada === j);
                    return (
                      <td key={s.nombre} className="py-1 pr-3 text-right text-[var(--texto)]">
                        {f ? `${f.posicion}.º · ${f.puntos} pts` : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
