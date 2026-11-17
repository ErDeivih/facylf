import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPartidoCanonico } from '@/consultas/partidos';
import { Escudo } from '@/componentes/Escudo';
import { nombresDelPartido } from '@/lib/nombres-equipo';
import { marcadorDePartido } from '@/lib/pantalla-competicion';
import { porcentajeCorto } from '@/lib/prediccion';

/**
 * Tarjeta de la jornada del prototipo: resultados de una jornada con sus flechas para moverse.
 *
 * Cada fila apila local y visitante en la izquierda y deja a la derecha el marcador, el campo, el
 * árbitro y el acta. Los nombres van cortos (`nombreCorto`), con el completo en el `title`; los
 * equipos y el acta son enlaces reales. Un partido sin marcador se enseña «—», nunca 0-0.
 */
export function Jornada({ numero, partidos, hrefAnterior, hrefSiguiente, hrefActa, etiquetas }: {
  numero: number | null;
  partidos: readonly FilaPartidoCanonico[];
  hrefAnterior: string | null;
  hrefSiguiente: string | null;
  hrefActa?: (partido: FilaPartidoCanonico) => string | null;
  /** Zona de cada equipo (asciende, fase de ascenso, permanencia, desciende). */
  etiquetas?: ReadonlyMap<number, string>;
}) {
  const flecha = 'flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--borde)] bg-[var(--fondo-elevado)] text-lg';
  return (
    <section aria-labelledby="jornada"
      className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="flex items-center justify-between py-2.5 pr-2.5 pl-4">
        <h2 id="jornada" className="m-0 text-bloque font-bold text-[var(--texto)]">
          {numero !== null ? `Jornada ${numero}` : 'Jornada'}
        </h2>
        <div className="flex gap-1">
          {hrefAnterior
            ? (
              <Link href={hrefAnterior as Route} aria-label="Jornada anterior"
                className={`${flecha} text-[var(--texto-suave)]`}>
                ‹
              </Link>
            )
            : (
              <span aria-disabled="true" className={`${flecha} cursor-not-allowed border-dashed text-[var(--texto-suave)]`}>‹</span>
            )}
          {hrefSiguiente
            ? (
              <Link href={hrefSiguiente as Route} aria-label="Jornada siguiente"
                className={`${flecha} text-[var(--texto-suave)]`}>
                ›
              </Link>
            )
            : (
              <span aria-disabled="true" className={`${flecha} cursor-not-allowed border-dashed text-[var(--texto-suave)]`}>›</span>
            )}
        </div>
      </div>
      {partidos.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Sin partidos publicados.
          </p>
        )
        : (
          <ul className="m-0 list-none p-0">
            {partidos.map((p) => {
              const marcador = marcadorDePartido(p);
              const nombres = nombresDelPartido(p);
              const ganaLocal = marcador.jugado && (p.goles_local ?? 0) > (p.goles_visitante ?? 0);
              const ganaVisitante = marcador.jugado && (p.goles_visitante ?? 0) > (p.goles_local ?? 0);
              const arbitro = (p.arbitro ?? '').trim();
              const hora = (p.hora ?? '').trim();
              const campo = (p.campo ?? '').trim();
              const acta = p.calidad_acta !== null && hrefActa ? hrefActa(p) : null;
              const enlaceEquipo = (id: number) => `/explorar/equipo/${id}` as Route;
              return (
                <li key={p.match_id} className="border-t border-[var(--fondo-sutil)] px-3.5 py-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,45%)] items-start gap-2">
                    <div className="flex min-w-0 flex-col gap-1">
                      <Link href={enlaceEquipo(p.local_id)} title={nombres.completo_local}
                        className="flex min-w-0 items-center gap-2">
                        <Escudo equipoId={p.local_id} nombre={p.local}
                          clubId={p.local_club_id} tieneEscudo={p.local_tiene_escudo} />
                        <span className={`min-w-0 break-words text-tabla leading-tight text-[var(--texto)] ${ganaLocal ? 'font-bold' : 'font-medium'}`}>
                          {nombres.local}
                          {etiquetas?.get(p.local_id) && <span className="ml-1 rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-1 text-etiqueta font-normal text-[var(--texto-suave)]">{etiquetas.get(p.local_id)}</span>}
                        </span>
                      </Link>
                      <Link href={enlaceEquipo(p.visitante_id)} title={nombres.completo_visitante}
                        className="flex min-w-0 items-center gap-2">
                        <Escudo equipoId={p.visitante_id} nombre={p.visitante}
                          clubId={p.visitante_club_id} tieneEscudo={p.visitante_tiene_escudo} />
                        <span className={`min-w-0 break-words text-tabla leading-tight text-[var(--texto)] ${ganaVisitante ? 'font-bold' : 'font-medium'}`}>
                          {nombres.visitante}
                          {etiquetas?.get(p.visitante_id) && <span className="ml-1 rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-1 text-etiqueta font-normal text-[var(--texto-suave)]">{etiquetas.get(p.visitante_id)}</span>}
                        </span>
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
                      {p.pred_local != null && p.pred_empate != null && p.pred_visitante != null && (
                        <span className="whitespace-nowrap tabular-nums text-etiqueta text-[var(--texto-suave)]"
                          title="Predicción 1-X-2">
                          1 {porcentajeCorto(p.pred_local)} · X {porcentajeCorto(p.pred_empate)} · 2 {porcentajeCorto(p.pred_visitante)}
                        </span>
                      )}
                      {hora !== '' && <span className="tabular-nums text-etiqueta text-[var(--texto-suave)]">{hora}</span>}
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
