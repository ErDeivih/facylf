'use client';

import { useRouter } from 'next/navigation';
import type { Route } from 'next';

/**
 * Desplegable de la cabecera de competición (grupo y temporada) que navega al cambiar.
 *
 * Es el único trozo de la pantalla que necesita JavaScript en el cliente: el resto es servidor. Las
 * opciones vienen ya resueltas desde la base con su URL; aquí no se construye ninguna ruta a mano.
 */
export function SelectorEnlace({ etiqueta, id, valorActual, opciones }: {
  etiqueta: string;
  id: string;
  valorActual: string;
  opciones: ReadonlyArray<{ valor: string; texto: string; href: string }>;
}) {
  const router = useRouter();
  return <>
    <label htmlFor={id} className="sr-only">{etiqueta}</label>
    <select
      id={id}
      value={valorActual}
      onChange={(e) => {
        const elegida = opciones.find((o) => o.valor === e.target.value);
        if (elegida) router.push(elegida.href as Route);
      }}
      className="h-11 rounded-[var(--radius-md)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-2.5 text-sm font-semibold text-[var(--texto)]"
    >
      {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
    </select>
  </>;
}
