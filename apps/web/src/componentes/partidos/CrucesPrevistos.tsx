import Link from 'next/link';
import type { Route } from 'next';
import type { FilaCruceDelGrupo } from '@/consultas/evolucion';
import { linea1X2DeGoles } from '@/lib/poisson';
import { diaCorto } from '@/lib/proximas';

/**
 * Lista de cruces del calendario previsto: fecha o jornada, los dos equipos y su 1-X-2 al lado.
 *
 * Sirve para la próxima jornada de una competición y para los próximos partidos de un equipo. Un cruce
 * previsto todavía no es partido y no tiene previa propia: cada equipo enlaza a su ficha.
 */
export function CrucesPrevistos({ titulo, cruces, mostrarJornada = false, nota }: {
  titulo: string;
  cruces: readonly FilaCruceDelGrupo[];
  /** En la lista de un equipo cada fila es de una jornada distinta y se dice cuál. */
  mostrarJornada?: boolean;
  nota?: string;
}) {
  if (cruces.length === 0) return null;
  const id = `cruces-${cruces[0].jornada}-${cruces[0].local_id}`;
  return (
    <section aria-labelledby={id}
      className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <header className="px-4 py-3">
        <h2 id={id} className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
        {nota && <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">{nota}</p>}
      </header>
      <ul className="m-0 list-none p-0">
        {cruces.map((c) => {
          const prediccion = linea1X2DeGoles(c.goles_esperados_local, c.goles_esperados_visitante);
          const cuando = [mostrarJornada ? `Jornada ${c.jornada}` : null, c.fecha ? diaCorto(c.fecha) : 'sin fecha']
            .filter(Boolean).join(' · ');
          return (
            <li key={`${c.jornada}-${c.orden}`} className="flex flex-col gap-0.5 border-t border-[var(--fondo-sutil)] px-4 py-2">
              <span className="text-nota tabular-nums text-[var(--texto-suave)]">{cuando}</span>
              <span className="break-words text-tabla font-semibold text-[var(--texto)]">
                <Link href={`/explorar/equipo/${c.local_id}` as Route} className="hover:text-[var(--accion)] hover:underline">{c.local}</Link>
                <span className="font-normal text-[var(--texto-suave)]"> – </span>
                <Link href={`/explorar/equipo/${c.visitante_id}` as Route} className="hover:text-[var(--accion)] hover:underline">{c.visitante}</Link>
              </span>
              {prediccion && <span className="text-nota tabular-nums text-[var(--texto-suave)]">{prediccion}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
