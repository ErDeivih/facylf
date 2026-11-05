import type { FilaRanking } from '@/consultas/paneles';
import { nombreVisible } from '@/lib/menores';

/**
 * Goleadores del grupo, del prototipo.
 *
 * El nombre se publica tal como lo da la federación, también el de un menor: hay consentimiento de
 * tratamiento (decisión de David, 05/11/2026) y `nombreVisible()` es el único sitio donde se aplica la
 * regla. Las fotos de personas no se publican. Un goleador sin nombre en la fuente no se inventa: se
 * dice que no está publicado.
 *
 * «Ver todos» se apaga: el ranking completo es otra pantalla que todavía no existe y un enlace muerto
 * sería peor que un control apagado.
 */
export function Goleadores({ filas }: { filas: readonly FilaRanking[] }) {
  return (
    <section aria-labelledby="goleadores"
      className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="flex items-baseline justify-between px-4 py-3.5">
        <h2 id="goleadores" className="m-0 text-bloque font-bold text-[var(--texto)]">Goleadores</h2>
        <span aria-disabled="true" className="cursor-not-allowed text-tabla font-semibold text-[var(--texto-suave)]">
          Ver todos
        </span>
      </div>
      {filas.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Sin goleadores publicados.
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
