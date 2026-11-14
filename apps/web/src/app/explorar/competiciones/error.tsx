'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Button, EstadoError } from '@/componentes/ui';

/** Frontera de error del listado: se dice qué falla y se deja reintentar (sin textos internos). */
export default function ErrorCompeticiones({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
        <Link className="hover:underline" href={'/' as Route}>Inicio</Link>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--texto)]" aria-current="page">Competiciones</span>
      </nav>
      <h1 className="m-0 text-titulo font-bold tracking-[-0.02em] text-[var(--texto)]">Competiciones</h1>
      <EstadoError
        titulo="No se ha podido cargar el catálogo"
        descripcion="El fallo puede ser temporal. Vuelve a intentarlo; si sigue igual, prueba más tarde."
        accion={<Button onClick={reset}>Reintentar</Button>}
      />
    </div>
  );
}
