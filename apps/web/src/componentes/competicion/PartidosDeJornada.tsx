import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPartidoCanonico } from '@/consultas/partidos';
import { Escudo } from '@/componentes/Escudo';
import { fechaDePartido, type JornadaResumen, type PartidoDeJornada } from '@/lib/jornadas';
import { marcadorDePartido } from '@/lib/pantalla-competicion';
import { fechaCorta } from '@/lib/vocabulario-pantalla';

/**
 * Partidos de una jornada, con escudo, nombres, marcador, hora y campo.
 *
 * Tres reglas que el componente hace cumplir y que son el motivo de que exista:
 *  · un partido sin marcador se pinta «—» y NUNCA 0-0: un cero se lee como un partido jugado;
 *  · sin hora publicada no hay hueco de hora (nada de 00:00), y sin campo tampoco;
 *  · el enlace al acta sólo existe si la pantalla de acta existe. Se recibe por `hrefActa` y hoy no se
 *    pasa porque esa pantalla todavía no está: un enlace muerto se ve igual que uno bueno hasta que se
 *    pulsa. Cuando exista, se pasa desde la página y sólo se enlazan los partidos con acta publicada.
 *
 * Los escudos vienen en la MISMA fila del partido (`local_club_id`/`local_tiene_escudo` y sus parejas de
 * visitante): con escudo guardado se sirve `/api/escudo/club/<id>` y, si no lo hay, el marcador de
 * posición determinista de `Escudo`. Una jornada de ocho partidos pinta sus dieciséis escudos sin una
 * petición por equipo.
 */
export function PartidosDeJornada({ jornada, partidos, hrefActa }: {
  jornada: JornadaResumen;
  partidos: readonly PartidoDeJornada[];
  hrefActa?: (partido: FilaPartidoCanonico) => string | null;
}) {
  return (
    <section aria-labelledby="partidos"
      className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="px-4 py-3.5">
        <h2 id="partidos" className="m-0 text-bloque font-bold text-[var(--texto)]">
          Partidos
          <span className="sr-only"> de la jornada {jornada.numero}</span>
        </h2>
      </div>
      {partidos.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Sin partidos publicados.
          </p>
        )
        : (
          <ul>
            {partidos.map((partido) => {
              // La hora se enseña en su propia línea, así que el marcador es sólo el resultado (o «—»).
              const marcador = marcadorDePartido({
                goles_local: partido.goles_local,
                goles_visitante: partido.goles_visitante,
                hora: null,
              });
              const ganaLocal = marcador.jugado && (partido.goles_local ?? 0) > (partido.goles_visitante ?? 0);
              const ganaVisitante = marcador.jugado && (partido.goles_visitante ?? 0) > (partido.goles_local ?? 0);
              const meta = [
                fechaCorta(fechaDePartido(partido)),
                (partido.hora ?? '').trim() !== '' ? partido.hora!.trim() : null,
                (partido.campo ?? '').trim() !== '' ? partido.campo!.trim() : null,
              ].filter((pieza): pieza is string => pieza !== null);
              const acta = partido.calidad_acta !== null && hrefActa ? hrefActa(partido) : null;
              return (
                <li key={partido.match_id} className="border-t border-[var(--fondo-sutil)] px-3.5 py-2.5">
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
                      title={marcador.accesible}
                      className={marcador.jugado
                        ? 'tabular-nums rounded-[var(--radius-md)] bg-[var(--fondo-fuerte)] py-1 text-center font-bold text-[var(--texto-fuerte)]'
                        : 'tabular-nums rounded-[var(--radius-md)] bg-[var(--fondo-sutil)] py-1 text-center font-semibold text-[var(--texto-suave)]'}>
                      {marcador.texto}
                      <span className="sr-only">, {marcador.accesible}</span>
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
                  {(meta.length > 0 || acta !== null) && (
                    <p className="m-0 mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-nota text-[var(--texto-suave)]">
                      {meta.map((pieza, i) => (
                        <span key={`${i}-${pieza}`} className="flex items-center gap-2">
                          {i > 0 && <span aria-hidden="true">·</span>}
                          {pieza}
                        </span>
                      ))}
                      {acta !== null && (
                        <span className="flex items-center gap-2">
                          {meta.length > 0 && <span aria-hidden="true">·</span>}
                          <Link href={acta as Route} className="font-semibold text-[var(--accion)] hover:underline">
                            Acta
                          </Link>
                        </span>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
