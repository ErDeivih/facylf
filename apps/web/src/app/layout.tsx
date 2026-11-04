import type { Metadata } from 'next';
import { TEMPORADA_MINIMA } from '@/lib/temporadas';
import { CabeceraSitioActiva } from '@/componentes/cabecera/CabeceraSitioActiva';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  title: 'facylf · fútbol federado',
  description: 'Archivo consultable de competiciones, jornadas, equipos y jugadores de las federaciones territoriales.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">
        <CabeceraSitioActiva />
        <main className="mx-auto max-w-[1240px] px-5 py-8">{children}</main>
        <footer className="mx-auto max-w-[1240px] border-t border-[var(--borde)] px-5 py-6 text-nota text-[var(--texto-suave)]">
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
