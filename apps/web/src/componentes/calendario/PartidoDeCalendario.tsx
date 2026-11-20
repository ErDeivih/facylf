import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { Escudo } from '@/componentes/Escudo';
import type { PartidoEnCalendario } from '@/lib/calendario';
import { fechaCorta } from '@/lib/vocabulario-pantalla';
import { marcadorDePartido } from '@/lib/pantalla-competicion';

/**
 * Una fila de partido del calendario.
 *
 * La comparten el calendario global y el del grupo para que un partido se lea igual en los dos sitios:
 *  · un partido sin marcador se pinta «—» y NUNCA 0-0;
 *  · la hora y el campo sólo aparecen si la federación los publicó;
 *  · el enlace al acta sólo existe si hay acta analizada (`calidad_acta`), y el de la jornada sólo si la
 *    fila tiene número de jornada.
 *
 * La fecha se enseña en la línea de contexto, no en el marcador: un marcador con fecha dentro no es un
 * marcador. En el calendario global la línea de contexto lleva además la competición, que es lo que
 * distingue un partido de otro cuando se mezclan federaciones.
 */
export function PartidoDeCalendario({ partido, contexto = false, hrefCompeticion, hrefJornada, hrefActa }: {
  partido: PartidoEnCalendario;
  /** En el calendario global, sí: el partido no está dentro de la ficha de su competición. */
  contexto?: boolean;
  hrefCompeticion?: string | null;
  hrefJornada?: string | null;
  hrefActa?: string | null;
}) {
  const marcador = marcadorDePartido({
    goles_local: partido.goles_local,
    goles_visitante: partido.goles_visitante,
    hora: null,
  });
  const ganaLocal = marcador.jugado && (partido.goles_local ?? 0) > (partido.goles_visitante ?? 0);
  const ganaVisitante = marcador.jugado && (partido.goles_visitante ?? 0) > (partido.goles_local ?? 0);
  const fecha = partido.fecha;

  const piezas: Array<{ clave: string; nodo: ReactNode }> = [];
  if (fecha) piezas.push({ clave: 'fecha', nodo: <span>{fechaCorta(fecha)}</span> });
  if ((partido.hora ?? '').trim() !== '') piezas.push({ clave: 'hora', nodo: <span>{partido.hora}</span> });
  if ((partido.campo ?? '').trim() !== '') piezas.push({ clave: 'campo', nodo: <span>{partido.campo}</span> });
  if (contexto) {
    piezas.push({
      clave: 'federacion',
      nodo: <span>{partido.federacion_corta ?? partido.federacion_nombre}</span>,
    });
    piezas.push({
      clave: 'competicion',
      nodo: hrefCompeticion
        ? <Link href={hrefCompeticion as Route} className="font-semibold text-[var(--accion)] hover:underline">{partido.edicion} · {partido.grupo}</Link>
        : <span>{partido.edicion} · {partido.grupo}</span>,
    });
  }
  if (hrefJornada && partido.jornada !== null) {
    piezas.push({
      clave: 'jornada',
      nodo: <Link href={hrefJornada as Route} className="font-semibold text-[var(--accion)] hover:underline">Jornada {partido.jornada}</Link>,
    });
  }
  if (hrefActa) {
    piezas.push({
      clave: 'acta',
      nodo: <Link href={hrefActa as Route} className="font-semibold text-[var(--accion)] hover:underline">Acta</Link>,
    });
  }

  return (
    <li data-partido={partido.partido_id} className="border-t border-[var(--fondo-sutil)] px-3.5 py-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-center gap-2 text-tabla">
        <span className="flex min-w-0 items-center justify-end gap-2 text-right">
          <span className="sr-only">Local: </span>
          <span className={`min-w-0 break-words ${ganaLocal ? 'font-bold' : 'font-medium'} text-[var(--texto)]`}>
            {partido.local}
          </span>
          <Escudo
            equipoId={partido.local_id}
            nombre={partido.local}
            clubId={partido.local_club_id}
            tieneEscudo={partido.local_tiene_escudo}
          />
        </span>
        <span
          title={marcador.jugado ? marcador.accesible : 'Sin resultado publicado'}
          className={marcador.jugado
            ? 'tabular-nums rounded-[var(--radius-md)] bg-[var(--fondo-fuerte)] py-1 text-center font-bold text-[var(--texto-fuerte)]'
            : 'rounded-[var(--radius-md)] bg-[var(--fondo-sutil)] py-1 text-center text-nota font-semibold text-[var(--texto-suave)]'}>
          {marcador.jugado ? marcador.texto : 'Sin res.'}
          <span className="sr-only">, {marcador.jugado ? marcador.accesible : 'sin resultado publicado'}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <Escudo
            equipoId={partido.visitante_id}
            nombre={partido.visitante}
            clubId={partido.visitante_club_id}
            tieneEscudo={partido.visitante_tiene_escudo}
          />
          <span className="sr-only">Visitante: </span>
          <span className={`min-w-0 break-words ${ganaVisitante ? 'font-bold' : 'font-medium'} text-[var(--texto)]`}>
            {partido.visitante}
          </span>
        </span>
      </div>
      {piezas.length > 0 && (
        <p className="m-0 mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center text-nota text-[var(--texto-suave)]">
          {piezas.map((pieza, i) => (
            <span key={pieza.clave} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true">·</span>}
              {pieza.nodo}
            </span>
          ))}
        </p>
      )}
    </li>
  );
}
