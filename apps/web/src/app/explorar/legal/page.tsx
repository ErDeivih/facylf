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
          Castilla y León de Fútbol. {NOMBRE_PRODUCTO} no es una web oficial de la federación: reproduce
          esos datos y añade cálculos propios. Para ejercer derechos sobre los datos deportivos, la vía
          es la federación que los publica.
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
          No se muestra la fecha de nacimiento completa, ni documento, dirección o datos de contacto. Responsable y contacto: pendiente de publicar. En el buscador de talento puede aparecer el año de nacimiento como referencia deportiva.
        </p>
        <p className={PARRAFO}>
          Las fotos de ficha, también las de menores, se muestran con la autorización de tratamiento de la federación. En la demo pública son ficheros públicos: cualquiera con el enlace puede verlas y descargarlas.
        </p>
      </section>

      <section aria-labelledby="legal-cuenta" className={TARJETA}>
        <h2 id="legal-cuenta" className={TITULO}>Tu cuenta</h2>
        <p className={PARRAFO}>
          La demo pública es una copia fija de los datos: no permite crear cuenta ni iniciar sesión. En la app
          privada la cuenta es opcional y guarda tu nombre, correo, una huella de la contraseña (nunca la
          contraseña) y los equipos, clubes o jugadores que decides seguir.
        </p>
        <p className={PARRAFO}>
          En la app privada puedes consultar y descargar tus datos desde Mi cuenta, cambiar la contraseña
          y darte de baja. La baja anonimiza el perfil y borra favoritos, avisos y credenciales.
        </p>
      </section>

      <section aria-labelledby="legal-cookies" className={TARJETA}>
        <h2 id="legal-cookies" className={TITULO}>Cookies</h2>
        <p className={PARRAFO}>La demo pública sólo usa la cookie de tema. La app privada usa además la de sesión; las dos son propias y necesarias:</p>
        <dl className="m-0 mt-2">
          <div className="border-t border-[var(--fondo-sutil)] py-2">
            <dt className="text-tabla font-semibold text-[var(--texto)]">Sesión</dt>
            <dd className="m-0 text-tabla leading-6 text-[var(--texto-suave)]">
              Mantiene la sesión abierta en la app privada. Dura siete días.
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
