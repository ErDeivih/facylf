'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useMemo, useState } from 'react';

export interface EntradaFiltro {
  id: string; titulo: string; subtitulo?: string; meta?: string; href: string;
}

const normaliza = (s: string) => s.toLocaleLowerCase('es').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export function FiltroLista({ entradas, etiqueta = 'Buscar' }: { entradas: EntradaFiltro[]; etiqueta?: string }) {
  const [consulta, setConsulta] = useState('');
  const visibles = useMemo(() => {
    const q = normaliza(consulta.trim());
    return q ? entradas.filter((e) => normaliza(`${e.titulo} ${e.subtitulo ?? ''}`).includes(q)) : entradas;
  }, [consulta, entradas]);
  return (
    <div>
      <div className="border-b border-[var(--borde)] p-3">
        <label className="sr-only" htmlFor="filtro-lista">{etiqueta}</label>
        <input id="filtro-lista" value={consulta} onChange={(e) => setConsulta(e.target.value)}
          placeholder={`${etiqueta}…`}
          className="w-full rounded border border-[var(--borde)] bg-[var(--fondo-elevado)] px-3 py-2 text-sm outline-none focus:border-club" />
        <p className="mt-2 text-xs text-[var(--texto-suave)]">{visibles.length} resultados</p>
      </div>
      <ul>
        {visibles.map((e) => (
          <li key={e.id}>
            <Link href={e.href as Route} className="flex gap-3 border-t border-[var(--borde)] px-4 py-3 hover:bg-[var(--fondo-elevado)] first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.titulo}</p>
                {e.subtitulo && <p className="mt-0.5 truncate text-xs text-[var(--texto-suave)]">{e.subtitulo}</p>}
              </div>
              {e.meta && <span className="shrink-0 text-right font-display text-xs text-[var(--texto-suave)]">{e.meta}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
