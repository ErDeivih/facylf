import Link from 'next/link';
import type { Route } from 'next';
import { NOMBRE_PRODUCTO } from './marca';

/**
 * Pie del sitio: adónde ir, de dónde salen los datos y qué no es esta web.
 *
 * Tres grupos de enlaces a pantallas que existen y una línea de procedencia. No hay enlaces a redes ni
 * a nada que el producto no tenga: un pie no promete lo que no hay detrás.
 */
const GRUPOS: readonly { titulo: string; enlaces: readonly { texto: string; href: string }[] }[] = [
  {
    titulo: 'Competición',
    enlaces: [
      { texto: 'Explorar', href: '/explorar' },
      { texto: 'Competiciones', href: '/explorar/competiciones' },
      { texto: 'Próximos partidos', href: '/explorar/proximas' },
      { texto: 'Calendario', href: '/explorar/calendario' },
    ],
  },
  {
    titulo: 'Estadísticas',
    enlaces: [
      { texto: 'Goleadores', href: '/explorar/goleadores' },
      { texto: 'Estadísticas', href: '/explorar/estadisticas' },
      { texto: 'Comparar jugadores', href: '/explorar/comparar' },
    ],
  },
  {
    titulo: 'Sobre los datos',
    enlaces: [
      { texto: 'Pronósticos', href: '/explorar/modelo' },
      { texto: 'Cobertura', href: '/explorar/datos' },
      { texto: 'Privacidad y cookies', href: '/explorar/legal' },
      { texto: 'Publicidad', href: '/explorar/publicidad' },
    ],
  },
];

export function PieSitio() {
  return (
    <footer className="mt-8 border-t border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
        <nav aria-label="Pie" className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo} className="flex flex-col gap-1">
              <h2 className="m-0 text-nota font-semibold text-[var(--texto-suave)]">{grupo.titulo}</h2>
              <ul className="m-0 list-none p-0">
                {grupo.enlaces.map((enlace) => (
                  <li key={enlace.href}>
                    <Link href={enlace.href as Route}
                      className="inline-flex min-h-11 items-center text-tabla font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
                      {enlace.texto}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="flex flex-col gap-1 border-t border-[var(--fondo-sutil)] pt-4 text-nota text-[var(--texto-suave)]">
          <p className="m-0 font-semibold text-[var(--texto)]">{NOMBRE_PRODUCTO}</p>
          <p className="m-0">
            Resultados y actas publicados por la Real Federación de Castilla y León de Fútbol. Los
            pronósticos son estimaciones propias. Web no oficial.
          </p>
        </div>
      </div>
    </footer>
  );
}
