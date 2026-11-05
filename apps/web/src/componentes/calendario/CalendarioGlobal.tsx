import Link from 'next/link';
import type { Route } from 'next';
import { agrupaPorFecha, etiquetaDeFecha, type PartidoEnCalendario } from '@/lib/calendario';
import { PartidoDeCalendario } from './PartidoDeCalendario';
import { ENLACE, ENLACE_APAGADO, TARJETA } from './controles';

/**
 * Calendario global: partidos agrupados por fecha, con la competición y la jornada de cada uno.
 *
 * Es una lista, no una tabla: cada partido lleva su contexto en una línea y en móvil no hay columnas
 * que desplazar. La paginación es por número de partidos y **no promete un total**: se muestran los que
 * caben y, si hay más, se puede seguir. Contar todos los partidos que cumplen un filtro amplio costaría
 * más que enseñar la página, y un total inventado no se enseña.
 */
export function CalendarioGlobal({ partidos, desde, hasta, urlAnterior, urlSiguiente, hayMas, hrefCompeticion, hrefJornada, hrefActa }: {
  partidos: readonly PartidoEnCalendario[];
  /** Posición del primer y último partido de la página (1-based). */
  desde: number;
  hasta: number;
  urlAnterior: string | null;
  urlSiguiente: string | null;
  hayMas: boolean;
  hrefCompeticion?: (partido: PartidoEnCalendario) => string | null;
  hrefJornada?: (partido: PartidoEnCalendario) => string | null;
  hrefActa?: (partido: PartidoEnCalendario) => string | null;
}) {
  const grupos = agrupaPorFecha(partidos);
  return (
    <>
      {grupos.map((grupo) => {
        const etiqueta = etiquetaDeFecha(grupo.fecha);
        const id = `dia-${grupo.fecha ?? 'sin-fecha'}`;
        return (
          <section key={id} aria-labelledby={id} className={TARJETA}>
            <div className="px-4 py-3">
              <h2 id={id} className="m-0 text-bloque font-bold text-[var(--texto)]">
                {etiqueta ?? 'Sin fecha publicada'}
              </h2>
            </div>
            <ul>
              {grupo.partidos.map((partido) => (
                <PartidoDeCalendario
                  key={partido.partido_id}
                  partido={partido}
                  contexto
                  hrefCompeticion={hrefCompeticion?.(partido) ?? null}
                  hrefJornada={hrefJornada?.(partido) ?? null}
                  hrefActa={hrefActa?.(partido) ?? null}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {(urlAnterior !== null || urlSiguiente !== null || hayMas) && (
        <nav aria-label="Paginación del calendario" className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {urlAnterior
              ? <Link href={urlAnterior as Route} className={ENLACE}>Anterior</Link>
              : <span aria-disabled="true" className={ENLACE_APAGADO}>Anterior</span>}
          </div>
          <p className="m-0 text-nota text-[var(--texto-suave)]">
            <span className="tabular-nums">{desde}–{hasta}</span>
            {hayMas ? ' · hay más partidos' : ''}
          </p>
          <div>
            {urlSiguiente
              ? <Link href={urlSiguiente as Route} className={ENLACE}>Siguiente</Link>
              : <span aria-disabled="true" className={ENLACE_APAGADO}>Siguiente</span>}
          </div>
        </nav>
      )}
    </>
  );
}
