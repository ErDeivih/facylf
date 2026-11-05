import Link from 'next/link';
import type { Route } from 'next';
import { rangoDeFechas, type JornadaResumen } from '@/lib/jornadas';

/**
 * Lista de jornadas del grupo: la pestaña «Jornadas» de la pantalla de competición.
 *
 * Cada jornada enseña su número, sus fechas publicadas y cuántos de sus partidos tienen resultado, y
 * entera es un enlace a su detalle. Es una lista, no una tabla: no hay columnas que comparar y una
 * tabla de tres columnas en móvil sólo añade desplazamiento.
 *
 * Lo que no se enseña: ni cómo se agrupan los partidos, ni de dónde salen los recuentos. Eso es
 * `§8` de la doctrina de calidad: el cálculo se hace y se calla.
 */
export function ListadoJornadas({ jornadas, hrefJornada }: {
  jornadas: readonly JornadaResumen[];
  hrefJornada: (numero: number) => string;
}) {
  return (
    <section aria-labelledby="jornadas"
      className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="px-4 py-3.5">
        <h2 id="jornadas" className="m-0 text-bloque font-bold text-[var(--texto)]">Jornadas</h2>
      </div>
      {jornadas.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Sin jornadas publicadas.
          </p>
        )
        : (
          <ul>
            {jornadas.map((jornada) => {
              const rango = rangoDeFechas(jornada.desde, jornada.hasta);
              return (
                <li key={jornada.numero}>
                  <Link
                    href={hrefJornada(jornada.numero) as Route}
                    className="flex min-h-11 items-center justify-between gap-3 border-t border-[var(--fondo-sutil)] px-4 py-2.5 hover:bg-[var(--fondo-sutil)] focus-visible:[outline-offset:-2px]"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-cuerpo font-bold text-[var(--texto)]">Jornada {jornada.numero}</span>
                      {rango !== null && <span className="text-nota text-[var(--texto-suave)]">{rango}</span>}
                    </span>
                    <span className="flex flex-none items-center gap-1.5 text-nota text-[var(--texto-suave)]">
                      {/*
                        Lo visible es «8/8» y lo que se anuncia es la frase entera: el número solo se
                        leería como una fecha o una fracción. `aria-hidden` en el número evita que un
                        lector de pantalla diga dos veces la misma cuenta.
                      */}
                      <span aria-hidden="true" className="tabular-nums">{jornada.jugados}/{jornada.partidos}</span>
                      <span className="sr-only">
                        {jornada.jugados} de {jornada.partidos} partidos jugados
                      </span>
                      <span aria-hidden="true" className="text-[var(--texto-tenue)]">›</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

/**
 * Esqueleto del listado con las mismas dimensiones que el contenido real (SISTEMA-DISENO §5): al
 * resolverse no mueve la página. La fila mide lo mismo que una jornada con fechas (44 px mínimos).
 */
export function EsqueletoJornadas({ filas = 4 }: { filas?: number }) {
  const bloque = 'rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)]';
  return (
    <div role="status" aria-live="polite"
      className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <span className="sr-only">Cargando las jornadas…</span>
      <div className="px-4 py-3.5"><div className={`h-5 w-28 ${bloque}`} /></div>
      {Array.from({ length: Math.max(1, filas) }, (_, i) => (
        <div key={i} data-esqueleto="jornada"
          className="flex min-h-11 items-center justify-between gap-3 border-t border-[var(--fondo-sutil)] px-4 py-2.5">
          <div className="flex flex-col gap-1.5">
            <div className={`h-4 w-24 ${bloque}`} />
            <div className={`h-3 w-16 ${bloque}`} />
          </div>
          <div className={`h-3 w-14 ${bloque}`} />
        </div>
      ))}
    </div>
  );
}
