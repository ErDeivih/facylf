import Link from 'next/link';
import type { Route } from 'next';
import type { EstadoSelector, OpcionesSelector } from '@/lib/selector-competiciones';
import {
  RUTA_SELECTOR, temporadasSugeridas, tieneFiltrosSelector, urlDeSelector,
} from '@/lib/selector-competiciones';
import { CHIP, TARJETA } from './controles';

/**
 * Estado vacío del selector.
 *
 * Dice la verdad en una frase («no hay grupos con esos filtros»), deja quitar los filtros y ofrece
 * **temporadas con datos** cercanas a la pedida, que es la parte recuperable: si la competición no está
 * en ese año, el usuario ve en qué años hay catálogo. No hay explicaciones internas ni nombres de
 * tablas: lo que se enseña es lo que se puede hacer.
 */
export function SinGrupos({ estado, opciones }: {
  estado: EstadoSelector;
  opciones: OpcionesSelector;
}) {
  const hayFiltros = tieneFiltrosSelector(estado.filtros);
  const sugeridas = temporadasSugeridas(estado.filtros, opciones.temporadas.map((t) => t.valor), 4);
  // Si la temporada se dedujo del texto, al proponer otra se quita el año del texto: si no, el año
  // seguiría mandando y la propuesta no serviría de nada.
  const textoBase = estado.interpretacion.temporada
    ? (estado.interpretacion.textoSinTemporada || null)
    : estado.filtros.texto;

  if (!hayFiltros) {
    return (
      <div className={`${TARJETA} px-4 py-5`}>
        <p className="m-0 text-cuerpo text-[var(--texto-suave)]">
          Todavía no hay competiciones con grupos importados.
        </p>
      </div>
    );
  }

  return (
    <div className={`${TARJETA} px-4 py-5`}>
      <p className="m-0 text-cuerpo text-[var(--texto)]">No hay grupos con esos filtros.</p>
      <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">
        <Link href={RUTA_SELECTOR as Route} className="font-semibold text-[var(--accion)] hover:underline">
          Quitar los filtros
        </Link>
      </p>
      {sugeridas.length > 0 && (
        <div className="mt-4">
          <p className="m-0 text-etiqueta uppercase tracking-[0.05em] text-[var(--texto-suave)]">
            Temporadas con datos
          </p>
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">
            {sugeridas.map((temporada) => (
              <li key={temporada}>
                <Link href={urlDeSelector({
                  ...estado.filtros,
                  temporada,
                  texto: textoBase,
                  desplazamiento: 0,
                }) as Route} className={CHIP}>
                  {temporada}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Cuando se pide una página más allá del final no se pinta «no hay grupos»: sí los hay, lo que no hay
 * es esa página. Se dice y se ofrece volver al principio.
 */
export function SinMasGrupos({ estado }: { estado: EstadoSelector }) {
  return (
    <div className={`${TARJETA} px-4 py-5`}>
      <p className="m-0 text-cuerpo text-[var(--texto)]">No hay más grupos en esta búsqueda.</p>
      <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">
        <Link href={urlDeSelector(estado.filtros, { desplazamiento: 0 }) as Route}
          className="font-semibold text-[var(--accion)] hover:underline">
          Volver al principio
        </Link>
      </p>
    </div>
  );
}

/**
 * Esqueleto de la lista con las mismas dimensiones que una fila real (SISTEMA-DISENO §5): no hay
 * spinner que desplace la página al llegar los resultados.
 */
export function EsqueletoLista({ filas = 6 }: { filas?: number }) {
  const bloque = 'rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)]';
  return (
    <div role="status" aria-live="polite" className={TARJETA}>
      <span className="sr-only">Cargando competiciones…</span>
      {Array.from({ length: Math.max(1, filas) }, (_, i) => (
        <div key={i} data-esqueleto="grupo"
          className="flex min-h-[76px] flex-col justify-center gap-2 border-t border-[var(--fondo-sutil)] px-4 py-3 first:border-t-0">
          <div className={`h-4 w-40 ${bloque}`} />
          <div className={`h-4 w-2/3 ${bloque}`} />
          <div className={`h-3 w-1/2 ${bloque}`} />
        </div>
      ))}
    </div>
  );
}
