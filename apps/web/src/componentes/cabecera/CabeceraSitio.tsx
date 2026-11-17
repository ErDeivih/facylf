import Link from 'next/link';
import type { Route } from 'next';
import { Buscador } from '@/componentes/Buscador';
import { Logotipo } from '@/componentes/marca/Logotipo';
import { NOMBRE_PRODUCTO, TAGLINE_LINEAS } from '@/componentes/marca/marca';
import type { Tema } from '@/lib/tema';
import type { SeccionActiva } from './activo';
import { BotonTema } from './BotonTema';

/**
 * Cabecera común del sitio: marca, búsqueda global y funciones.
 *
 * Es una pieza **pura y sin hooks**: la sección activa y el tema entran por prop, así que el layout de
 * servidor no necesita conocer la ruta. Quien la conoce es `CabeceraSitioActiva`, con
 * `usePathname`. El único trozo que tiene estado es `BotonTema`, que es un componente de cliente
 * aparte y sólo se ocupa de su botón.
 *
 * **Las funciones se explican.** «Explorar» o «Ojeo» no dicen por sí solos qué se va a encontrar, así
 * que cada una lleva una segunda línea pequeña con lo que hay dentro. En escritorio (≥1280 px) se ve;
 * por debajo, ese descriptor queda disponible para lectores de pantalla (`sr-only` +
 * `aria-describedby`) y en el `title` del control, en vez de ocupar ancho que el buscador necesita.
 *
 * Lo que la cabecera NO finge:
 *  · Ojeo y Comparar no tienen pantalla: se enseñan como texto desactivado con su explicación
 *    («próximamente» y el `title` completo), nunca como enlaces muertos que llevarían a un 404;
 *  · no hay avisos ni contador: panel y avisos son botones desactivados sin cifra y sin iniciales
 *    inventadas. La cuenta sí tiene pantalla (`/entrar`) y es un enlace real, sin avatar ni nombre.
 *
 * En móvil (<lg) el buscador baja a su propia fila a ancho completo; logo, navegación e iconos quedan
 * arriba. La navegación se desplaza en horizontal dentro de su caja, nunca el documento.
 */

type Funcion = {
  clave: Exclude<SeccionActiva, null>;
  etiqueta: string;
  /** Qué se encuentra dentro, en dos o tres palabras que se lean sin contexto. */
  descriptor: string;
  /** Sólo las funciones con pantalla navegan. Las demás se explican y se quedan desactivadas. */
  href?: string;
  icono?: React.ReactNode;
};

const FUNCIONES: readonly Funcion[] = [
  {
    clave: 'explorar',
    etiqueta: 'Competiciones',
    descriptor: 'Ligas y grupos',
    href: '/explorar/competiciones',
    icono: <IconoExplorar />,
  },
  {
    clave: 'rankings',
    etiqueta: 'Goleadores',
    descriptor: 'Goles y tarjetas',
    href: '/explorar/goleadores',
  },
  {
    clave: 'ojeo',
    etiqueta: 'Jugadores',
    descriptor: 'Buscar por perfil',
    href: '/explorar/ojeo',
  },
  {
    clave: 'comparar',
    etiqueta: 'Comparar',
    descriptor: 'Jugador frente a jugador',
    href: '/explorar/comparar',
  },
];

const CLASE_SECCION =
  'inline-flex min-h-11 flex-col items-start justify-center gap-0.5 whitespace-nowrap rounded-[var(--radius-lg)] px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foco)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fondo-fuerte)]';

/** La segunda línea: visible a partir de 1280 px; por debajo, accesible pero sin ocupar ancho. */
const CLASE_DESCRIPTOR = 'text-etiqueta font-medium sr-only xl:not-sr-only';

function claseSeccion(activa: boolean): string {
  return `${CLASE_SECCION} ${
    activa
      ? 'bg-[var(--fondo-elevado)] text-[var(--texto)]'
      : 'text-[var(--texto-fuerte-suave)] hover:text-[var(--texto-fuerte)]'
  }`;
}

const CLASE_SECCION_PENDIENTE = `${CLASE_SECCION} cursor-not-allowed text-[var(--texto-fuerte-suave)] opacity-70`;

function claseDescriptor(activa: boolean): string {
  return `${CLASE_DESCRIPTOR} ${activa ? 'text-[var(--texto-suave)]' : 'text-[var(--texto-fuerte-suave)]'}`;
}

/** Icono de trazo, una sola familia, en `currentColor`, 16 px. Decorativo: `aria-hidden`. */
function IconoExplorar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function IconoEstrella() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
    </svg>
  );
}

function IconoAviso() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

function IconoCuenta() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}

/** Botón de una función que todavía no tiene pantalla: desactivado y con nombre accesible. */
function BotonPendiente({ etiqueta, icono }: { etiqueta: string; icono: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      aria-label={`${etiqueta} (todavía no tiene pantalla)`}
      className="inline-flex size-11 items-center justify-center rounded-[var(--radius-lg)] text-[var(--texto-fuerte-suave)] disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foco)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fondo-fuerte)]"
    >
      {icono}
    </button>
  );
}

