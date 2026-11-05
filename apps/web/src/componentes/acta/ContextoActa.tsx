import type { EnfrentamientoPrevio, OficialDeActa } from '@/consultas/partidos';
import { etiquetaCalidad, etiquetaOficial, notaCalidad, resultadoTexto } from '@/lib/acta';

/**
 * Columna de contexto del acta: árbitro, enfrentamientos anteriores de los dos clubes y cómo está el
 * acta. Es el sitio del prototipo para «Árbitro», «Cara a cara» y la nota de estado del acta.
 *
 * Lo que no hace:
 *  · no enlaza a las actas anteriores: no consta que existan y un enlace a un 404 es peor que el texto;
 *  · no pinta la tarjeta de «Cara a cara» si no hay enfrentamientos publicados;
 *  · no traduce «A revisar» como «error»: el dato de la fuente se señala, no se corrige.
 */
export function ContextoActa({ oficiales, enfrentamientos, calidad }: {
  oficiales: readonly OficialDeActa[];
  enfrentamientos: readonly EnfrentamientoPrevio[];
  calidad: string;
}) {
  const nota = notaCalidad(calidad);
  return (
    <div className="flex flex-col gap-[18px]">
      <section aria-labelledby="arbitro"
        className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3.5">
        <h2 id="arbitro" className="m-0 text-bloque font-bold text-[var(--texto)]">Árbitro</h2>
        {oficiales.length === 0
          ? <p className="m-0 mt-2 text-tabla text-[var(--texto-suave)]">Árbitro no publicado.</p>
          : (
            <ul className="m-0 mt-2 list-none px-0">
              {oficiales.map((oficial) => (
                <li key={oficial.rol} className="flex flex-col py-0.5">
                  <span className="text-nota text-[var(--texto-suave)]">{etiquetaOficial(oficial.rol)}</span>
                  <span className="font-semibold text-[var(--texto)]">{oficial.persona}</span>
                </li>
              ))}
            </ul>
          )}
      </section>

      {enfrentamientos.length > 0 && (
        <section aria-labelledby="cara-a-cara"
          className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
          <div className="px-4 py-3.5">
            <h2 id="cara-a-cara" className="m-0 text-bloque font-bold text-[var(--texto)]">Cara a cara</h2>
            {/*
              Se dice el alcance del historial porque es a nivel de CLUB, no de un equipo concreto: dos
              equipos del mismo club (A y B) no son el mismo equipo. Las filas enseñan el nombre de cada
              equipo, así que el lector ve de qué equipo se trata en cada partido.
            */}
            <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">
              Partidos anteriores entre los dos clubes en la misma categoría.
            </p>
          </div>
          <ul className="m-0 list-none px-0">
            {enfrentamientos.map((previo) => (
              <li key={previo.match_id}
                className="flex flex-col gap-0.5 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-tabla">
                <span className="text-nota text-[var(--texto-suave)]">
                  {previo.temporada} · J{previo.jornada}
                </span>
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0 break-words text-[var(--texto)]">
                    {previo.local} - {previo.visitante}
                  </span>
                  <b className="tabular-nums whitespace-nowrap text-[var(--texto)]">
                    {resultadoTexto(previo.goles_local, previo.goles_visitante)}
                  </b>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="estado-acta"
        className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3.5">
        <h2 id="estado-acta" className="m-0 text-bloque font-bold text-[var(--texto)]">Acta</h2>
        <p className="m-0 mt-1.5 flex items-center gap-1.5 text-tabla text-[var(--texto)]">
          <span aria-hidden="true" className="inline-block size-2.5 flex-none rounded-[2px]"
            style={{ background: calidad === 'correct' ? 'var(--victoria)' : 'var(--revision)' }} />
          <span className="font-semibold">{etiquetaCalidad(calidad)}</span>
        </p>
        <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">
          {nota ?? 'Acta completa: alineaciones, cambios con minuto y tarjetas.'}
        </p>
      </section>
    </div>
  );
}
