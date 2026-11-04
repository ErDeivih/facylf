import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPartidoCanonico } from '@/consultas/partidos';

/**
 * Tarjeta de la jornada del prototipo: resultados de una jornada con sus flechas para moverse.
 *
 * Un partido sin marcador se enseña como «—», nunca como 0-0: son cosas distintas y confundirlas
 * convierte una jornada sin datos en una jornada con todos los partidos empatados a cero.
 */
export function Jornada({ numero, partidos, hrefAnterior, hrefSiguiente }: {
  numero: number | null;
  partidos: readonly FilaPartidoCanonico[];
  hrefAnterior: string | null;
  hrefSiguiente: string | null;
}) {
  return (
    <section aria-labelledby="jornada"
      className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="flex items-center justify-between py-2.5 pr-2.5 pl-4">
        <h2 id="jornada" className="m-0 text-base font-bold text-[var(--texto)]">
          {numero !== null ? `Jornada ${numero}` : 'Jornada'}
        </h2>
        <div className="flex gap-1">
          {hrefAnterior
            ? (
              <Link href={hrefAnterior as Route} aria-label="Jornada anterior"
                className="flex size-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--borde)] bg-[var(--fondo-elevado)] text-lg text-[var(--texto-suave)]">
                ‹
              </Link>
            )
            : (
              <span aria-hidden="true"
                className="flex size-11 cursor-not-allowed items-center justify-center rounded-[var(--radius-md)] border border-[var(--borde)] bg-[var(--fondo-elevado)] text-lg text-[var(--texto-tenue)]">‹</span>
            )}
          {hrefSiguiente
            ? (
              <Link href={hrefSiguiente as Route} aria-label="Jornada siguiente"
                className="flex size-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--borde)] bg-[var(--fondo-elevado)] text-lg text-[var(--texto-suave)]">
                ›
              </Link>
            )
            : (
              <span aria-hidden="true"
                className="flex size-11 cursor-not-allowed items-center justify-center rounded-[var(--radius-md)] border border-[var(--borde)] bg-[var(--fondo-elevado)] text-lg text-[var(--texto-tenue)]">›</span>
            )}
        </div>
      </div>
      {partidos.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-[13px] text-[var(--texto-suave)]">
            Esta jornada no tiene partidos publicados en el canónico.
          </p>
        )
        : (
          <ul>
            {partidos.map((p) => {
              const jugado = p.goles_local !== null && p.goles_visitante !== null;
              return (
                <li key={p.match_id}
                  className="grid min-h-11 grid-cols-[minmax(0,1fr)_58px_minmax(0,1fr)] items-center gap-2 border-t border-[var(--fondo-sutil)] px-3.5 py-2 text-[13px] text-[var(--texto)]">
                  <span className="truncate text-right" title={p.local}>{p.local}</span>
                  <span
                    title={jugado ? `${p.goles_local}-${p.goles_visitante}` : 'Sin resultado publicado'}
                    className={jugado
                      ? 'rounded-[var(--radius-md)] bg-[var(--color-tinta-900)] py-0.5 text-center text-xs font-semibold text-white'
                      : 'rounded-[var(--radius-md)] bg-[var(--fondo-sutil)] py-0.5 text-center text-xs font-semibold text-[var(--texto-suave)]'}>
                    {jugado ? `${p.goles_local} - ${p.goles_visitante}` : '—'}
                  </span>
                  <span className="truncate" title={p.visitante}>{p.visitante}</span>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
