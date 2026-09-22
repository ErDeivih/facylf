import Link from 'next/link';
import type { Route } from 'next';

/**
 * Lo que se enseña cuando la web no puede leer el canónico.
 *
 * Tres cosas, en este orden: qué pasa, por qué (`motivo`, que viene de `motivoSinCanonico()` o de
 * `CanonicoNoDisponible`) y cómo se arregla. Lo que **no** se hace es pintar la página con ceros o con
 * una tabla vacía: un cero se lee como «no hay nada» y aquí significa «no se sabe».
 *
 * Lo usan la portada, `/federaciones` y `/competiciones`. `/canonico` mantiene su propia versión, que
 * además explica cómo levantar la base.
 */
export function SinCanonico({ titulo, motivo, volver = true }: {
  titulo: string; motivo: string; volver?: boolean;
}) {
  return <>
    <h2 className="font-display text-3xl uppercase">{titulo}</h2>
    <div className="mt-4 border-l-4 border-[#C6892B] bg-white p-4 text-[13px] leading-6">
      <b className="block">Ahora mismo esta página no puede leer el canónico.</b>
      <p className="mt-1 text-[#5C646C]">{motivo}</p>
      <p className="mt-3 text-[#5C646C]">
        Para levantarlo en local: <code className="bg-[#F4F5F3] px-1">pnpm db:arrancar</code>,{' '}
        <code className="bg-[#F4F5F3] px-1">pnpm db:migrar</code> e{' '}
        <code className="bg-[#F4F5F3] px-1">pnpm importar --federacion &lt;federación&gt; --temporada &lt;temporada&gt; --grupo &lt;grupo&gt;</code>.
      </p>
      <p className="mt-3 text-[11px] text-[#8A8E91]">
        Mientras no se pueda leer, esta página no enseña cifras: no se rellena con ceros ni con datos de
        ejemplo, porque un cero se leería como «no hay nada» y lo que pasa es que no se sabe.
      </p>
      {volver && <Link className="mt-3 inline-block text-[12px] text-club hover:underline"
        href={'/canonico' as Route}>← Estado del canónico</Link>}
    </div>
  </>;
}
