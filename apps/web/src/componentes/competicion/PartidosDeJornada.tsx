import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPartidoCanonico } from '@/consultas/partidos';
import { Escudo } from '@/componentes/Escudo';
import { nombresDelPartido } from '@/lib/nombres-equipo';
import { marcadorDePartido } from '@/lib/pantalla-competicion';
import { fechaDePartido, type JornadaResumen, type PartidoDeJornada } from '@/lib/jornadas';
import { fechaCorta } from '@/lib/vocabulario-pantalla';
import { porcentajeCorto } from '@/lib/prediccion';

/**
 * Partidos de una jornada, con escudo, nombres cortos, marcador, campo y árbitro.
 *
 * Cada partido es una fila con los dos equipos **apilados en la misma columna** y, a la derecha, el
 * resultado, el campo y el árbitro. Es el mismo orden en móvil: así un nombre largo no necesita cuatro
 * líneas y el resultado queda siempre en el mismo sitio. Los equipos y el acta son enlaces reales.
 *
 * Reglas de datos:
 *  · un partido sin marcador se pinta «—» y NUNCA 0-0;
 *  · sin campo o sin árbitro no se inventa un hueco vacío;
 *  · el enlace al acta sólo aparece si la página pasa `hrefActa` y el partido tiene acta publicada.
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
          <ul className="m-0 list-none p-0">
            {partidos.map((partido) => {
              const marcador = marcadorDePartido({
                goles_local: partido.goles_local,
                goles_visitante: partido.goles_visitante,
                hora: null,
              });
              const nombres = nombresDelPartido(partido);
              const ganaLocal = marcador.jugado && (partido.goles_local ?? 0) > (partido.goles_visitante ?? 0);
              const ganaVisitante = marcador.jugado && (partido.goles_visitante ?? 0) > (partido.goles_local ?? 0);
              const hora = (partido.hora ?? '').trim();
              const campo = (partido.campo ?? '').trim();
              const arbitro = (partido.arbitro ?? '').trim();
              const acta = partido.calidad_acta !== null && hrefActa ? hrefActa(partido) : null;
              const enlaceEquipo = (id: number) => `/explorar/equipo/${id}` as Route;
              return (
                <li key={partido.match_id} className="border-t border-[var(--fondo-sutil)] px-3.5 py-2.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,44%)] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="flex min-w-0 flex-col gap-1">
                      <Link href={enlaceEquipo(partido.local_id)} title={nombres.completo_local}
                        className="flex min-w-0 items-center gap-2">
                        <Escudo equipoId={partido.local_id} nombre={partido.local}
                          clubId={partido.local_club_id} tieneEscudo={partido.local_tiene_escudo} />
                        <span className={`min-w-0 break-words text-tabla leading-tight text-[var(--texto)] ${ganaLocal ? 'font-bold' : 'font-medium'}`}>
                          {nombres.local}
                        </span>
                        <span className="sr-only">Local</span>
                      </Link>
                      <Link href={enlaceEquipo(partido.visitante_id)} title={nombres.completo_visitante}
                        className="flex min-w-0 items-center gap-2">
                        <Escudo equipoId={partido.visitante_id} nombre={partido.visitante}
                          clubId={partido.visitante_club_id} tieneEscudo={partido.visitante_tiene_escudo} />
                        <span className={`min-w-0 break-words text-tabla leading-tight text-[var(--texto)] ${ganaVisitante ? 'font-bold' : 'font-medium'}`}>
                          {nombres.visitante}
                        </span>
                        <span className="sr-only">Visitante</span>
                      </Link>
                    </div>
                    <div className="flex min-w-0 flex-col items-end gap-1 border-l border-[var(--fondo-sutil)] pl-2 text-right">
                      <span title={marcador.accesible}
                        className={marcador.jugado
                          ? 'whitespace-nowrap tabular-nums rounded-[var(--radius-md)] bg-[var(--fondo-fuerte)] px-1.5 py-0.5 text-tabla font-bold text-[var(--texto-fuerte)]'
                          : 'whitespace-nowrap tabular-nums rounded-[var(--radius-md)] bg-[var(--fondo-sutil)] px-1.5 py-0.5 text-tabla font-semibold text-[var(--texto-suave)]'}>
                        {marcador.texto}
                        <span className="sr-only">, {marcador.accesible}</span>
                      </span>
                      {!marcador.jugado && partido.pred_local != null && partido.pred_empate != null
                        && partido.pred_visitante != null && (
                        <span className="whitespace-nowrap tabular-nums text-etiqueta text-[var(--texto-suave)]"
                          title="Predicción 1-X-2 antes de jugar">
                          1 {porcentajeCorto(partido.pred_local)} · X {porcentajeCorto(partido.pred_empate)} · 2 {porcentajeCorto(partido.pred_visitante)}
                        </span>
                      )}
                      {hora !== '' && <span className="tabular-nums text-etiqueta text-[var(--texto-suave)]">{hora}</span>}
                      <span className="tabular-nums text-etiqueta text-[var(--texto-suave)]">
                        {fechaCorta(fechaDePartido(partido))}
                      </span>
                      {campo !== '' && (
                        <span className="flex max-w-full items-baseline justify-end gap-1 text-etiqueta leading-tight text-[var(--texto-suave)]"
                          title={`Campo: ${campo}`}>
                          <span className="flex-none text-etiqueta text-[var(--texto-suave)]">Campo</span>
                          <span className="min-w-0 break-words text-[var(--texto)]">{campo}</span>
                        </span>
                      )}
                      {arbitro !== '' && (
                        <span className="flex max-w-full items-baseline justify-end gap-1 text-etiqueta leading-tight text-[var(--texto-suave)]"
                          title={`Árbitro: ${arbitro}`}>
                          <span className="flex-none text-etiqueta text-[var(--texto-suave)]" aria-hidden="true">Árbitro</span>
                          <span className="sr-only">Árbitro: </span>
                          <span className="min-w-0 break-words text-[var(--texto)]">{arbitro}</span>
                        </span>
                      )}
                      {acta !== null && (
                        <Link href={acta as Route} className="text-etiqueta font-semibold text-[var(--accion)] hover:underline">
                          Acta
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
