import Link from 'next/link';
import type { Route } from 'next';
import type { FilaEquipo, FilaJugadorDePlantilla, FilaPartidoDeEquipo } from '@/consultas/entidades';
import { insigniaForma } from '@/lib/forma-equipo';
import { estiloForma } from '@/lib/pantalla-competicion';
import {
  fechaDeValor, formatoNumero, porcentajeDeMinutos, type ResumenDeEquipo, type TramoCompleto,
} from '@/lib/fichas';
import { fechaCorta } from '@/lib/vocabulario-pantalla';

/**
 * Las secciones de la ficha de equipo, contra `prototipo/Equipo.dc.html`.
 *
 * Enseña la temporada tal y como la publicaron las actas: el puesto, la racha, cómo reparte los
 * resultados en casa y fuera, los goles, cómo se reparten por tramos del partido, la plantilla que
 * aparece en las actas y los últimos resultados.
 *
 * Un partido sin marcador no suma como 0-0: la racha y los goles cuentan sólo lo jugado, y la ficha lo
 * dice. Los nombres de los jugadores se publican enteros, también los de los menores (§9); no hay
 * ninguna foto de persona.
 */

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
const ETIQUETA = 'text-etiqueta font-semibold text-[var(--texto-suave)]';

const SIGNO_DE_RESULTADO: Record<string, 'G' | 'E' | 'P' | null> = {
  ganado: 'G', empatado: 'E', perdido: 'P', sin_resultado: null,
};

/** Tira de victorias, empates y derrotas: color Y la cifra escrita, nunca sólo color. */
function TiraDeResultados({ balance }: { balance: { ganados: number; empatados: number; perdidos: number } }) {
  const total = balance.ganados + balance.empatados + balance.perdidos;
  if (total === 0) return <span className="text-nota text-[var(--texto-suave)]">Sin partidos</span>;
  const tramos = [
    { clave: 'G' as const, n: balance.ganados, texto: 'ganados' },
    { clave: 'E' as const, n: balance.empatados, texto: 'empatados' },
    { clave: 'P' as const, n: balance.perdidos, texto: 'perdidos' },
  ].filter((t) => t.n > 0);
  return (
    <span className="flex h-6 w-full gap-[2px]" role="img"
      aria-label={tramos.map((t) => `${t.n} ${t.texto}`).join(', ')}>
      {tramos.map((t) => {
        // El fondo se oscurece con `estiloForma` para que la cifra se lea también en tema claro:
        // el token crudo de victoria con texto casi blanco se queda en 4,16:1 (por debajo de AA).
        const estilo = estiloForma(t.clave);
        return (
          <span key={t.clave} aria-hidden="true"
            className="flex items-center justify-center rounded-[4px] text-etiqueta font-bold"
            style={{ flex: t.n, ...estilo }}>
            {t.n}
          </span>
        );
      })}
    </span>
  );
}

export function ResumenDelEquipo({ equipo, resumen }: { equipo: FilaEquipo; resumen: ResumenDeEquipo }) {
  const golesFavor = equipo.goles_favor_reconstruidos;
  const golesContra = equipo.goles_contra_reconstruidos;
  return (
    <section aria-label="Resumen de la temporada" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
      <article className={`${TARJETA} flex flex-col gap-1.5 p-3.5`}>
        <span className={ETIQUETA}>Posición</span>
        <span className="text-dato font-extrabold tabular-nums text-[var(--texto)]">
          {equipo.posicion === null ? <span className="text-cuerpo font-semibold text-[var(--texto-suave)]">Sin datos</span> : `${equipo.posicion}º`}
        </span>
        <span className="text-nota leading-5 text-[var(--texto-suave)]">
          {equipo.puntos === null || equipo.jugados === null
            ? 'Sin clasificación publicada'
            : `${formatoNumero(equipo.puntos)} puntos en ${formatoNumero(equipo.jugados)} partidos`}
        </span>
      </article>
      <article className={`${TARJETA} flex flex-col gap-1.5 p-3.5`}>
        <span className={ETIQUETA}>Racha</span>
        <span className="flex gap-1">
          {resumen.racha.length === 0
            ? <span className="text-cuerpo font-semibold text-[var(--texto-suave)]">Sin datos</span>
            : resumen.racha.map((signo, i) => {
              const { letra, etiqueta } = insigniaForma(signo);
              return (
                <span key={`${letra}-${i}`} role="img" aria-label={etiqueta} title={etiqueta}
                  className="flex size-6 items-center justify-center rounded-[var(--radius-md)] text-etiqueta font-bold"
                  style={estiloForma(signo)}>
                  {letra}
                </span>
              );
            })}
        </span>
        <span className="text-nota leading-5 text-[var(--texto-suave)]">
          {resumen.jugados === 0 ? 'Sin partidos jugados' : `${formatoNumero(resumen.jugados)} partidos jugados`}
          {resumen.sinResultado > 0 ? ` · ${resumen.sinResultado} sin resultado` : ''}
        </span>
      </article>
      <article className={`${TARJETA} flex flex-col gap-1.5 p-3.5`}>
        <span className={ETIQUETA}>Casa y fuera</span>
        <span className="flex flex-col gap-1.5">
          <span className="grid grid-cols-[38px_minmax(0,1fr)] items-center gap-2">
            <span className="text-nota text-[var(--texto-suave)]">Casa</span>
            <TiraDeResultados balance={resumen.casa} />
          </span>
          <span className="grid grid-cols-[38px_minmax(0,1fr)] items-center gap-2">
            <span className="text-nota text-[var(--texto-suave)]">Fuera</span>
            <TiraDeResultados balance={resumen.fuera} />
          </span>
        </span>
        <span className="text-nota leading-5 text-[var(--texto-suave)]">Victorias, empates y derrotas</span>
      </article>
      <article className={`${TARJETA} flex flex-col gap-1.5 p-3.5`}>
        <span className={ETIQUETA}>Goles</span>
        <span className="text-dato font-extrabold tabular-nums text-[var(--texto)]">
          {golesFavor === null || golesContra === null
            ? <span className="text-cuerpo font-semibold text-[var(--texto-suave)]">Sin datos</span>
            : `${formatoNumero(golesFavor)} : ${formatoNumero(golesContra)}`}
        </span>
        <span className="text-nota leading-5 text-[var(--texto-suave)]">A favor y en contra en la temporada</span>
      </article>
    </section>
  );
}

