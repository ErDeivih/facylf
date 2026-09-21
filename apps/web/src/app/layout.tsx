import type { Metadata } from 'next';
import Link from 'next/link';
import { FEDERACIONES_LOCALES } from '@/lib/repositorio-local';
import { TEMPORADA_MINIMA } from '@/lib/temporadas';
import { Buscador } from '@/componentes/Buscador';
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
        <div className="rayas h-[7px]" />
        <header className="bg-pizarra text-tinta-50">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <Link href="/" className="font-display text-xl font-semibold uppercase tracking-wide hover:text-club">
              Observatorio de fútbol
            </Link>
            <div className="order-3 w-full min-w-[15rem] flex-1 sm:order-2 sm:w-auto">
              <Buscador />
            </div>
            <Link href="/federaciones"
              className="order-2 hidden font-display text-[11px] uppercase tracking-[0.14em] text-tinta-400 hover:text-white sm:order-3 sm:block">
              {FEDERACIONES_LOCALES.length} federaciones
            </Link>
          </div>
          <nav className="mx-auto flex max-w-7xl flex-nowrap gap-1 overflow-x-auto px-4">
            {([
              { href: '/', texto: 'Resumen' },
              { href: '/federaciones', texto: 'Federaciones' },
              { href: '/competiciones', texto: 'Competiciones' },
              { href: '/partidos', texto: 'Partidos' },
              { href: '/equipos', texto: 'Equipos' },
              { href: '/estadisticas', texto: 'Estadísticas' },
              { href: '/jugadores', texto: 'Jugadores' },
              { href: '/tecnicos', texto: 'Técnicos' },
              { href: '/arbitros-campos', texto: 'Árbitros y campos' },
              // Estado del canónico: qué hay importado y hasta dónde llega cada grupo. Es la página
              // que evita leer un listado parcial como si fuera definitivo.
              { href: '/canonico', texto: 'Canónico' },
            ] as const).map((x) => (
              <Link key={x.href} href={x.href}
                className="border-b-[3px] border-transparent px-4 py-3 font-display text-sm uppercase tracking-[0.14em] text-tinta-400 hover:border-club hover:text-white">
                {x.texto}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
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
