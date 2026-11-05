import Link from 'next/link';
import { Buscador } from '@/componentes/Buscador';
import type { Tema } from '@/lib/tema';
import type { SeccionActiva } from './activo';
import { BotonTema } from './BotonTema';

/**
 * Cabecera común del sitio, copiada del tablero «Cabecera» del prototipo: barra de 64 px sobre la
 * superficie fuerte del producto, con el ancho interior de 1240 px centrado.
 *
 * Es una pieza **pura y sin hooks**: la sección activa y el tema entran por prop, así que el layout
 * de servidor no necesita conocer la ruta. Quien la conoce es `CabeceraSitioActiva`, con
 * `usePathname`. El único trozo que tiene estado es `BotonTema`, que es un componente de cliente
 * aparte y sólo se ocupa de su botón.
 *
 * Lo que la cabecera NO finge, a propósito:
 *  · Rankings, Ojeo y Comparar no tienen pantalla: se enseñan como texto desactivado, no como
 *    enlaces muertos que llevarían a un 404;
 *  · no hay avisos ni contador: panel y avisos son botones desactivados sin cifra y sin iniciales
 *    inventadas. La cuenta sí tiene pantalla (`/entrar`), así que es un enlace real; como todavía no
 *    hay sesión, no enseña avatar ni nombre. El botón de tema sí funciona: no enseña un dato, cambia
 *    algo real.
 *
 * En móvil (<lg) el buscador baja a su propia fila a ancho completo; logo, navegación e iconos
 * quedan arriba. La navegación se desplaza en horizontal dentro de su caja, nunca el documento.
 */

const CLASE_SECCION =
  'inline-flex h-11 items-center gap-[7px] whitespace-nowrap rounded-[var(--radius-lg)] px-3 text-sm font-semibold';

function claseSeccion(activa: boolean): string {
  return `${CLASE_SECCION} ${
    activa
      ? 'bg-[var(--fondo-elevado)] text-[var(--texto)]'
      : 'text-[var(--texto-fuerte-suave)] hover:text-[var(--texto-fuerte)]'
  }`;
}

const CLASE_SECCION_PENDIENTE = `${CLASE_SECCION} text-[var(--texto-fuerte-suave)]`;

function IconoMarca() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <rect width="28" height="28" rx="7" className="fill-[var(--accion)]" />
      <circle cx="14" cy="14" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M14 7v14M7 14h14" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Iconos de trazo, una sola familia, en `currentColor`, 16-18 px. Decorativos: `aria-hidden`. */
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
      className="inline-flex size-11 items-center justify-center rounded-[var(--radius-lg)] text-[var(--texto-fuerte-suave)] disabled:cursor-not-allowed"
    >
      {icono}
    </button>
  );
}

export function CabeceraSitio({
  activo = null,
  tema = 'claro',
  permiteTema = false,
}: {
  activo?: SeccionActiva;
  tema?: Tema;
  permiteTema?: boolean;
}) {
  return (
    <header className="bg-[var(--fondo-fuerte)] text-[var(--texto-fuerte)]">
      {/* 1240 de caja con 20 px de relleno a cada lado = 1200 interiores, y el mismo borde que `main`:
          cabecera, migas y tarjetas empiezan en la misma x (el prototipo alinea las dos). */}
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-3.5 gap-y-2 px-5 py-2.5">
        <Link
          href="/"
          className="order-1 flex min-h-11 items-center gap-[9px] text-lg font-extrabold tracking-[-0.02em] text-[var(--texto-fuerte)]"
        >
          <IconoMarca />
          facylf
        </Link>

        {/*
          En móvil los iconos quedan visibles en la primera fila, a la derecha del logo. En escritorio
          pasan a ir después de la navegación, como en el prototipo. Panel y avisos siguen desactivados
          y no entran en el orden de tabulación; la cuenta es un enlace real a `/entrar` y sí entra.
        */}
        <div className="order-2 ml-auto flex items-center gap-1 lg:order-3 lg:ml-0">
          <BotonPendiente etiqueta="Mi panel" icono={<IconoEstrella />} />
          <BotonPendiente etiqueta="Avisos" icono={<IconoAviso />} />
        </div>

        {/*
          La navegación y el botón de tema van juntos en un envoltorio que en móvil ocupa su propia
          fila (la nav se queda con el ancho que sobra y hace scroll interno; el tema, al lado) y en
          escritorio desaparece (`lg:contents`), de modo que nav y botón vuelven a ser hijos directos
          del flex de la cabecera y cada uno toma su `order`.

          El botón va DESPUÉS de la nav en el DOM, no dentro del grupo de iconos: así el recorrido de
          Tab sigue el orden visual (logo → Explorar → tema → buscador). En escritorio queda tras los
          iconos desactivados (order-3 los dos, y el DOM lo pone después). `key={tema}` lo remonta
          cuando el tema cambia al navegar, para que su etiqueta no se quede con el estado anterior.
        */}
        <div className="order-3 flex w-full min-w-0 items-center gap-3.5 lg:contents">
          <nav aria-label="Funciones" className="min-w-0 flex-1 lg:order-2 lg:w-auto lg:flex-none">
            <ul className="flex items-center gap-1 overflow-x-auto [scrollbar-width:thin]">
              <li className="shrink-0">
                <Link
                  href="/explorar/competiciones"
                  aria-current={activo === 'explorar' ? 'page' : undefined}
                  className={claseSeccion(activo === 'explorar')}
                >
                  <IconoExplorar />
                  Explorar
                </Link>
              </li>
              <li className="shrink-0">
                <span aria-disabled="true" title="Todavía no tiene pantalla" className={CLASE_SECCION_PENDIENTE}>
                  Rankings
                </span>
              </li>
              <li className="shrink-0">
                <span aria-disabled="true" title="Todavía no tiene pantalla" className={CLASE_SECCION_PENDIENTE}>
                  Ojeo
                </span>
              </li>
              <li className="shrink-0">
                <span aria-disabled="true" title="Todavía no tiene pantalla" className={CLASE_SECCION_PENDIENTE}>
                  Comparar
                </span>
              </li>
            </ul>
          </nav>

          <Link
            href="/entrar"
            aria-label="Entrar o crear cuenta"
            className="inline-flex size-11 flex-none items-center justify-center rounded-[var(--radius-lg)] text-[var(--texto-fuerte-suave)] hover:text-[var(--texto-fuerte)] lg:order-3"
          >
            <IconoCuenta />
          </Link>

          {permiteTema && <BotonTema key={tema} tema={tema} className="lg:order-3" />}
        </div>

        <div className="order-4 w-full min-w-0 lg:flex-1">
          <Buscador />
        </div>
      </div>
    </header>
  );
}