export function GolesPorTramo({ tramos }: { tramos: readonly TramoCompleto[] | null }) {
  const maximo = tramos === null ? 1 : Math.max(1, ...tramos.map((t) => Math.max(t.favor, t.contra)));
  return (
    <section aria-labelledby="goles-tramo" className={`${TARJETA} flex flex-col gap-3 p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="goles-tramo" className="m-0 text-bloque font-bold text-[var(--texto)]">Goles por tramo del partido</h2>
        <span className="flex flex-wrap gap-3 text-nota text-[var(--texto-suave)]">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-[var(--accion)]" />a favor
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-[var(--zona-permanencia)]" />en contra
          </span>
        </span>
      </div>
      {tramos === null
        ? <p className="m-0 text-tabla text-[var(--texto-suave)]">No hay actas con el minuto de los goles.</p>
        : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {tramos.map((tramo) => (
              <li key={tramo.tramo} className="grid grid-cols-[1fr_60px_1fr] items-center gap-2 text-nota">
                <span className="flex items-center justify-end gap-1.5">
                  <span className="font-bold tabular-nums text-[var(--texto)]">{tramo.favor}</span>
                  <span aria-hidden="true" className="h-4 rounded-l-[4px] bg-[var(--accion)]"
                    style={{ width: `${Math.round((tramo.favor / maximo) * 100)}%` }} />
                </span>
                <span className="text-center text-[var(--texto-suave)]">{tramo.tramo}′</span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-4 rounded-r-[4px] bg-[var(--zona-permanencia)]"
                    style={{ width: `${Math.round((tramo.contra / maximo) * 100)}%` }} />
                  <span className="font-bold tabular-nums text-[var(--texto)]">{tramo.contra}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      <p className="m-0 text-nota leading-5 text-[var(--texto-suave)]">
        Sólo los goles con minuto publicado en el acta. Los de propia puerta cuentan para el rival.
      </p>
    </section>
  );
}

export function PlantillaDelEquipo({ filas, partidosElegibles }: {
  filas: readonly FilaJugadorDePlantilla[];
  partidosElegibles: number | null;
}) {
  const posibles = partidosElegibles !== null ? partidosElegibles * 90 : null;
  return (
    <section aria-labelledby="plantilla" className={`${TARJETA} overflow-hidden`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
        <h2 id="plantilla" className="m-0 text-bloque font-bold text-[var(--texto)]">Plantilla</h2>
        <span className="text-nota text-[var(--texto-suave)]">
          {posibles === null ? 'Minutos sobre los partidos del equipo' : `Minutos sobre ${formatoNumero(posibles)} posibles`}
        </span>
      </div>
      {filas.length === 0
        ? <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">Sin jugadores en las actas.</p>
        : (
          <div data-tabla-scroll tabIndex={0} role="region"
            aria-label="Plantilla: desplázate en horizontal para ver todas las columnas"
            className="relative overflow-x-auto focus-visible:[outline-offset:-2px]">
            <table className="w-full border-separate border-spacing-0 text-tabla" style={{ minWidth: 620 }}>
              <caption className="sr-only">
                Jugadores que aparecen en las actas del equipo, con partidos, titularidades, minutos, goles y tarjetas.
              </caption>
              <thead>
                <tr className="text-right text-etiqueta text-[var(--texto-suave)]">
                  <th scope="col" className="sticky left-0 z-[var(--capa-pegajoso)] bg-[var(--fondo-elevado)] py-2 pl-4 pr-1.5 text-left font-semibold">Jugador</th>
                  <th scope="col" className="px-1.5 py-2 font-semibold">PJ</th>
                  <th scope="col" className="px-1.5 py-2 font-semibold">Tit.</th>
                  <th scope="col" className="px-1.5 py-2 text-left font-semibold">Minutos</th>
                  <th scope="col" className="px-1.5 py-2 font-semibold">Goles</th>
                  <th scope="col" className="py-2 pl-1.5 pr-4 font-semibold">Tarjetas</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => {
                  const minimos = fila.minutos_exactos;
                  const pct = minimos !== null && posibles !== null && posibles > 0
                    ? Math.min(100, Math.round((minimos / posibles) * 100))
                    : porcentajeDeMinutos(minimos, partidosElegibles);
                  return (
                    <tr key={fila.persona_id} className="text-right">
                      <td className="sticky left-0 z-[var(--capa-pegajoso)] border-t border-[var(--fondo-sutil)] bg-[var(--fondo-elevado)] py-1.5 pl-4 pr-1.5 text-left">
                        <Link href={`/explorar/jugador/${fila.persona_id}` as Route}
                          className="flex min-h-8 items-center gap-2.5 text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
                          <span aria-hidden="true" title={fila.dorsales ?? undefined}
                            className="flex size-[26px] flex-none items-center justify-center rounded-full bg-[var(--fondo-sutil)] text-etiqueta font-bold text-[var(--texto-suave)]">
                            {/* El acta puede traer varios dorsales en la temporada; el círculo es pequeño
                                para todos, así que se enseña el primero y el resto queda en el `title`. */}
                            {fila.dorsales ? fila.dorsales.split('·')[0]!.trim() : ''}
                          </span>
                          <span className="font-semibold">{fila.nombre_mostrado}</span>
                          <span className="text-nota text-[var(--texto-suave)]">
                            {fila.portero ? 'POR' : 'JUG'}
                          </span>
                        </Link>
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-[var(--texto-suave)]">{fila.partidos_con_aparicion}</td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-[var(--texto-suave)]">
                        {fila.titularidades === null ? '—' : fila.titularidades}
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-left">
                        {minimos === null
                          ? <span className="text-[var(--texto-suave)]">{fila.minutos_fiables === false ? 'Sin datos exactos' : 'Sin datos'}</span>
                          : (
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-full max-w-40 overflow-hidden rounded-full bg-[var(--fondo-sutil)]">
                                <span aria-hidden="true" className="block h-full bg-[var(--accion)]"
                                  style={{ width: `${pct ?? 0}%` }} />
                              </span>
                              <span className="w-16 shrink-0 text-right text-nota tabular-nums text-[var(--texto-suave)]">
                                {fila.minutos_fiables === false ? '≥ ' : ''}{formatoNumero(minimos)}
                              </span>
                            </span>
                          )}
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 font-bold text-[var(--texto)]">
                        {fila.goles === null ? 'Sin datos' : fila.goles}
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] py-1.5 pl-1.5 pr-4 text-[var(--texto-suave)]">
                        {fila.amarillas === null && fila.rojas === null
                          ? 'Sin datos'
                          : `${fila.amarillas ?? 0} · ${fila.rojas ?? 0}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}

export function UltimosResultados({ partidos, grupoId }: {
  partidos: readonly FilaPartidoDeEquipo[];
  grupoId: number;
}) {
  return (
    <section aria-labelledby="ultimos-resultados" className={`${TARJETA} overflow-hidden`}>
      <div className="px-4 py-3.5">
        <h2 id="ultimos-resultados" className="m-0 text-bloque font-bold text-[var(--texto)]">Últimos resultados</h2>
      </div>
      {partidos.length === 0
        ? <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">Sin partidos publicados.</p>
        : (
          <ul className="m-0 list-none p-0">
            {partidos.map((partido) => {
              const signo = SIGNO_DE_RESULTADO[partido.resultado] ?? null;
              const insignia = signo === null ? null : insigniaForma(signo);
              const fecha = fechaDeValor(partido.fecha) ?? fechaDeValor(partido.fecha_prevista);
              const jugado = partido.goles_propios !== null && partido.goles_rival !== null;
              return (
                <li key={partido.partido_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-tabla">
                  <span className="w-8 flex-none text-nota tabular-nums text-[var(--texto-suave)]">
                    {partido.jornada_numero === null
                      ? '—'
                      : (
                        <Link href={`/explorar/competicion/${grupoId}/jornada/${partido.jornada_numero}` as Route}
                          className="hover:text-[var(--accion)] hover:underline">J{partido.jornada_numero}</Link>
                      )}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    {insignia && (
                      <span role="img" aria-label={insignia.etiqueta} title={insignia.etiqueta}
                        className="flex size-6 flex-none items-center justify-center rounded-[var(--radius-md)] text-etiqueta font-bold"
                        style={estiloForma(signo!)}>
                        {insignia.letra}
                      </span>
                    )}
                    <span className="min-w-0 truncate font-semibold text-[var(--texto)]">
                      {partido.condicion === 'casa' ? 'contra' : 'en'} {partido.rival}
                    </span>
                  </span>
                  <span className="tabular-nums font-bold text-[var(--texto)]">
                    {jugado ? `${partido.goles_propios}-${partido.goles_rival}` : '—'}
                  </span>
                  <span className="w-16 flex-none text-right text-nota text-[var(--texto-suave)]">
                    {fechaCorta(fecha) ?? 'Sin fecha'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
