'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { TipoFavorito } from '@/lib/cuentas';

/**
 * Estrella de favorito de una ficha (club, equipo o jugador).
 *
 * El primer render no sabe si hay sesión: lo pregunta a `GET /api/favoritos` al montarse. Mientras
 * tanto deja el botón sin bloquear; si se pulsa antes de saberlo, no se hace nada (evita guardar o
 * quitar por error). Con la respuesta:
 *   · sin sesión → al pulsar se va a `/entrar` con `volver` a esta misma ficha;
 *   · con sesión → `POST /api/favoritos` alterna y se repinta.
 *
 * El control es también un formulario real (`action="/api/favoritos"`): sin JavaScript, el envío
 * alterna el favorito en el servidor y vuelve a la ficha por el `Referer`. Así la estrella no es un
 * botón muerto.
 */
export function BotonFavorito({ tipo, entidadId, etiqueta }: {
  tipo: TipoFavorito;
  entidadId: number;
  etiqueta: string;
}) {
  const [estado, setEstado] = useState<'cargando' | 'anonimo' | 'guardado' | 'no'>('cargando');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const respuesta = await fetch(`/api/favoritos?tipo=${tipo}&id=${entidadId}`, {
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
        });
        if (!respuesta.ok) {
          if (vivo) setEstado('no');
          return;
        }
        const datos = (await respuesta.json()) as { autenticado?: boolean; siguiendo?: boolean };
        if (!vivo) return;
        setEstado(datos.autenticado === false ? 'anonimo' : datos.siguiendo ? 'guardado' : 'no');
      } catch {
        if (vivo) setEstado('no');
      }
    })();
    return () => { vivo = false; };
  }, [tipo, entidadId]);

  function irAEntrar() {
    const volver = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/entrar?volver=${encodeURIComponent(volver)}`);
  }

  async function alternar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (estado === 'cargando' || ocupado) return;
    if (estado === 'anonimo') {
      irAEntrar();
      return;
    }
    setOcupado(true);
    try {
      const respuesta = await fetch('/api/favoritos', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ accion: 'alternar', tipo, entidadId, etiqueta }),
      });
      if (respuesta.status === 401) {
        irAEntrar();
        return;
      }
      if (!respuesta.ok) return;
      const datos = (await respuesta.json()) as { siguiendo?: boolean };
      setEstado(datos.siguiendo ? 'guardado' : 'no');
    } catch {
      // Sin conexión se queda como estaba; el usuario puede volver a pulsar.
    } finally {
      setOcupado(false);
    }
  }

  const guardado = estado === 'guardado';
  const etiquetaVisible = estado === 'cargando' ? 'Guardar' : guardado ? 'Guardado' : 'Guardar';
  const nombreAccesible = estado === 'cargando'
    ? 'Guardar en favoritos'
    : guardado
      ? `Quitar ${etiqueta} de favoritos`
      : `Guardar ${etiqueta} en favoritos`;

  return (
    <form action="/api/favoritos" method="post" onSubmit={alternar}>
      <input type="hidden" name="accion" value="alternar" />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="entidad_id" value={entidadId} />
      <input type="hidden" name="etiqueta" value={etiqueta} />
      <button
        type="submit"
        aria-label={nombreAccesible}
        aria-pressed={guardado}
        aria-busy={ocupado || estado === 'cargando'}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]"
      >
        <IconoEstrella rellena={guardado} />
        {etiquetaVisible}
      </button>
    </form>
  );
}

function IconoEstrella({ rellena }: { rellena: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={rellena ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
    </svg>
  );
}
