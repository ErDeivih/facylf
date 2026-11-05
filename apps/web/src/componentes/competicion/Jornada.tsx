import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPartidoCanonico } from '@/consultas/partidos';
import { Escudo } from '@/componentes/Escudo';
import { nombresDelPartido } from '@/lib/nombres-equipo';
import { marcadorDePartido } from '@/lib/pantalla-competicion';

/**
 * Tarjeta de la jornada del prototipo: resultados de una jornada con sus flechas para moverse.
 *
 * Un partido sin marcador se enseña como «—», nunca como 0-0: son cosas distintas y confundirlas
 * convierte una jornada sin datos en una jornada con todos los partidos empatados a cero. Si la
 * federación publicó la hora, se enseña la hora; si no, el guion con su texto accesible.
 *
 * Los nombres van cortos cuando se pueden acortar con seguridad (`nombreCorto`), con el nombre completo
 * en el `title`; los escudos vienen en la misma fila del partido. El árbitro se pinta sólo si está
 * publicado, y el acta sólo si la página pasa `hrefActa` y el partido tiene acta analizada.
 */
export function Jornada({ numero, partidos, hrefAnterior, hrefSiguiente, hrefActa }: {
  numero: number | null;
  partidos: readonly FilaPartidoCanonico[];
  hrefAnterior: string | null;
  hrefSiguiente: string | null;
  hrefActa?: (partido: FilaPartidoCanonico) => string | null;
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
          <ul>
            {partidos.map((p) => {
              const marcador = marcadorDePartido(p);
              const nombres = nombresDelPartido(p);
              const ganaLocal = marcador.jugado && (p.goles_local ?? 0) > (p.goles_visitante ?? 0);
              const ganaVisitante = marcador.jugado && (p.goles_visitante ?? 0) > (p.goles_local ?? 0);
              const arbitro = (p.arbitro ?? '').trim();
              const hora = (p.hora ?? '').trim();
              const acta = p.calidad_acta !== null && hrefActa ? hrefActa(p) : null;
              const meta: Array<{ texto: string; etiqueta: string | null }> = [];
              if (hora !== '') meta.push({ texto: hora, etiqueta: null });
              if (arbitro !== '') meta.push({ texto: arbitro, etiqueta: 'Árbitro' });
              return (
                <li key={p.match_id} className="border-t border-[var(--fondo-sutil)] px-3.5 py-2">
                  <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_58px_minmax(0,1fr)] items-center gap-2 text-tabla text-[var(--texto)]">
                    <Link href={`/explorar/equipo/${p.local_id}`} title={nombres.completo_local}
                      className={`flex min-w-0 items-center justify-end gap-1.5 hover:underline ${ganaLocal ? 'font-bold' : 'font-medium'}`}>
                      <span className="min-w-0 truncate">{nombres.local}</span>
                      <Escudo equipoId={p.local_id} nombre={p.local}
                        clubId={p.local_club_id} tieneEscudo={p.local_tiene_escudo} />
                    </Link>
                    <span
                      title={marcador.accesible}
                      className={marcador.jugado
                        ? 'tabular-nums rounded-[var(--radius-md)] bg-[var(--fondo-fuerte)] py-1 text-center font-bold text-[var(--texto-fuerte)]'
                        : 'tabular-nums rounded-[var(--radius-md)] bg-[var(--fondo-sutil)] py-1 text-center font-semibold text-[var(--texto-suave)]'}>
                      {marcador.texto}
                      <span className="sr-only">, {marcador.accesible}</span>
                    </span>
                    <Link href={`/explorar/equipo/${p.visitante_id}`} title={nombres.completo_visitante}
                      className={`flex min-w-0 items-center gap-1.5 hover:underline ${ganaVisitante ? 'font-bold' : 'font-medium'}`}>
                      <Escudo equipoId={p.visitante_id} nombre={p.visitante}
                        clubId={p.visitante_club_id} tieneEscudo={p.visitante_tiene_escudo} />
                      <span className="min-w-0 truncate">{nombres.visitante}</span>
                    </Link>
                  </div>
                  {(meta.length > 0 || acta !== null) && (
                    <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-1.5 text-nota text-[var(--texto-suave)]">
                      {meta.map((pieza, i) => (
                        <span key={`${i}-${pieza.texto}`} className="flex items-center gap-1.5">
                          {i > 0 && <span aria-hidden="true">·</span>}
                          <span className={pieza.etiqueta === null ? 'tabular-nums' : 'truncate'}
                            title={pieza.etiqueta === null ? undefined : `${pieza.etiqueta}: ${pieza.texto}`}>
                            {pieza.etiqueta !== null && <span className="sr-only">{pieza.etiqueta}: </span>}
                            {pieza.texto}
                          </span>
                        </span>
                      ))}
                      {acta !== null && (
                        <span className="flex items-center gap-1.5">
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
