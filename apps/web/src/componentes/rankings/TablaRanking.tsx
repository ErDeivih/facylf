import Link from 'next/link';
import type { Route } from 'next';
import { Escudo } from '@/componentes/Escudo';
import type { FilaRankingJugador } from '@/consultas/rankings';
import { decimal, nombrePublicado, numero } from '@/lib/estadisticas';
import type { TipoRanking } from '@/lib/rankings';
import { etiquetaCategoria, etiquetaDivision } from '@/lib/vocabulario-pantalla';
import { TD, TD_NUM, TH, TH_NUM, TABLA } from '@/componentes/listados/controles';
import { TablaDesplazable } from '@/componentes/listados/TablaDesplazable';

/** Un número que puede no estar medido: se enseña «—», nunca 0. */
function dato(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : numero(valor);
}

/**
 * Tabla del ranking.
 *
 * Cada fila enlaza a la ficha del jugador, a la del equipo y a la competición del grupo. Los nombres
 * de menores se publican (decisión del 05/11/2026). Lo que no está medido se enseña con «—»: el
 * min/gol sólo existe cuando los minutos del jugador son fiables, y un guion lo dice.
 */
export function TablaRanking({ filas, tipo, contexto }: {
  filas: readonly FilaRankingJugador[];
  tipo: TipoRanking;
  contexto?: string;
}) {
  return (
    <TablaDesplazable etiqueta={contexto ?? 'Ranking de jugadores'}>
      <table className={`${TABLA} w-full md:min-w-[760px]`}>
        <caption className="sr-only">{contexto ?? 'Ranking de jugadores'}</caption>
        <thead>
          <tr className="border-b border-[var(--borde)]">
            <th scope="col" className={`${TH} w-10 text-right`}>#</th>
            <th scope="col" className={TH}>Jugador</th>
            <th scope="col" className={`${TH} hidden md:table-cell`}>Equipo y competición</th>
            <th scope="col" className={TH_NUM}>PJ</th>
            {tipo === 'goles' ? (
              <>
                <th scope="col" className={TH_NUM}>Goles</th>
                <th scope="col" className={`${TH_NUM} hidden md:table-cell`}>Goles/partido</th>
                <th scope="col" className={`${TH_NUM} hidden md:table-cell`}>Min/gol</th>
              </>
            ) : (
              <>
                <th scope="col" className={TH_NUM}>Amarillas</th>
                <th scope="col" className={TH_NUM}>Rojas</th>
                <th scope="col" className={`${TH_NUM} hidden md:table-cell`}>Dobles</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const competicion = `${fila.edicion} · ${fila.grupo}`;
            return (
              <tr key={`${fila.persona_id}-${fila.equipo_id}-${fila.edicion_id}`}
                className="border-b border-[var(--fondo-sutil)] last:border-b-0 hover:bg-[var(--fondo-sutil)]">
                <td className={`${TD} text-right font-bold tabular-nums text-[var(--texto-suave)]`}>{fila.posicion}</td>
                <td className={TD}>
                  <Link href={`/explorar/jugador/${fila.persona_id}` as Route}
                    className="text-tabla font-semibold md:whitespace-nowrap text-[var(--texto)] hover:underline">
                    {nombrePublicado(fila.nombre)}
                  </Link>
                  <span className="block text-nota text-[var(--texto-suave)] md:whitespace-nowrap">
                    {etiquetaCategoria(fila.categoria)}{fila.division ? ` · ${etiquetaDivision(fila.division)}` : ''}
                  </span>
                  <span className="mt-0.5 block text-nota text-[var(--texto-suave)] md:hidden">
                    {fila.equipo} · {fila.grupo}
                  </span>
                </td>
                <td className={`${TD} hidden md:table-cell`}>
                  <div className="flex items-center gap-2">
                    <Escudo equipoId={fila.equipo_id} nombre={fila.equipo} clubId={fila.club_id} tieneEscudo={fila.tiene_escudo} />
                    <div className="min-w-0">
                      <Link href={`/explorar/equipo/${fila.equipo_id}` as Route}
                        className="block whitespace-nowrap text-tabla font-medium text-[var(--texto)] hover:underline">
                        {fila.equipo}
                      </Link>
                      <Link href={`/explorar/competicion/${fila.grupo_id}` as Route} title={competicion}
                        className="block whitespace-nowrap text-nota text-[var(--texto-suave)] hover:underline">
                        {competicion}
                      </Link>
                    </div>
                  </div>
                </td>
                <td className={TD_NUM}>{numero(fila.partidos)}</td>
                {tipo === 'goles' ? (
                  <>
                    <td className={`${TD_NUM} font-bold`}>{numero(fila.goles)}</td>
                    <td className={`${TD_NUM} hidden md:table-cell`}>{decimal(fila.goles_por_partido)}</td>
                    <td className={`${TD_NUM} hidden md:table-cell`}>{dato(fila.minutos_por_gol)}</td>
                  </>
                ) : (
                  <>
                    <td className={`${TD_NUM} font-bold`}>{numero(fila.amarillas)}</td>
                    <td className={TD_NUM}>{numero(fila.rojas)}</td>
                    <td className={`${TD_NUM} hidden md:table-cell`}>{numero(fila.dobles_amarillas)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TablaDesplazable>
  );
}
