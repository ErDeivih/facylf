import Link from 'next/link';
import type { Route } from 'next';

/**
 * Lo que se enseña cuando la web no puede leer el canónico.
 *
 * Tres cosas, en este orden: qué pasa, por qué (`motivo`, que viene de `motivoSinCanonico()` o de
 * `CanonicoNoDisponible`) y cómo se arregla. Lo que **no** se hace es pintar la página con ceros o con
 * una tabla vacía: un cero se lee como «no hay nada» y aquí significa «no se sabe».
 *
 * Los colores y el tamaño salen de `tokens.css` y de las utilidades compartidas de `globals.css`; esta
 * pieza es la misma en la portada, `/federaciones`, `/competiciones` y `/canonico`.
 */
export function SinCanonico({ titulo, motivo, volver = true }: {
  titulo: string; motivo: string; volver?: boolean;
}) {
  return <>
    <h2 className="font-display text-3xl uppercase">{titulo}</h2>
    <div className="aviso aviso-atencion mt-4">
      <b className="block text-[var(--texto)]">Ahora mismo esta página no puede leer el canónico.</b>
      <p className="mt-1">{motivo}</p>
      <p className="mt-3">
        Para levantarlo en local: <code>pnpm db:arrancar</code>,{' '}
        <code>pnpm db:migrar</code> e{' '}
        <code>pnpm importar --federacion &lt;federación&gt; --temporada &lt;temporada&gt; --grupo &lt;grupo&gt;</code>.
      </p>
      <p className="mt-3 text-xs text-[var(--texto-tenue)]">
        Mientras no se pueda leer, esta página no enseña cifras: no se rellena con ceros ni con datos de
        ejemplo, porque un cero se leería como «no hay nada» y lo que pasa es que no se sabe.
      </p>
      {volver && <Link className="mt-3 inline-block text-xs font-medium text-[var(--accion)] hover:underline"
        href={'/canonico' as Route}>← Estado del canónico</Link>}
    </div>
  </>;
}
