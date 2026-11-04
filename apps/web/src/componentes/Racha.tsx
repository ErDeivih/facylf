'use client';

import type { Signo } from '@facylf/dominio';
import { insigniaForma } from '@/lib/forma-equipo';

const COLOR: Record<Signo, string> = {
  G: 'bg-[var(--victoria)]',
  E: 'bg-[var(--amarilla)]',
  P: 'bg-[var(--calor-3)]',
};

/**
 * Últimos resultados como cuadraditos de color **y letra**: la forma se enseña en V-E-D
 * (Victoria/Empate/Derrota), no con la letra del `Signo` del dato (decisión de David, 04/11/2026).
 *
 * La traducción vive en `lib/forma-equipo.ts`; aquí no hay ningún mapa G→V propio. El `title` lleva la
 * palabra, así que un daltónico o una impresión en blanco y negro leen lo mismo que el resto.
 */
export function Racha({ racha }: { racha: Signo[] }) {
  if (racha.length === 0) {
    return <p className="text-sm text-[var(--texto-suave)]">Sin resultados todavía.</p>;
  }
  return (
    <div className="flex items-center gap-1">
      <span className="mr-2 text-[11px] uppercase tracking-[0.1em] text-[var(--texto-suave)]">Racha</span>
      {racha.slice(-8).map((signo, i) => {
        const { letra, etiqueta } = insigniaForma(signo);
        return (
          <span key={i} title={etiqueta}
                className={`flex h-6 w-6 items-center justify-center rounded text-xs font-semibold text-white ${COLOR[signo]}`}>
            {letra}
          </span>
        );
      })}
    </div>
  );
}
