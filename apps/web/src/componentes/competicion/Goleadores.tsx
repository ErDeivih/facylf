import type { FilaRanking } from '@/consultas/paneles';
import { nombreVisible } from '@/lib/menores';

/**
 * Goleadores del grupo, del prototipo.
 *
 * La marca de menor de edad manda: si `es_menor`, la pantalla enseña «Jugador menor de edad» y nunca
 * el nombre. Un goleador sin nombre publicado tampoco se inventa: se dice que no está publicado.
 *
 * «Ver todos» se apaga con su motivo: el ranking completo es otra pantalla que todavía no existe, y un
 * enlace a una pantalla que no existe es peor que un control apagado que dice por qué.
 */
export function Goleadores({ filas }: { filas: readonly FilaRanking[] }) {
  return (
    <section aria-labelledby="goleadores"
      className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="flex items-baseline justify-between px-4 py-3.5">
        <h2 id="goleadores" className="m-0 text-bloque font-bold text-[var(--texto)]">Goleadores</h2>
        <span aria-disabled="true" title="El ranking completo es otra pantalla, todavía sin implementar"
          className="cursor-not-allowed text-tabla font-semibold text-[var(--texto-suave)]">
          Ver todos<span className="sr-only"> (desactivado: el ranking completo todavía no tiene pantalla)</span>
        </span>
      </div>
      {filas.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Este grupo no tiene goleadores publicados: sus actas no traen autoría de los goles.
          </p>
        )
        : (
          <ul>
            {filas.map((g) => (
              <li key={`${g.persona_id}-${g.equipo_id}`}
                className="flex min-h-11 items-center gap-2.5 border-t border-[var(--fondo-sutil)] px-4 py-2.5">
                <span className="w-[18px] font-bold text-[var(--texto-suave)]">{g.posicion}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-cuerpo font-semibold text-[var(--texto)]">{nombreVisible(g.es_menor, g.nombre)}</span>
                  <span className="truncate text-nota text-[var(--texto-suave)]">{g.equipo}</span>
                </div>
                <span className="tabular-nums text-dato font-extrabold text-[var(--texto)]">{g.goles}</span>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
