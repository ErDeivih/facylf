import Link from 'next/link';
import type { Route } from 'next';
import {
  fechaDeCambio, textoDeFechas, textoDeMinutos, textoDeTarjetas,
  type TemporadaDeHistorial, type TramoDeHistorial, type TransicionDeHistorial,
} from '@/lib/historial-jugador';

/**
 * Historial por temporada y por equipo.
 *
 * En escritorio es una tabla por temporada (equipos, fechas, partidos, titularidades, minutos, goles y
 * tarjetas) con una fila de aviso entre dos tramos cuando hay cambio de equipo/club, dos equipos a la vez
 * o fechas que no permiten afirmar un cambio. En móvil la misma información va en tarjetas, para no
 * arrastrar una tabla de nueve columnas: el documento nunca se desplaza en horizontal.
 *
 * Nunca se usa sólo color: los avisos dicen «Cambio de club», «Cambio de equipo», «Dos equipos a la vez»
 * con texto, y las tarjetas son «A 2 · R 1», no dos manchas.
 */
export function TablaHistorial({ temporadas }: { temporadas: readonly TemporadaDeHistorial[] }) {
  if (temporadas.length === 0) {
    return (
      <section aria-labelledby="historial"
        className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3.5">
        <h2 id="historial" className="m-0 text-bloque font-bold text-[var(--texto)]">Historial</h2>
        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">Sin historial de partidos publicado.</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {temporadas.map((temporada) => {
        const id = `temporada-${temporada.temporada}`;
        const minutos = textoDeMinutos({
          minutos: temporada.totales.minutos,
          minutosFiables: temporada.totales.minutosFiables,
          minutosEstimados: null,
        });
        return (
          <section key={temporada.temporada} aria-labelledby={id}
            className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
              <h2 id={id} className="m-0 text-bloque font-bold text-[var(--texto)]">{temporada.temporada}</h2>
              <p className="m-0 text-nota text-[var(--texto-suave)]">
                {temporada.totales.partidos} {temporada.totales.partidos === 1 ? 'partido' : 'partidos'}
                {' · '}{temporada.totales.titularidades} de titular
                {' · '}{minutos}
                {' · '}{temporada.totales.goles} {temporada.totales.goles === 1 ? 'gol' : 'goles'}
              </p>
            </div>

            {/* Escritorio: tabla. En móvil se oculta y se usan las tarjetas de abajo. */}
            <div data-tabla-scroll tabIndex={0} role="region"
              aria-label={`Historial de la temporada ${temporada.temporada}: desplázate en horizontal para ver todas las columnas`}
              className="relative hidden overflow-x-auto border-t border-[var(--fondo-sutil)] focus-visible:[outline-offset:-2px] md:block">
              <table className="w-full border-collapse text-left text-tabla" style={{ minWidth: 760 }}>
                <caption className="sr-only">
                  Historial de la temporada {temporada.temporada}: equipos, clubes, competición, fechas de
                  primera y última aparición, partidos, titularidades, minutos, goles y tarjetas.
                </caption>
                <thead>
                  <tr className="border-b border-[var(--borde)]">
                    {[
                      { texto: 'Equipo', titulo: null },
                      { texto: 'Club', titulo: null },
                      { texto: 'Competición', titulo: null },
                      { texto: 'Fechas', titulo: 'Primera y última aparición' },
                      { texto: 'PJ', titulo: 'Partidos con aparición en el acta' },
                      { texto: 'TIT', titulo: 'Partidos como titular' },
                      { texto: 'MIN', titulo: 'Minutos jugados, si son fiables' },
                      { texto: 'Goles', titulo: null },
                      { texto: 'Tarjetas', titulo: 'Amarillas y rojas' },
                    ].map((columna) => (
                      <th key={columna.texto} scope="col"
                        className="px-3 py-2 text-etiqueta font-semibold uppercase tracking-[0.05em] whitespace-nowrap text-[var(--texto-suave)]">
                        {columna.titulo === null
                          ? columna.texto
                          : <abbr title={columna.titulo} className="no-underline">{columna.texto}</abbr>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {temporada.tramos.map((tramo, i) => (
                    <FilaTabla key={tramo.equipoId} tramo={tramo}
                      transicion={temporada.transiciones[i]} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil: una tarjeta por equipo y el mismo aviso de cambio entre ellas. */}
            <div className="flex flex-col md:hidden">
              {temporada.tramos.map((tramo, i) => (
                <TarjetaTramo key={tramo.equipoId} tramo={tramo} transicion={temporada.transiciones[i]} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FilaTabla({ tramo, transicion }: { tramo: TramoDeHistorial; transicion?: TransicionDeHistorial }) {
  return (
    <>
      <tr className="border-b border-[var(--fondo-sutil)] last:border-b-0">
        <td className="px-3 py-2 align-middle">
          <Link href={`/explorar/equipo/${tramo.equipoId}` as Route}
            className="font-semibold text-[var(--accion)] hover:underline">
            {tramo.equipo}
          </Link>
          <span className="block text-nota text-[var(--texto-suave)]">{tramo.federacionNombre}</span>
        </td>
        <td className="px-3 py-2 align-middle">
          <Link href={`/explorar/club/${tramo.clubId}` as Route}
            className="text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
            {tramo.club}
          </Link>
        </td>
        <td className="px-3 py-2 align-middle">
          <Link href={`/explorar/competicion/${tramo.grupoId}` as Route}
            className="text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
            {tramo.edicion}
          </Link>
          <span className="block text-nota text-[var(--texto-suave)]">{tramo.grupo}</span>
        </td>
        <td className="px-3 py-2 align-middle whitespace-nowrap text-[var(--texto-suave)]">
          {textoDeFechas(tramo.desde, tramo.hasta) ?? 'Sin fechas publicadas'}
        </td>
        <td className="px-3 py-2 align-middle tabular-nums text-[var(--texto)]">{tramo.partidos}</td>
        <td className="px-3 py-2 align-middle tabular-nums text-[var(--texto)]">{tramo.titularidades}</td>
        <td className="px-3 py-2 align-middle whitespace-nowrap tabular-nums text-[var(--texto)]">
          {textoDeMinutos(tramo)}
        </td>
        <td className="px-3 py-2 align-middle tabular-nums text-[var(--texto)]">{tramo.goles}</td>
        <td className="px-3 py-2 align-middle whitespace-nowrap text-[var(--texto)]">{textoDeTarjetas(tramo)}</td>
      </tr>
      {transicion !== undefined && (
        <tr>
          <td colSpan={9} className="px-3 pb-2">
            <AvisoDeTransicion transicion={transicion} />
          </td>
        </tr>
      )}
    </>
  );
}

function TarjetaTramo({ tramo, transicion }: { tramo: TramoDeHistorial; transicion?: TransicionDeHistorial }) {
  return (
    <div className="border-t border-[var(--fondo-sutil)] px-4 py-3 first:border-t-0">
      <h3 className="m-0 text-cuerpo font-bold text-[var(--texto)]">
        <Link href={`/explorar/equipo/${tramo.equipoId}` as Route} className="hover:text-[var(--accion)] hover:underline">
          {tramo.equipo}
        </Link>
      </h3>
      <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">
        <Link href={`/explorar/club/${tramo.clubId}` as Route} className="hover:text-[var(--accion)] hover:underline">
          {tramo.club}
        </Link>
        {' · '}
        <Link href={`/explorar/competicion/${tramo.grupoId}` as Route} className="hover:text-[var(--accion)] hover:underline">
          {tramo.edicion}
        </Link>
      </p>
      <dl className="m-0 mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-nota">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--texto-suave)]">Fechas</dt>
          <dd className="m-0 text-right text-[var(--texto)]">{textoDeFechas(tramo.desde, tramo.hasta) ?? 'Sin fechas publicadas'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--texto-suave)]">Partidos</dt>
          <dd className="m-0 text-right tabular-nums text-[var(--texto)]">{tramo.partidos}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--texto-suave)]">Titular</dt>
          <dd className="m-0 text-right tabular-nums text-[var(--texto)]">{tramo.titularidades}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--texto-suave)]">Minutos</dt>
          <dd className="m-0 text-right tabular-nums text-[var(--texto)]">{textoDeMinutos(tramo)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--texto-suave)]">Goles</dt>
          <dd className="m-0 text-right tabular-nums text-[var(--texto)]">{tramo.goles}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--texto-suave)]">Tarjetas</dt>
          <dd className="m-0 text-right text-[var(--texto)]">{textoDeTarjetas(tramo)}</dd>
        </div>
      </dl>
      {transicion !== undefined && <div className="mt-2"><AvisoDeTransicion transicion={transicion} /></div>}
    </div>
  );
}

/** El aviso entre dos tramos. Dice qué pasó; no lo insinúa con un color ni con una flecha sola. */
function AvisoDeTransicion({ transicion }: { transicion: TransicionDeHistorial }) {
  const fecha = fechaDeCambio(transicion.fecha);
  const base = 'block rounded-[var(--radius-md)] border-l-4 px-3 py-2 text-nota';
  if (transicion.tipo === 'cambio-club' && fecha !== null) {
    return (
      <span className={`${base} border-l-[var(--accion)] bg-[var(--fondo-sutil)] text-[var(--texto)]`}>
        <b>Cambio de club</b> el {fecha}: de {transicion.desdeEquipo} a {transicion.hastaEquipo}.
      </span>
    );
  }
  if (transicion.tipo === 'cambio-equipo' && fecha !== null) {
    return (
      <span className={`${base} border-l-[var(--accion)] bg-[var(--fondo-sutil)] text-[var(--texto)]`}>
        <b>Cambio de equipo</b> el {fecha}, dentro del mismo club: de {transicion.desdeEquipo} a {transicion.hastaEquipo}.
      </span>
    );
  }
  if (transicion.tipo === 'simultaneo') {
    return (
      <span className={`${base} border-l-[var(--texto-tenue)] bg-[var(--fondo-sutil)] text-[var(--texto-suave)]`}>
        <b>Dos equipos a la vez:</b> las fechas de {transicion.desdeEquipo} y {transicion.hastaEquipo} se solapan;
        no fue un cambio.
      </span>
    );
  }
  return (
    <span className={`${base} border-l-[var(--texto-tenue)] bg-[var(--fondo-sutil)] text-[var(--texto-suave)]`}>
      No hay fechas suficientes para saber si hubo cambio entre {transicion.desdeEquipo} y {transicion.hastaEquipo}.
    </span>
  );
}
