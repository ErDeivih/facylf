import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { competicion, MI_EQUIPO } from '@/lib/datos';

export const metadata: Metadata = {
  title: 'Fútbol Salamanca',
  description: 'Resultados y clasificaciones del fútbol base de la provincia de Salamanca.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const c = competicion();
  return (
    <html lang="es">
      <body className="text-[#16191D] antialiased">
        <div className="rayas h-[7px]" />
        <header className="bg-pizarra text-[#F7F7F6]">
          <div className="mx-auto max-w-5xl px-4 py-4">
            <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
              {MI_EQUIPO.replace(' "B"', '')}
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#A6A9AD]">
              {c.nombre} · <b className="text-club">{c.temporada}</b>
            </p>
          </div>
          <nav className="mx-auto flex max-w-5xl gap-1 px-4">
            {([
              { href: '/', texto: 'Resumen' },
              { href: '/partidos', texto: 'Partidos' },
            ] as const).map((x) => (
              <Link key={x.href} href={x.href}
                className="border-b-[3px] border-transparent px-4 py-3 font-display text-sm uppercase tracking-[0.14em] text-[#A6A9AD] hover:border-club hover:text-white">
                {x.texto}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl border-t border-[#D6D6D4] px-4 py-6 text-xs text-[#5C646C]">
          <p>
            Datos oficiales:{' '}
            <a className="underline" href="https://www.rfcylf.es">
              Federación de Fútbol de Castilla y León
            </a>
            . Esta web no es oficial.
          </p>
          <p className="mt-1">
            Fase 0: el calendario sale del fichero real de la federación guardado en el
            repositorio. Todavía no hay resultados en vivo.
          </p>
        </footer>
      </body>
    </html>
  );
}
