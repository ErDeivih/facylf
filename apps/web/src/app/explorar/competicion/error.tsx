'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Button, EstadoError } from '@/componentes/ui';

/**
 * Frontera de error de la ficha de competición. No hay `loading.tsx` de ruta a propósito: un límite
 * por encima de la validación del id convertiría un 404 en un 200 con cuerpo de 404 (SISTEMA-DISENO §5).
 */
export default function ErrorCompeticion({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
        <Link className="hover:underline" href={'/' as Route}>Inicio</Link>
        <span aria-hidden="true">›</span>
        <Link className="hover:underline" href={'/explorar/competiciones' as Route}>Competiciones</Link>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--texto)]" aria-current="page">Ficha de competición</span>
      </nav>
      <EstadoError
        titulo="No se ha podido cargar la competición"
        descripcion="El fallo puede ser temporal. Vuelve a intentarlo; si sigue igual, el enlace de la competición puede haber cambiado."
        accion={<Button onClick={reset}>Reintentar</Button>}
      />
    </div>
  );
}
