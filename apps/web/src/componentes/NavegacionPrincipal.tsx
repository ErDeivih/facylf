'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { esActiva, NAVEGACION } from '@/lib/navegacion';

/**
 * Barra de navegación del producto.
 *
 * Tres cosas que antes no existían y que aquí se resuelven de una vez:
 *
 * 1. **Estado activo.** Se marca con `aria-current="page"` y con la línea inferior, no sólo con color.
 * 2. **Móvil real.** En 360 px no caben diez pestañas: se enseñan cuatro y el resto bajo «Más». Antes
 *    las últimas quedaban fuera de la pantalla sin ninguna pista de que hubiera más.
 * 3. **Objetivo táctil.** Cada enlace mide 44 px de alto, el mínimo cómodo, también en la fila que se
 *    desplaza en horizontal.
 */
export function NavegacionPrincipal() {
  const ruta = usePathname() ?? '/';
  const primarios = NAVEGACION.filter((x) => x.primario);
  const secundarios = NAVEGACION.filter((x) => !x.primario);
  const haySecundariaActiva = secundarios.some((x) => esActiva(ruta, x.href));

  return (
    <nav aria-label="Navegación principal" className="border-t border-[var(--superficie-fuerte-borde)]">
      <div className="mx-auto flex max-w-7xl items-stretch gap-1 px-2 sm:hidden">
        {primarios.map((x) => <Enlace key={x.href} {...x} ruta={ruta} />)}
        {/* `key={ruta}` cierra el desplegable al navegar: sin recargar, un <details> abierto se queda abierto. */}
        <details key={ruta} className="group relative flex-1">
          <summary
            className={[
              'flex min-h-11 cursor-pointer list-none items-center justify-center gap-1 px-2 font-display text-[0.8125rem] uppercase tracking-[0.06em]',
              haySecundariaActiva
                ? 'border-b-[3px] border-[var(--accion-inversa)] text-[var(--texto-cabecera)]'
                : 'border-b-[3px] border-transparent text-[var(--texto-cabecera-suave)] hover:text-[var(--texto-cabecera)]',
            ].join(' ')}
          >
            Más
            <span aria-hidden="true" className="text-[0.625rem] group-open:rotate-180">▾</span>
          </summary>
          <ul className="absolute right-0 z-[var(--capa-flotante)] mt-1 w-60 border border-[var(--borde)] bg-[var(--fondo-elevado)] py-1 shadow-[var(--sombra-1)]">
            {secundarios.map((x) => {
              const activa = esActiva(ruta, x.href);
              return (
                <li key={x.href}>
                  <Link
                    href={x.href as Route}
                    aria-current={activa ? 'page' : undefined}
                    className={[
                      'flex min-h-11 items-center px-4 text-sm',
                      activa
                        ? 'border-l-[3px] border-[var(--accion)] font-semibold text-[var(--accion)]'
                        : 'border-l-[3px] border-transparent text-[var(--texto)] hover:bg-[var(--fondo-sutil)]',
                    ].join(' ')}
                  >
                    {x.texto}
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
      </div>

      <div className="mx-auto hidden max-w-7xl items-stretch gap-1 px-4 sm:flex">
        {NAVEGACION.map((x) => <Enlace key={x.href} {...x} ruta={ruta} />)}
      </div>
    </nav>
  );
}

function Enlace({ href, texto, ruta }: { href: string; texto: string; ruta: string }) {
  const activa = esActiva(ruta, href);
  return (
    <Link
      href={href as Route}
      aria-current={activa ? 'page' : undefined}
      className={[
        'flex min-h-11 shrink-0 items-center border-b-[3px] px-3 font-display text-[0.8125rem] uppercase tracking-[0.08em] sm:px-4 sm:text-sm',
        activa
          ? 'border-[var(--accion-inversa)] text-[var(--texto-cabecera)]'
          : 'border-transparent text-[var(--texto-cabecera-suave)] hover:border-[var(--superficie-fuerte-borde)] hover:text-[var(--texto-cabecera)]',
      ].join(' ')}
    >
      {texto}
    </Link>
  );
}
