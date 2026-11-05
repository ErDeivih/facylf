import Link from 'next/link';
import type { Route } from 'next';
import { numero } from '@/lib/estadisticas';
import { BOTON_SECUNDARIO } from '@/componentes/listados/controles';

/**
 * Paginación del ranking por desplazamiento.
 *
 * El total es el de la consulta (cuántos jugadores cumplen los filtros, no cuántos se pintan), así que
 * la cuenta es la verdadera. Los enlaces conservan todos los filtros.
 */
export function PaginacionRanking({ total, desplazamiento, tamano, anterior, siguiente }: {
  total: number;
  desplazamiento: number;
  tamano: number;
  anterior: string | null;
  siguiente: string | null;
}) {
  if (total <= 0) return null;
  const desde = desplazamiento + 1;
  const hasta = Math.min(desplazamiento + tamano, total);
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 text-nota text-[var(--texto-suave)]">
      <span>
        {numero(total)} {total === 1 ? 'jugador' : 'jugadores'} · {desde}–{hasta}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {anterior && <Link href={anterior as Route} className={BOTON_SECUNDARIO}>← Anterior</Link>}
        {siguiente && <Link href={siguiente as Route} className={BOTON_SECUNDARIO}>Siguiente →</Link>}
      </span>
    </nav>
  );
}
