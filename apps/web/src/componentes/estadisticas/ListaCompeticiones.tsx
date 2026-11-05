import Link from 'next/link';
import type { Route } from 'next';
import type { FilaGrupoSelector } from '@/consultas/catalogo-selector';
import { rutaDeEstadisticas } from '@/lib/estadisticas';
import { TARJETA } from './controles';

/**
 * Resultados de la búsqueda de competición de la página global: cada uno lleva a las estadísticas de su
 * grupo. No se enseña una competición que no esté en el catálogo.
 */
export function ListaCompeticiones({ filas, texto }: { filas: readonly FilaGrupoSelector[]; texto: string }) {
  return (
    <section aria-labelledby="competiciones" className={TARJETA}>
      <div className="px-4 py-3.5">
        <h2 id="competiciones" className="m-0 text-bloque font-bold text-[var(--texto)]">Competiciones</h2>
        <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">
          {filas.length === 0 ? 'Ninguna coincide con la búsqueda.' : `Coincidencias con «${texto}»`}
        </p>
      </div>
      {filas.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            <Link href={'/explorar/competiciones' as Route} className="font-semibold text-[var(--accion)] hover:underline">
              Buscar en todas las competiciones
            </Link>
          </p>
        )
        : (
          <ul className="m-0 list-none p-0">
            {filas.map((fila) => (
              <li key={fila.grupo_id} className="border-t border-[var(--fondo-sutil)]">
                <Link href={rutaDeEstadisticas(fila.grupo_id) as Route}
                  className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2.5 hover:bg-[var(--fondo-sutil)] focus-visible:[outline-offset:-2px]">
                  <span className="min-w-0">
                    <span className="block text-tabla font-semibold text-[var(--texto)]">{fila.edicion} · {fila.grupo}</span>
                    <span className="block text-nota text-[var(--texto-suave)]">
                      {fila.federacion_corta ?? fila.federacion_nombre} · {fila.temporada}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-[var(--texto-suave)]">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
