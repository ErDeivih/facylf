'use client';
import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useRef, useState } from 'react';

interface Item {
  tipo: string; titulo: string; subtitulo: string; meta: string; url: string; territorio: string;
}
export interface Respuesta { total: number; cuenta: Record<string, number>; resultados: Item[] }

const ETIQUETA: Record<string, string> = {
  club: 'Club', jugador: 'Jugador', equipo: 'Equipo', competicion: 'Competición', tecnico: 'Técnico',
};

/**
 * Panel flotante de sugerencias.
 *
 * Es una pieza pura (sin red ni estado) para poder probar su presentación sin abrir el buscador: el
 * panel tiene que ser el del sistema de diseño —`--fondo-elevado`, `--sombra-1`, `--capa-flotante`,
 * radio de panel— y **ningún texto visible con `--texto-tenue`**, que da 3,93:1 y axe lo marca como
 * serio (el aviso de «identidad nominal» es texto de 12 px y va con `--texto-suave`).
 */
export function ListaSugerencias({ res, q, cerrar }: {
  res: Respuesta; q: string; cerrar: () => void;
}) {
  return (
    <div className="absolute left-0 right-0 top-full z-[var(--capa-flotante)] mt-1.5 max-h-96 overflow-auto rounded-[var(--radius-lg)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] text-[var(--texto)] shadow-[var(--sombra-1)]">
      {res.total === 0 && <p className="p-3 text-nota text-[var(--texto-suave)]">Sin resultados para «{q}».</p>}
      {res.resultados.map((x, i) => (
        <Link key={`${x.tipo}-${i}`} href={x.url as Route} onClick={cerrar}
          className="flex items-baseline justify-between gap-3 border-b border-[var(--borde)] px-3 py-2 text-tabla hover:bg-[var(--fondo-sutil)]">
          <span className="min-w-0">
            <span className="mr-2 text-etiqueta uppercase tracking-[0.06em] text-[var(--accion)]">{ETIQUETA[x.tipo] ?? x.tipo}</span>
            <span className="font-medium">{x.titulo}</span>
            <span className="block truncate text-nota text-[var(--texto-suave)]">{x.subtitulo}</span>
          </span>
          <span className="shrink-0 text-nota text-[var(--texto-suave)]">{x.meta}</span>
        </Link>
      ))}
      {res.total > 0 && (
        <Link href={`/buscar?q=${encodeURIComponent(q)}` as Route} onClick={cerrar}
          className="block border-t border-[var(--borde)] bg-[var(--fondo-sutil)] px-3 py-2.5 text-center text-nota font-semibold text-[var(--texto)] underline decoration-[var(--accion)] underline-offset-2 hover:bg-[var(--fondo-elevado)]">
          Ver los {res.total} resultados →
        </Link>
      )}
    </div>
  );
}

/**
 * Caja de búsqueda con sugerencias del canónico.
 *
 * La lógica es la del buscador anterior, sin cambiarla: mismo endpoint `/api/buscar`, dos letras
 * mínimas, 250 ms de espera, petición cancelable y cierre al pulsar fuera. Lo que cambia es la
 * presentación, que es la del sistema de diseño: caja de la superficie fuerte de la cabecera y panel
 * flotante con `--sombra-1` y `--capa-flotante`.
 *
 * El endpoint devuelve **clubes y jugadores**; ya no competiciones ni técnicos, porque el canónico
 * todavía no los busca por nombre. Por eso el placeholder promete sólo eso, y los resultados que
 * falten no se inventan aquí. La regla de los menores se aplica en la ruta
 * (`lib/sugerencias.ts`), que es donde el nombre se convierte en sugerencia.
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
      <form action="/buscar" className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--texto-fuerte-suave)]"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => res && setAbierto(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') setAbierto(false); }}
          placeholder="Buscar jugador o club…"
          aria-label="Buscar en la plataforma"
          className="h-11 w-full rounded-[var(--radius-lg)] border border-transparent bg-[var(--fondo-fuerte-suave)] pl-11 pr-3.5 text-sm text-[var(--texto-fuerte-suave)] placeholder:text-[var(--texto-fuerte-suave)]"
        />
      </form>
      {abierto && res && <ListaSugerencias res={res} q={q} cerrar={() => setAbierto(false)} />}
    </div>
  );
}
