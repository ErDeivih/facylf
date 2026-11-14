import Link from 'next/link';
import type { Route } from 'next';
import type { EstadoSelector, OpcionesSelector } from '@/lib/selector-competiciones';
import {
  RUTA_SELECTOR, temporadasSugeridas, tieneFiltrosSelector, urlDeSelector,
} from '@/lib/selector-competiciones';
import { Button, EstadoCargando, EstadoVacio, SkeletonFilas } from '@/componentes/ui';

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
    return <EstadoVacio titulo="Todavía no hay competiciones con grupos importados" />;
  }

  return (
    <EstadoVacio
      titulo="No hay grupos con esos filtros"
      descripcion={<Link href={RUTA_SELECTOR as Route} className="font-semibold text-[var(--accion)] hover:underline">Quitar los filtros</Link>}
      accion={sugeridas.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-nota font-semibold text-[var(--texto-suave)]">Temporadas con datos</span>
          <span className="flex flex-wrap gap-1.5">
            {sugeridas.map((temporada) => (
              <Button key={temporada} asChild variant="secondary" size="sm">
                <Link href={urlDeSelector({
                  ...estado.filtros,
                  temporada,
                  texto: textoBase,
                  desplazamiento: 0,
                }) as Route}>
                  {temporada}
                </Link>
              </Button>
            ))}
          </span>
        </div>
      ) : undefined}
    />
  );
}

/**
 * Cuando se pide una página más allá del final no se pinta «no hay grupos»: sí los hay, lo que no hay
 * es esa página. Se dice y se ofrece volver al principio.
 */
export function SinMasGrupos({ estado }: { estado: EstadoSelector }) {
  return (
    <EstadoVacio
      titulo="No hay más grupos en esta búsqueda"
      accion={<Button asChild variant="secondary"><Link href={urlDeSelector(estado.filtros, { desplazamiento: 0 }) as Route}>Volver al principio</Link></Button>}
    />
  );
}

/**
 * Esqueleto de la lista con las mismas dimensiones que una fila real (SISTEMA-DISENO §5): no hay
 * spinner que desplace la página al llegar los resultados.
 */
export function EsqueletoLista({ filas = 6 }: { filas?: number }) {
  return (
    <EstadoCargando etiqueta="Cargando competiciones…">
      <div data-esqueleto="lista" className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
        <SkeletonFilas filas={filas} columnas={2} />
      </div>
    </EstadoCargando>
  );
}
