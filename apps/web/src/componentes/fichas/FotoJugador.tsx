'use client';

import { useState } from 'react';

/**
 * Foto de ficha con respaldo de iniciales. La API decide si se puede servir (modo de fotos y minoría de
 * edad); si responde 404, el `onError` deja el monograma. No se pide nada si no hay id.
 */
export function FotoJugador({ personaId, nombre, permitida = false }: { personaId: number; nombre: string; permitida?: boolean }) {
  const [falla, setFalla] = useState(false);
  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  if (!permitida || !personaId || falla) {
    return (
      <span aria-hidden="true" className="flex size-8 flex-none items-center justify-center rounded-full bg-[var(--fondo-sutil)] text-etiqueta font-bold text-[var(--texto-suave)]">
        {iniciales || '·'}
      </span>
    );
  }
  return (
    <img src={`/api/foto/persona/${personaId}`} alt="" width={32} height={32} loading="lazy"
      onError={() => setFalla(true)}
      className="size-8 flex-none rounded-full bg-[var(--fondo-sutil)] object-cover" />
  );
}
