import Link from 'next/link';
import type { Route } from 'next';
import { rangoDeFechas } from '@/lib/jornadas';
import type { JornadaDelCalendario, PartidoEnCalendario } from '@/lib/calendario';
import { PartidoDeCalendario } from './PartidoDeCalendario';
import { TARJETA } from './controles';

/**
 * Calendario de un grupo: todas sus jornadas, de la primera a la última, con los partidos de cada una.
 *
 * Cada jornada lleva sus fechas publicadas y cuántos de sus partidos tienen resultado. El enlace «Ver
 * jornada» lleva al detalle que ya existe; no se enlaza a una jornada que no está publicada porque la
 * lista sólo pinta las que tienen partidos.
 */
export function CalendarioDeGrupo({ jornadas, hrefJornada, hrefActa }: {
  jornadas: readonly JornadaDelCalendario[];
  hrefJornada?: ((numero: number) => string) | null;
  hrefActa?: (partido: PartidoEnCalendario) => string | null;
}) {
  return (
    <>
      {jornadas.map((jornada) => {
        const rango = rangoDeFechas(jornada.desde, jornada.hasta);
        const id = `jornada-${jornada.numero}`;
        return (
          <section key={jornada.numero} aria-labelledby={id} className={TARJETA}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
              <h3 id={id} className="m-0 text-bloque font-bold text-[var(--texto)]">
                Jornada {jornada.numero}
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-nota text-[var(--texto-suave)]">
                {rango !== null && <span>{rango}</span>}
                <span>
                  <span aria-hidden="true" className="tabular-nums">{jornada.jugados}/{jornada.total}</span>
                  <span className="sr-only">{jornada.jugados} de {jornada.total} partidos jugados</span>
                </span>
                {hrefJornada && (
                  <Link href={hrefJornada(jornada.numero) as Route}
                    className="inline-flex min-h-11 items-center font-semibold text-[var(--accion)] hover:underline">
                    Ver jornada
                  </Link>
                )}
              </div>
            </div>
            <ul>
              {jornada.partidos.map((partido) => (
                <PartidoDeCalendario
                  key={partido.partido_id}
                  partido={partido}
                  hrefActa={hrefActa?.(partido) ?? null}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
