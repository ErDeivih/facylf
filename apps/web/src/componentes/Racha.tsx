'use client';

import type { Signo } from '@facylf/dominio';

const COLOR: Record<Signo, string> = {
  G: 'bg-[var(--victoria)]',
  E: 'bg-[var(--amarilla)]',
  P: 'bg-[var(--calor-3)]',
};

/** Últimos resultados (G/E/P) como cuadraditos de color. */
export function Racha({ racha }: { racha: Signo[] }) {
  if (racha.length === 0) {
    return <p className="text-sm text-[var(--texto-suave)]">Sin resultados todavía.</p>;
  }
  return (
    <div className="flex items-center gap-1">
      <span className="mr-2 text-[11px] uppercase tracking-[0.1em] text-[var(--texto-suave)]">Racha</span>
      {racha.slice(-8).map((s, i) => (
        <span key={i} title={s === 'G' ? 'Victoria' : s === 'E' ? 'Empate' : 'Derrota'}
              className={`flex h-6 w-6 items-center justify-center rounded text-xs font-semibold text-white ${COLOR[s]}`}>
          {s}
        </span>
      ))}
    </div>
  );
}
