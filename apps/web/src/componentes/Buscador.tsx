'use client';
import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useRef, useState } from 'react';

interface Item {
  tipo: string; titulo: string; subtitulo: string; meta: string; url: string; territorio: string;
}
interface Respuesta { total: number; cuenta: Record<string, number>; resultados: Item[] }

const ETIQUETA: Record<string, string> = {
  club: 'Club', jugador: 'Jugador', equipo: 'Equipo', competicion: 'Competición', tecnico: 'Técnico',
};

/**
 * Caja de búsqueda con sugerencias del canónico.
 *
 * El endpoint devuelve **clubes y jugadores**; ya no competiciones ni técnicos, porque el canónico
 * todavía no los busca por nombre. Los que falten no se inventan aquí.
 */
export function Buscador({ inicial = '' }: { inicial?: string }) {
  const [q, setQ] = useState(inicial);
  const [res, setRes] = useState<Respuesta | null>(null);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) { setRes(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/buscar?q=${encodeURIComponent(texto)}`, { signal: ctrl.signal });
        if (r.ok) { setRes(await r.json()); setAbierto(true); }
      } catch { /* petición cancelada */ }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  return (
    <div className="relative w-full" ref={caja}>
      <form action="/buscar" className="flex">
        <input
          name="q" value={q} onChange={(e) => setQ(e.target.value)}
          onFocus={() => res && setAbierto(true)}
          placeholder="Buscar jugador o club…" aria-label="Buscar"
          className="w-full border border-[var(--borde-fuerte)] bg-[var(--color-pizarra)] px-3 py-2 text-sm text-[var(--texto-inverso)] placeholder:text-[var(--texto-tenue)]"
        />
        <button className="boton-primario" type="submit">Buscar</button>
      </form>
      {abierto && res && (
        <div className="absolute left-0 right-0 top-full z-[var(--capa-flotante)] mt-1 max-h-96 overflow-auto border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] text-[var(--texto)] shadow-[var(--sombra-1)]">
          {res.total === 0 && <p className="p-3 text-sm text-[var(--texto-suave)]">Sin resultados para «{q}».</p>}
          {res.resultados.map((x, i) => (
            <Link key={`${x.tipo}-${i}`} href={x.url as Route} onClick={() => setAbierto(false)}
              className="flex items-baseline justify-between gap-3 border-b border-[var(--borde)] px-3 py-2 text-sm hover:bg-[var(--fondo-elevado)]">
              <span className="min-w-0">
                <span className="mr-2 text-[var(--texto-tenue)]">{ETIQUETA[x.tipo] ?? x.tipo}</span>
                <span className="font-medium">{x.titulo}</span>
                <span className="block truncate text-[11px] text-[var(--texto-suave)]">{x.subtitulo}</span>
              </span>
              <span className="shrink-0 text-[11px] text-[var(--texto-tenue)]">{x.meta}</span>
            </Link>
          ))}
          {res.total > 0 && (
            <Link href={`/buscar?q=${encodeURIComponent(q)}` as Route} onClick={() => setAbierto(false)}
              className="block bg-[var(--texto-inverso)] px-3 py-2 text-center text-xs text-[var(--texto-suave)] hover:text-[var(--accion)]">
              Ver los {res.total} resultados →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