export function CabeceraSitio({
  activo = null,
  tema = 'claro',
  permiteTema = false,
  conSesion = false,
}: {
  activo?: SeccionActiva;
  tema?: Tema;
  permiteTema?: boolean;
  /** Hay cookie de sesión: el icono de cuenta lleva al panel en vez de a la entrada. */
  conSesion?: boolean;
}) {
  return (
    <header className="bg-[var(--fondo-fuerte)] text-[var(--texto-fuerte)]">
      {/* 1240 de caja con 20 px de relleno a cada lado = 1200 interiores, y el mismo borde que `main`:
          cabecera, migas y tarjetas empiezan en la misma x. */}
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-3.5 gap-y-2 px-5 py-2.5">
        <Link
          href="/"
          aria-label={NOMBRE_PRODUCTO}
          className="order-1 flex min-h-11 items-center gap-[9px] rounded-[var(--radius-lg)] text-[var(--texto-fuerte)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foco)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fondo-fuerte)]"
        >
          <Logotipo />
          <span className="flex flex-col justify-center leading-none">
            <span className="text-lg font-extrabold leading-none tracking-[-0.02em]">{NOMBRE_PRODUCTO}</span>
            {/*
              La tagline describe el producto en dos líneas cortas. En móvil no cabe: se queda oculta
              sin desaparecer del documento (no es información de la que dependa nada). Se acota el
              ancho para que no le robe ancho al buscador.
            */}
            <span aria-hidden="true"
              className="mt-0.5 hidden text-etiqueta font-medium leading-tight text-[var(--texto-fuerte-suave)] xl:block">
              <span className="block">{TAGLINE_LINEAS[0]}</span>
              <span className="block">{TAGLINE_LINEAS[1]}</span>
            </span>
          </span>
        </Link>

        {/*
          En móvil los iconos quedan visibles en la primera fila, a la derecha del logo. En escritorio
          pasan a ir después de la navegación, como en el prototipo. Panel y avisos siguen desactivados
          y no entran en el orden de tabulación; la cuenta es un enlace real a `/entrar` y sí entra.
        */}
        <div className="order-2 ml-auto flex items-center gap-1 lg:order-3 lg:ml-0">
          <Link
            href={(conSesion ? '/mi-panel' : '/entrar') as Route}
            aria-label={conSesion ? 'Mi panel' : 'Entrar o crear cuenta'}
            title={conSesion ? 'Mi panel' : 'Entrar'}
            className="inline-flex size-11 flex-none items-center justify-center rounded-[var(--radius-lg)] text-[var(--texto-fuerte-suave)] hover:text-[var(--texto-fuerte)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foco)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fondo-fuerte)]"
          >
            <IconoCuenta />
          </Link>
          {permiteTema && <BotonTema key={tema} tema={tema} />}
        </div>

        {/*
          La navegación y el botón de tema van juntos en un envoltorio que en móvil ocupa su propia
          fila (la nav se queda con el ancho que sobra y hace scroll interno; el tema, al lado) y en
          escritorio desaparece (`lg:contents`), de modo que nav y botón vuelven a ser hijos directos
          del flex de la cabecera y cada uno toma su `order`.

          El botón va DESPUÉS de la nav en el DOM, no dentro del grupo de iconos: así el recorrido de
          Tab sigue el orden visual (logo → Explorar → Rankings → cuenta → tema → buscador).
        */}
        <div className="order-3 w-full min-w-0 lg:contents">
          <nav aria-label="Funciones" className="min-w-0 lg:order-2 lg:w-auto lg:flex-none">
            {/*
              El `p-1` con `-m-1` deja dentro del contenedor de desplazamiento el hueco que necesita el
              anillo de foco (2 px de trazo + 2 px de separación) sin crecer: el anillo no se recorta.
            */}
            {/* `relative`: los descriptores ocultos (`sr-only`, en posición absoluta) quedan dentro de esta caja
                con desplazamiento; sin él se salían por la derecha y la página ganaba 1 px de scroll horizontal. */}
            <ul className="relative -m-1 flex flex-wrap items-center gap-1 p-1 lg:flex-nowrap lg:overflow-visible">
              {FUNCIONES.map((funcion) => {
                const activa = activo === funcion.clave;
                const descriptorId = `funcion-${funcion.clave}-desc`;
                const contenido = (
                  <>
                    <span className="inline-flex items-center gap-[7px]">
                      {funcion.icono}
                      {funcion.etiqueta}
                    </span>
                    <span id={descriptorId} className={claseDescriptor(activa)}>{funcion.descriptor}</span>
                  </>
                );
                return (
                  <li key={funcion.clave} className="shrink-0">
                    {funcion.href ? (
                      <Link
                        href={funcion.href as Route}
                        aria-current={activa ? 'page' : undefined}
                        aria-describedby={descriptorId}
                        title={funcion.descriptor}
                        className={claseSeccion(activa)}
                      >
                        {contenido}
                      </Link>
                    ) : (
                      /*
                        Sin pantalla no hay enlace: es texto desactivado. El estado se explica en el
                        nombre accesible y en el `title`; en pantalla, el descriptor sigue diciendo qué
                        será. Así el aviso no le roba ancho al buscador.
                      */
                      <span
                        aria-disabled="true"
                        aria-label={`${funcion.etiqueta} (todavía no tiene pantalla)`}
                        aria-describedby={descriptorId}
                        title={`${funcion.descriptor}: todavía no tiene pantalla`}
                        className={CLASE_SECCION_PENDIENTE}
                      >
                        {contenido}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

        </div>

        <div className="order-4 w-full min-w-0 lg:flex-1">
          <Buscador />
        </div>
      </div>
    </header>
  );
}
