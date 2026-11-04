import Link from 'next/link';
import { Buscador } from '@/componentes/Buscador';
import type { SeccionActiva } from './activo';

/**
 * Cabecera común del sitio, copiada del tablero «Cabecera» del prototipo: barra de 64 px sobre la
 * superficie fuerte del producto, con el ancho interior de 1240 px centrado.
 *
 * Es una pieza **pura y sin hooks**: la sección activa entra por prop, así que el layout de servidor
 * no necesita conocer la ruta. Quien la conoce es `CabeceraSitioActiva`, con `usePathname`.
 *
 * Lo que la cabecera NO finge, a propósito:
 *  · Rankings, Ojeo y Comparar no tienen pantalla: se enseñan como texto desactivado, no como
 *    enlaces muertos que llevarían a un 404;
 *  · no hay avisos, ni cuentas, ni contador: los iconos de panel, avisos y cuenta son botones
 *    desactivados sin cifra y sin iniciales inventadas.
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

export function CabeceraSitio({ activo = null }: { activo?: SeccionActiva }) {
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
          pasan a ir después de la navegación, como en el prototipo. Son botones desactivados, así que
          no entran en el orden de tabulación y este cambio de orden no afecta al teclado.
        */}
        <div className="order-2 ml-auto flex items-center gap-1 lg:order-3 lg:ml-0">
          <BotonPendiente etiqueta="Mi panel" icono={<IconoEstrella />} />
          <BotonPendiente etiqueta="Avisos" icono={<IconoAviso />} />
          <BotonPendiente etiqueta="Cuenta" icono={<IconoCuenta />} />
        </div>

        <nav aria-label="Funciones" className="order-3 w-full min-w-0 lg:order-2 lg:w-auto">
          <ul className="flex items-center gap-1 overflow-x-auto [scrollbar-width:thin]">
            <li className="shrink-0">
              <Link
                href="/competiciones"
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

        <div className="order-4 w-full min-w-0 lg:flex-1">
          <Buscador />
        </div>
      </div>
    </header>
  );
}
