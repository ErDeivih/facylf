'use client';

import { useState } from 'react';
import { TEMA_COOKIE, etiquetaDeTema, temaSiguiente, type Tema } from '@/lib/tema';

/**
 * Control de tema claro/oscuro de la cabecera.
 *
 * Recibe el tema **del servidor** por prop (el layout lo resolvió de la cookie y ya está escrito en
 * `<html data-tema>`), así que el primer render del cliente coincide con el del servidor y la
 * hidratación no se rompe. Al pulsar no se recarga nada: se escribe la cookie de un año para que la
 * próxima petición ya venga con el tema, se cambia `dataset.tema` en el momento y se repinta el
 * botón.
 *
 * El icono es el del tema al que se va (luna si vas a oscuro, sol si vas a claro) y es decorativo:
 * el nombre accesible es el que dice qué hace. No se usa `aria-pressed` porque la etiqueta cambia con
 * cada pulsación; un estado pulsado/no pulsado sobre una etiqueta que se mueve confunde.
 */

const UN_ANIO_EN_SEGUNDOS = 60 * 60 * 24 * 365;

/** Iconos de trazo, misma familia que el resto de la cabecera: 18 px, `currentColor`, decorativos. */
function IconoSol() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function IconoLuna() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

export function BotonTema({ tema: temaInicial, className = '' }: { tema: Tema; className?: string }) {
  const [tema, setTema] = useState<Tema>(temaInicial);
  const siguiente = temaSiguiente(tema);

  function cambiarTema() {
    document.documentElement.dataset.tema = siguiente;
    document.cookie = `${TEMA_COOKIE}=${siguiente}; Path=/; Max-Age=${UN_ANIO_EN_SEGUNDOS}; SameSite=Lax`;
    setTema(siguiente);
  }

  return (
    <button
      type="button"
      onClick={cambiarTema}
      aria-label={etiquetaDeTema(siguiente)}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-[var(--texto-fuerte-suave)] hover:text-[var(--texto-fuerte)] ${className}`}
    >
      {siguiente === 'oscuro' ? <IconoLuna /> : <IconoSol />}
    </button>
  );
}
