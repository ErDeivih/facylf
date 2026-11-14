import Link from 'next/link';
import type { Route } from 'next';
import { Button } from '@/componentes/ui';
import { numero } from '@/lib/presentacion-canonico';
import { plural } from '@/lib/plural';
import type { EstadoSelector } from '@/lib/selector-competiciones';
import { TAMANO_PAGINA_SELECTOR, urlDeSelector } from '@/lib/selector-competiciones';

/**
 * Paginación por desplazamiento del selector.
 *
 * El total es el que cuenta la consulta en ventana (cuántos grupos cumplen los filtros, no cuántos se
 * devuelven), así que la cuenta que se lee es la verdadera. Anterior y Siguiente conservan todos los
 * filtros; el desplazamiento nunca es negativo ni inventado: lo normaliza `leeFiltrosSelector`.
 */
export function Paginacion({ estado, total }: { estado: EstadoSelector; total: number }) {
  if (total <= 0) return null;
  const desde = estado.filtros.desplazamiento + 1;
  const hasta = Math.min(estado.filtros.desplazamiento + TAMANO_PAGINA_SELECTOR, total);
  const anterior = estado.filtros.desplazamiento > 0
    ? urlDeSelector(estado.filtros, {
      desplazamiento: Math.max(0, estado.filtros.desplazamiento - TAMANO_PAGINA_SELECTOR),
    })
    : null;
  const siguiente = estado.filtros.desplazamiento + TAMANO_PAGINA_SELECTOR < total
    ? urlDeSelector(estado.filtros, {
      desplazamiento: estado.filtros.desplazamiento + TAMANO_PAGINA_SELECTOR,
    })
    : null;

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 text-nota text-[var(--texto-suave)]">
      <span>
        {numero(total)} {plural(total, 'grupo', 'grupos')} · {desde}–{hasta}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {anterior && <Button asChild variant="secondary"><Link href={anterior as Route}>← Anterior</Link></Button>}
        {siguiente && <Button asChild variant="secondary"><Link href={siguiente as Route}>Siguiente →</Link></Button>}
      </span>
    </nav>
  );
}
