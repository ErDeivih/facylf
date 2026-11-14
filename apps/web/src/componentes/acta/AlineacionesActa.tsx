import Link from 'next/link';
import type { EventoDeActa, JugadorDeActa } from '@/consultas/partidos';
import { Escudo } from '@/componentes/Escudo';
import {
  marcasDeJugador, textoMarca, type AlineacionDeLado,
} from '@/lib/acta';

/** Lo que la alineación necesita de cada equipo para pintar su escudo y su nombre. */
export type EquipoEnActa = {
  nombre: string;
  nombreCorto?: string | null;
  equipoId: number;
  clubId: number | null;
  tieneEscudo: boolean;
};

/**
 * Alineaciones de los dos equipos: titulares, suplentes y convocados sin condición publicada, con el
 * dorsal y las marcas que el acta apunta de cada jugador (goles, tarjetas y cambios).
 *
 * No se rellena lo que no hay: un acta parcial que sólo publica suplentes enseña suplentes, y una que no
 * publica alineaciones lo dice en una línea. Los nombres se publican tal como los da la federación,
 * también los de menores; aquí no hay ninguna foto de personas.
 */
export function AlineacionesActa({ alineaciones, equipos, eventos }: {
  alineaciones: readonly AlineacionDeLado[];
  equipos: { local: EquipoEnActa; visitante: EquipoEnActa };
  eventos: readonly EventoDeActa[];
}) {
  const total = alineaciones.reduce(
    (n, a) => n + a.titulares.length + a.suplentes.length + a.convocados.length, 0);
  return (
    <section aria-labelledby="alineaciones"
      className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="px-4 py-3.5">
        <h2 id="alineaciones" className="m-0 text-bloque font-bold text-[var(--texto)]">Alineaciones</h2>
      </div>
      {total === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            El acta de este partido no recoge alineaciones.
          </p>
        )
        : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
            {alineaciones.map((alineacion) => {
              const equipo = equipos[alineacion.lado];
              return (
                <div key={alineacion.lado} className="border-t border-[var(--fondo-sutil)] pb-3">
                  <h3 className="m-0 flex items-center gap-2.5 px-4 py-3 text-tabla font-bold text-[var(--texto)]">
                    <Escudo
                      equipoId={equipo.equipoId}
                      nombre={equipo.nombre}
                      clubId={equipo.clubId}
                      tieneEscudo={equipo.tieneEscudo}
                    />
                    <Link href={`/explorar/equipo/${equipo.equipoId}`} className="min-w-0 break-words hover:underline"
                      title={equipo.nombre}>
                      {equipo.nombreCorto ?? equipo.nombre}
                    </Link>
                    <span className="sr-only">{alineacion.lado === 'local' ? ' (local)' : ' (visitante)'}</span>
                  </h3>
                  <Grupo titulo="Titulares" jugadores={alineacion.titulares} eventos={eventos} />
                  <Grupo titulo="Suplentes" jugadores={alineacion.suplentes} eventos={eventos} />
                  <Grupo titulo="Convocados" jugadores={alineacion.convocados} eventos={eventos}
                    nota="La federación no publica si fueron titulares o suplentes." />
                  {alineacion.entrenador !== null && (
                    <p className="m-0 px-4 pt-2.5 text-nota text-[var(--texto-suave)]">
                      Entrenador: <span className="text-[var(--texto)]">{alineacion.entrenador}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </section>
  );
}

function Grupo({ titulo, jugadores, eventos, nota }: {
  titulo: string;
  jugadores: readonly JugadorDeActa[];
  eventos: readonly EventoDeActa[];
  nota?: string;
}) {
  if (jugadores.length === 0) return null;
  return (
    <div className="px-1">
      <h4 className="m-0 px-3 pt-1.5 pb-1 text-etiqueta font-semibold text-[var(--texto-suave)]">
        {titulo}
      </h4>
      {nota !== undefined && <p className="m-0 px-3 pb-1 text-nota text-[var(--texto-tenue)]">{nota}</p>}
      <ul className="m-0 list-none px-0">
        {jugadores.map((jugador) => {
          const marcas = marcasDeJugador(jugador.persona_id, eventos).map(textoMarca);
          return (
            <li key={`${jugador.persona_id}-${jugador.condicion}`}
              className="flex min-h-9 items-center gap-2.5 px-3 py-1">
              <span aria-hidden="true"
                className="flex size-[26px] flex-none items-center justify-center rounded-full bg-[var(--fondo-sutil)] text-nota font-bold text-[var(--texto)]">
                {jugador.dorsal ?? '—'}
              </span>
              <Link href={`/explorar/jugador/${jugador.persona_id}`}
                className="min-w-0 flex-1 break-words text-tabla text-[var(--texto)] hover:underline">
                {jugador.dorsal === null && <span className="sr-only">Sin dorsal. </span>}
                {jugador.persona}
              </Link>
              {marcas.length > 0 && (
                <span className="text-right text-nota whitespace-nowrap text-[var(--texto-suave)]">
                  {marcas.join(' · ')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
