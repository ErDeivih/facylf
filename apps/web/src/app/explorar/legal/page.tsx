import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { NOMBRE_PRODUCTO } from '@/componentes/marca/marca';

export const metadata: Metadata = { title: `Privacidad y cookies — ${NOMBRE_PRODUCTO}` };

/**
 * Privacidad y cookies: qué datos enseña la web, qué guarda de una cuenta y qué cookies usa.
 *
 * Todo lo que dice esta página se puede comprobar en el código: las dos cookies (`lib/sesion.ts`,
 * `lib/tema.ts`), lo que guarda una cuenta (`/mi-cuenta`), la regla de fotos (`lib/fotos.ts`) y que no
 * hay publicidad activa (`lib/publicidad.ts`). No nombra a un responsable ni da un contacto porque esos
 * datos no están en el repositorio: hay que añadirlos antes de abrir la web al público.
 */
const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-4';
const TITULO = 'm-0 text-bloque font-bold text-[var(--texto)]';
const PARRAFO = 'm-0 mt-2 text-tabla leading-6 text-[var(--texto-suave)]';

export default function PaginaLegal() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Privacidad y cookies</h1>

      <section aria-labelledby="legal-datos" className={TARJETA}>
        <h2 id="legal-datos" className={TITULO}>De dónde salen los datos</h2>
        <p className={PARRAFO}>
          Los resultados, clasificaciones, alineaciones y actas son los que publica la Real Federación de
          Castilla y León de Fútbol. {NOMBRE_PRODUCTO} no es una web oficial de la federación.
        </p>
        <p className={PARRAFO}>
          Los pronósticos y la clasificación final estimada son cálculos propios a partir de esos
          resultados. No son datos oficiales.{' '}
          <Link href={'/explorar/modelo' as Route} className="inline-flex min-h-11 items-center font-semibold text-[var(--accion)] hover:underline">
            Cómo se hacen
          </Link>
        </p>
      </section>

      <section aria-labelledby="legal-personas" className={TARJETA}>
        <h2 id="legal-personas" className={TITULO}>Jugadores, técnicos y árbitros</h2>
        <p className={PARRAFO}>
          Se muestra el nombre tal como figura en las actas de la federación, también el de los menores.
          No se muestran fecha de nacimiento, documento, dirección ni datos de contacto.
        </p>
        <p className={PARRAFO}>
          Las fotos de ficha de menores no se muestran en la versión pública de la web.
        </p>
      </section>

      <section aria-labelledby="legal-cuenta" className={TARJETA}>
        <h2 id="legal-cuenta" className={TITULO}>Tu cuenta</h2>
        <p className={PARRAFO}>
          La cuenta es opcional. Si la creas, se guardan tu nombre, tu correo, una huella de tu contraseña (no la
          contraseña) y los equipos, clubes y jugadores que decides seguir, con tus preferencias de avisos.
        </p>
        <p className={PARRAFO}>
          Puedes descargar tus datos desde{' '}
          <Link href={'/mi-cuenta' as Route} className="inline-flex min-h-11 items-center font-semibold text-[var(--accion)] hover:underline">
            Mi cuenta
          </Link>
          . La baja de la cuenta todavía no se puede hacer desde la web.
        </p>
      </section>

      <section aria-labelledby="legal-cookies" className={TARJETA}>
        <h2 id="legal-cookies" className={TITULO}>Cookies</h2>
        <p className={PARRAFO}>Sólo se usan dos, las dos propias y necesarias para que la web funcione:</p>
        <dl className="m-0 mt-2">
          <div className="border-t border-[var(--fondo-sutil)] py-2">
            <dt className="text-tabla font-semibold text-[var(--texto)]">Sesión</dt>
            <dd className="m-0 text-tabla leading-6 text-[var(--texto-suave)]">
              Mantiene tu sesión abierta cuando entras con tu cuenta. Dura siete días y se borra al salir.
            </dd>
          </div>
          <div className="border-t border-[var(--fondo-sutil)] py-2">
            <dt className="text-tabla font-semibold text-[var(--texto)]">Tema</dt>
            <dd className="m-0 text-tabla leading-6 text-[var(--texto-suave)]">
              Recuerda si prefieres el tema claro o el oscuro. Dura un año.
            </dd>
          </div>
        </dl>
        <p className={PARRAFO}>No hay cookies de publicidad ni de medición de terceros.</p>
      </section>
    </div>
  );
}
