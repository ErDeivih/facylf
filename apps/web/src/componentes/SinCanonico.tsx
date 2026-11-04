import Link from 'next/link';
import type { Route } from 'next';

/**
 * Lo que se enseña cuando la web no puede leer el canónico.
 *
 * Tres cosas, en este orden: qué pasa, por qué (`motivo`, que viene de `motivoSinCanonico()` o de
 * `CanonicoNoDisponible`) y cómo se arregla. Lo que **no** se hace es pintar la página con ceros o con
 * una tabla vacía: un cero se lee como «no hay nada» y aquí significa «no se sabe».
 *
 * Está en el sistema de diseño: borde izquierdo `--amarilla` (el aviso no es un error de resultado),
 * superficie `--fondo-elevado` —no un blanco literal, que en tema oscuro sería una caja blanca—,
 * texto `--texto`/`--texto-suave` y tamaños con rol (`text-titulo`, `text-tabla`, `text-nota`).
 *
 * Y es **un solo bloque**, no dos hijos sueltos: así se apila bien también cuando el que lo monta es
 * un contenedor en fila (la pantalla nueva lo devuelve dentro de un `flex`).
 *
 * Lo usan la portada, `/buscar`, `/federaciones`, `/competiciones`, `/equipos`, `/jugadores`,
 * `/partidos` y la pantalla nueva de competición. `/canonico` mantiene su propia versión, que además
 * explica cómo levantar la base.
 */
export function SinCanonico({ titulo, motivo, volver = true }: {
  titulo: string; motivo: string; volver?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-titulo font-semibold text-[var(--texto)]">{titulo}</h2>
      <div className="border-l-4 border-[var(--amarilla)] bg-[var(--fondo-elevado)] p-4 text-tabla text-[var(--texto)]">
        <b className="block">Ahora mismo esta página no puede leer el canónico.</b>
        <p className="mt-1 text-[var(--texto-suave)]">{motivo}</p>
        <p className="mt-3 text-[var(--texto-suave)]">
          Para levantarlo en local:{' '}
          <code className="rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-1 font-numero">pnpm db:arrancar</code>,{' '}
          <code className="rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-1 font-numero">pnpm db:migrar</code> e{' '}
          <code className="rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-1 font-numero">pnpm importar --federacion &lt;federación&gt; --temporada &lt;temporada&gt; --grupo &lt;grupo&gt;</code>.
        </p>
        <p className="mt-3 text-nota text-[var(--texto-suave)]">
          Mientras no se pueda leer, esta página no enseña cifras: no se rellena con ceros ni con datos de
          ejemplo, porque un cero se leería como «no hay nada» y lo que pasa es que no se sabe.
        </p>
        {volver && (
          <Link className="mt-3 inline-block text-nota font-semibold text-[var(--accion)] hover:underline"
            href={'/canonico' as Route}>← Estado del canónico</Link>
        )}
      </div>
    </div>
  );
}
