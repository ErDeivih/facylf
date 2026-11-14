'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Button, EstadoError } from '@/componentes/ui';

/**
 * Frontera de error del panel: si la consulta se rompe, se dice y se deja reintentar; nunca
 * una página en blanco ni una tabla vacía que parezca «todo OK».
 */
export default function ErrorCalidad({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
        <Link className="hover:underline" href={'/' as Route}>Inicio</Link>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--texto)]" aria-current="page">Calidad de los grupos</span>
      </nav>
      <h1 className="m-0 text-titulo font-bold tracking-[-0.02em] text-[var(--texto)]">Calidad de los grupos</h1>
      <EstadoError
        titulo="No se ha podido leer la calidad de los grupos"
        descripcion="El fallo puede ser temporal. Vuelve a intentarlo; si sigue igual, el panel avisará mientras no haya datos."
        accion={<Button onClick={reset}>Reintentar</Button>}
      />
    </div>
  );
}
