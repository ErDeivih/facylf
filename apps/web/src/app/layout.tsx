import type { Metadata } from 'next';
import Link from 'next/link';
import { TEMPORADA_MINIMA } from '@/lib/temporadas';
import { Buscador } from '@/componentes/Buscador';
import { NavegacionPrincipal } from '@/componentes/NavegacionPrincipal';
import './globals.css';

export const metadata: Metadata = {
  title: 'Observatorio de fútbol',
  description: 'Archivo consultable de competiciones, jornadas, equipos y jugadores de las federaciones territoriales.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">
        {/* Primer tabulador de la página: quien navega con teclado o lector de pantalla se salta
            diez enlaces de cabecera en cada visita. */}
        <a href="#contenido" className="saltar-al-contenido">Saltar al contenido</a>

        <div aria-hidden="true" className="h-[3px] bg-[var(--accion-inversa)]" />

        <header className="sticky top-0 z-[var(--capa-pegajoso)] bg-[var(--superficie-fuerte)] text-[var(--texto-cabecera)]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-4 sm:py-3">
            <Link
              href="/"
              className="font-display text-lg font-semibold uppercase tracking-wide hover:text-[var(--accion-inversa)] sm:text-xl"
            >
              Observatorio de fútbol
            </Link>
            <div className="order-3 w-full min-w-[12rem] flex-1 sm:order-2 sm:w-auto">
              <Buscador />
            </div>
          </div>
          <NavegacionPrincipal />
        </header>

        <main id="contenido" tabIndex={-1} className="mx-auto max-w-7xl px-3 py-6 outline-none sm:px-4 sm:py-8">
          {children}
        </main>

        <footer className="mx-auto max-w-7xl border-t border-[var(--borde)] px-4 py-6 text-xs text-[var(--texto-suave)]">
          <p>
            Archivo privado construido desde fuentes federativas oficiales. Esta web no es oficial
            y la cobertura de cada competición se indica dentro de su ficha.
          </p>
          <p className="mt-1">
            Se publican las temporadas <b>{TEMPORADA_MINIMA}</b> en adelante. Las anteriores están
            recopiladas y aplazadas: se incorporarán cuando se retome el histórico, no se han perdido.
          </p>
        </footer>
      </body>
    </html>
  );
}
