import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPartidoCanonico } from '@/consultas/partidos';
import { marcadorDePartido } from '@/lib/pantalla-competicion';

/**
 * Tarjeta de la jornada del prototipo: resultados de una jornada con sus flechas para moverse.
 *
 * Un partido sin marcador se enseña como «—», nunca como 0-0: son cosas distintas y confundirlas
 * convierte una jornada sin datos en una jornada con todos los partidos empatados a cero. Si la
 * federación publicó la hora, se enseña la hora; si no, el guion con su texto accesible.
 */
export function Jornada({ numero, partidos, hrefAnterior, hrefSiguiente }: {
  numero: number | null;
  partidos: readonly FilaPartidoCanonico[];
  hrefAnterior: string | null;
  hrefSiguiente: string | null;
}) {
  const flecha = 'flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--borde)] bg-[var(--fondo-elevado)] text-lg';
  return (
    <section aria-labelledby="jornada"
      className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="flex items-center justify-between py-2.5 pr-2.5 pl-4">
        <h2 id="jornada" className="m-0 text-bloque font-bold text-[var(--texto)]">
          {numero !== null ? `Jornada ${numero}` : 'Jornada'}
        </h2>
        <div className="flex gap-1">
          {hrefAnterior
            ? (
              <Link href={hrefAnterior as Route} aria-label="Jornada anterior"
                className={`${flecha} text-[var(--texto-suave)]`}>
                ‹
              </Link>
            )
            : (
              <span aria-disabled="true" className={`${flecha} cursor-not-allowed border-dashed text-[var(--texto-suave)]`}>‹</span>
            )}
          {hrefSiguiente
            ? (
              <Link href={hrefSiguiente as Route} aria-label="Jornada siguiente"
                className={`${flecha} text-[var(--texto-suave)]`}>
                ›
              </Link>
            )
            : (
              <span aria-disabled="true" className={`${flecha} cursor-not-allowed border-dashed text-[var(--texto-suave)]`}>›</span>
            )}
        </div>
      </div>
      {partidos.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Sin partidos publicados.
          </p>
        )
        : (
          <ul>
            {partidos.map((p) => {
              const marcador = marcadorDePartido(p);
              const ganaLocal = marcador.jugado && (p.goles_local ?? 0) > (p.goles_visitante ?? 0);
              const ganaVisitante = marcador.jugado && (p.goles_visitante ?? 0) > (p.goles_local ?? 0);
              return (
                <li key={p.match_id}
                  className="grid min-h-11 grid-cols-[minmax(0,1fr)_58px_minmax(0,1fr)] items-center gap-2 border-t border-[var(--fondo-sutil)] px-3.5 py-2 text-tabla text-[var(--texto)]">
                  <Link href={`/explorar/equipo/${p.local_id}`} className={`truncate text-right hover:underline ${ganaLocal ? 'font-bold' : 'font-medium'}`} title={p.local}>{p.local}</Link>
                  <span
                    title={marcador.accesible}
                    className={marcador.jugado
                      ? 'tabular-nums rounded-[var(--radius-md)] bg-[var(--fondo-fuerte)] py-1 text-center font-bold text-[var(--texto-fuerte)]'
                      : 'tabular-nums rounded-[var(--radius-md)] bg-[var(--fondo-sutil)] py-1 text-center font-semibold text-[var(--texto-suave)]'}>
                    {marcador.texto}
                    <span className="sr-only">, {marcador.accesible}</span>
                  </span>
                  <Link href={`/explorar/equipo/${p.visitante_id}`} className={`truncate hover:underline ${ganaVisitante ? 'font-bold' : 'font-medium'}`} title={p.visitante}>{p.visitante}</Link>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
