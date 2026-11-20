import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPersona, FilaTemporadaDePersona } from '@/consultas/entidades';
import type { FilaPartidoDePersona } from '@/consultas/fichas';
import {
  fechaDeValor, formatoNumero, golesCadaMinutos, porcentajeDeMinutos, type MinutosDeUnaTemporada,
  type TotalesDeCarrera,
} from '@/lib/fichas';
import { fechaCorta } from '@/lib/vocabulario-pantalla';

/**
 * Las secciones de la ficha de jugador, contra `prototipo/Jugador.dc.html`.
 *
 * Lo que se enseña es lo que hay en las actas: partidos, titularidades, minutos, goles y tarjetas de
 * cada temporada y de su carrera. Lo que no se sabe se dice («sin datos») y nunca se convierte en un
 * cero; y si los minutos de alguna acta no se pueden calcular, el total se marca con «≥», que significa
 * «lo seguro, no el total» (la misma regla del prototipo).
 *
 * Ninguna sección pinta fotos de personas: el nombre sí se publica, la cara no (§9).
 */

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
const ETIQUETA = 'text-etiqueta font-semibold text-[var(--texto-suave)]';

/** Cifra con su nota. Si no se sabe, «Sin datos»; nunca un cero de relleno. */
function Cifra({ valor, sufijo, nota }: { valor: number | null; sufijo?: string; nota?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-dato font-extrabold tabular-nums text-[var(--texto)]">
        {valor === null ? <span className="text-cuerpo font-semibold text-[var(--texto-suave)]">Sin datos</span> : formatoNumero(valor)}
        {valor !== null && sufijo ? <span className="ml-1 text-nota font-semibold text-[var(--texto-suave)]">{sufijo}</span> : null}
      </span>
      {nota && <span className="text-nota leading-5 text-[var(--texto-suave)]">{nota}</span>}
    </div>
  );
}

export function TotalesJugador({ totales }: { totales: TotalesDeCarrera }) {
  const minutos = totales.minutos === null
    ? 'Sin datos'
    : `${totales.minutosFiables ? '' : '≥ '}${formatoNumero(totales.minutos)}`;
  const ratio = golesCadaMinutos(totales.goles, totales.minutos);
  return (
    <section aria-labelledby="totales-jugador" className="flex flex-col gap-3">
      <h2 id="totales-jugador" className="sr-only">Totales de su carrera</h2>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <article className={`${TARJETA} flex flex-col gap-1 p-3.5`}>
          <span className={ETIQUETA}>Minutos</span>
          <span className="text-dato font-extrabold tabular-nums text-[var(--texto)]">{minutos}</span>
          <span className="text-nota leading-5 text-[var(--texto-suave)]">
            {totales.minutosFiables ? 'Minutos exactos de todas sus actas' : 'Alguna acta no permite calcular todos sus minutos'}
          </span>
        </article>
        <article className={`${TARJETA} flex flex-col gap-1 p-3.5`}>
          <span className={ETIQUETA}>Titular</span>
          <Cifra valor={totales.titularidades} sufijo={totales.partidos > 0 ? `de ${formatoNumero(totales.partidos)} partidos` : undefined} />
          <span className="text-nota leading-5 text-[var(--texto-suave)]">
            {totales.suplencias === null ? 'Suplencias sin datos' : `${formatoNumero(totales.suplencias)} como suplente`}
          </span>
        </article>
        <article className={`${TARJETA} flex flex-col gap-1 p-3.5`}>
          <span className={ETIQUETA}>Goles</span>
          <Cifra valor={totales.goles} sufijo={ratio === null ? undefined : `· 1 cada ${formatoNumero(ratio)}′`} />
          <span className="text-nota leading-5 text-[var(--texto-suave)]">
            Los de propia puerta no cuentan para él
          </span>
        </article>
        <article className={`${TARJETA} flex flex-col gap-1 p-3.5`}>
          <span className={ETIQUETA}>Disciplina</span>
          <span className="flex items-center gap-3 text-dato font-extrabold tabular-nums text-[var(--texto)]">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-[17px] w-[13px] rounded-[3px] bg-[var(--amarilla)]" />
              {totales.amarillas === null ? 'Sin datos' : formatoNumero(totales.amarillas)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-[17px] w-[13px] rounded-[3px] bg-[var(--roja)]" />
              {totales.rojas === null ? 'Sin datos' : formatoNumero(totales.rojas)}
            </span>
          </span>
          <span className="text-nota leading-5 text-[var(--texto-suave)]">Amarillas y rojas en las actas</span>
        </article>
      </div>
    </section>
  );
}

export function MinutosPorTemporada({ filas }: { filas: readonly MinutosDeUnaTemporada[] }) {
  const maximo = Math.max(1, ...filas.map((f) => f.minutos ?? 0));
  return (
    <section aria-labelledby="minutos-temporada" className={`${TARJETA} flex flex-col gap-3 p-4`}>
      <h2 id="minutos-temporada" className="m-0 text-bloque font-bold text-[var(--texto)]">Minutos por temporada</h2>
      {filas.length === 0
        ? <p className="m-0 text-tabla text-[var(--texto-suave)]">Sin temporadas con actas.</p>
        : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {filas.map((fila) => {
              const texto = fila.minutos === null
                ? 'Sin datos'
                : `${fila.fiables ? '' : '≥ '}${formatoNumero(fila.minutos)}′`;
              return (
                <li key={fila.temporada} className="grid grid-cols-[64px_minmax(0,1fr)_84px] items-center gap-2.5">
                  <span className="text-tabla font-bold tabular-nums text-[var(--texto)]">{fila.temporada}</span>
                  <span role="img" aria-label={`${fila.temporada}: ${texto} minutos`}
                    className="h-5 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)]">
                    <span aria-hidden="true" className="block h-full bg-[var(--accion)]"
                      style={{ width: `${Math.round(((fila.minutos ?? 0) / maximo) * 100)}%` }} />
                  </span>
                  <span className="text-right text-tabla font-bold tabular-nums text-[var(--texto)]">{texto}</span>
                </li>
              );
            })}
          </ul>
        )}
      <p className="m-0 text-nota leading-5 text-[var(--texto-suave)]">
        «≥» = alguna acta de esa temporada no permite calcular todos sus minutos: la cifra es lo seguro.
      </p>
    </section>
  );
}

export function TablaTrayectoria({ filas }: { filas: readonly FilaTemporadaDePersona[] }) {
  return (
    <section aria-labelledby="trayectoria" className={`${TARJETA} overflow-hidden`}>
      <div className="px-4 py-3.5">
        <h2 id="trayectoria" className="m-0 text-bloque font-bold text-[var(--texto)]">Temporada a temporada</h2>
      </div>
      {filas.length === 0
        ? <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">Sin temporadas con actas.</p>
        : (
          <>
          <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2 text-nota text-[var(--texto-suave)] md:hidden">Desplaza para ver PJ, titularidades, minutos, goles y tarjetas.</p>
          <div data-tabla-scroll tabIndex={0} role="region"
            aria-label="Trayectoria: desplázate en horizontal para ver todas las columnas"
            className="relative overflow-x-auto focus-visible:[outline-offset:-2px]">
            <table className="w-full border-separate border-spacing-0 text-tabla" style={{ minWidth: 720 }}>
              <caption className="sr-only">
                Temporadas y equipos del jugador, con partidos, titularidades, minutos, goles y tarjetas de cada uno.
              </caption>
              <thead>
                <tr className="text-right text-etiqueta text-[var(--texto-suave)]">
                  <th scope="col" className="sticky left-0 z-[var(--capa-pegajoso)] bg-[var(--fondo-elevado)] py-2 pl-4 pr-1.5 text-left font-semibold">Temporada</th>
                  <th scope="col" className="px-1.5 py-2 text-left font-semibold">Equipo</th>
                  <th scope="col" className="px-1.5 py-2 text-left font-semibold">Competición</th>
                  <th scope="col" className="px-1.5 py-2 font-semibold" title="Partidos jugados">PJ</th>
                  <th scope="col" className="px-1.5 py-2 font-semibold">Tit.</th>
                  <th scope="col" className="px-1.5 py-2 font-semibold">Minutos</th>
                  <th scope="col" className="px-1.5 py-2 font-semibold">Goles</th>
                  <th scope="col" className="py-2 pl-1.5 pr-4 font-semibold">Tarjetas</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => {
                  const minutos = fila.minutos_exactos === null
                    ? 'Sin datos'
                    : `${fila.minutos_fiables === true ? '' : '≥ '}${formatoNumero(fila.minutos_exactos)}`;
                  const pct = porcentajeDeMinutos(fila.minutos_exactos, fila.partidos_elegibles);
                  return (
                    <tr key={`${fila.temporada}-${fila.equipo_id}`} className="text-right">
                      <td className="sticky left-0 z-[var(--capa-pegajoso)] whitespace-nowrap border-t border-[var(--fondo-sutil)] bg-[var(--fondo-elevado)] py-1.5 pl-4 pr-1.5 text-left font-semibold tabular-nums text-[var(--texto)]">
                        {fila.temporada}
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-left">
                        <Link href={`/explorar/equipo/${fila.equipo_id}` as Route}
                          className="font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline"
                          title={fila.nombre_en_fuente}>
                          {fila.club}
                        </Link>
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-left">
                        <span className="block text-[var(--texto)]">{fila.edicion}</span>
                        <span className="block text-nota text-[var(--texto-suave)]">{fila.federacion_nombre}</span>
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-[var(--texto-suave)]">
                        {formatoNumero(fila.partidos_con_aparicion)}
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-[var(--texto-suave)]">
                        {fila.titularidades === null ? '—' : formatoNumero(fila.titularidades)}
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 font-bold text-[var(--texto)]">
                        {minutos}
                        {pct !== null && <span className="ml-1 text-nota font-normal text-[var(--texto-suave)]">{pct} %</span>}
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 font-bold text-[var(--texto)]">
                        {fila.goles === null ? 'Sin datos' : formatoNumero(fila.goles)}
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
          </>
        )}
      <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-nota leading-5 text-[var(--texto-suave)]">
        Cada fila es una participación en una competición. Un mismo equipo puede aparecer más de una vez en una temporada si jugó liga y playoff.
      </p>
    </section>
  );
}

const CONVOCATORIA: Record<string, string> = {
  starter: 'Titular',
  substitute: 'Suplente',
  called_up_unknown: 'Convocado',
};

/** Marcador del partido desde el punto de vista de su equipo; sin resultado publicado, «—». */
function marcador(propios: number | null, rival: number | null): string {
  return propios === null || rival === null ? '—' : `${propios}-${rival}`;
}

export function UltimosPartidosJugador({ filas }: { filas: readonly FilaPartidoDePersona[] }) {
  return (
    <section aria-labelledby="ultimos-partidos" className={`${TARJETA} overflow-hidden`}>
      <div className="px-4 py-3.5">
        <h2 id="ultimos-partidos" className="m-0 text-bloque font-bold text-[var(--texto)]">Últimos partidos</h2>
      </div>
      {filas.length === 0
        ? <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">Sin partidos en actas.</p>
        : (
          <>
          <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2 text-nota text-[var(--texto-suave)] md:hidden">Desplaza para ver marcador, jornada, convocatoria, goles y tarjetas.</p>
          <div data-tabla-scroll tabIndex={0} role="region"
            aria-label="Últimos partidos: desplázate en horizontal para ver todas las columnas"
            className="relative overflow-x-auto focus-visible:[outline-offset:-2px]">
            <table className="w-full border-separate border-spacing-0 text-tabla" style={{ minWidth: 520 }}>
              <caption className="sr-only">
                Últimos partidos del jugador con jornada, equipo, rival, marcador, si fue titular, sus goles y sus tarjetas.
              </caption>
              <thead>
                <tr className="text-right text-etiqueta text-[var(--texto-suave)]">
                  <th scope="col" className="sticky left-0 z-[var(--capa-pegajoso)] bg-[var(--fondo-elevado)] py-2 pl-4 pr-1.5 text-left font-semibold">Fecha</th>
                  <th scope="col" className="px-1.5 py-2 text-left font-semibold">Equipo y rival</th>
                  <th scope="col" className="px-1.5 py-2 font-semibold">Marcador</th>
                  <th scope="col" className="hidden px-1.5 py-2 text-left font-semibold md:table-cell">Jornada</th>
                  <th scope="col" className="hidden px-1.5 py-2 text-left font-semibold md:table-cell">Convocatoria</th>
                  <th scope="col" className="px-1.5 py-2 font-semibold">Goles</th>
                  <th scope="col" className="py-2 pl-1.5 pr-4 font-semibold">Tarjetas</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => {
                  const fecha = fechaDeValor(fila.fecha);
                  return (
                    <tr key={fila.partido_id} className="text-right">
                      <td className="sticky left-0 z-[var(--capa-pegajoso)] whitespace-nowrap border-t border-[var(--fondo-sutil)] bg-[var(--fondo-elevado)] py-1.5 pl-4 pr-1.5 text-left text-[var(--texto-suave)]">
                        {fechaCorta(fecha) ?? 'Sin fecha'}
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-left">
                        <span className="block font-semibold text-[var(--texto)]">{fila.equipo}</span>
                        <Link href={`/explorar/equipo/${fila.rival_id}` as Route}
                          className="block text-nota text-[var(--texto-suave)] hover:text-[var(--accion)] hover:underline">
                          contra {fila.rival} · {fila.condicion === 'casa' ? 'en casa' : 'fuera'}
                        </Link>
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 font-bold tabular-nums text-[var(--texto)]">
                        {marcador(fila.goles_propios, fila.goles_rival)}
                      </td>
                      <td className="hidden border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-left md:table-cell">
                        {fila.jornada_numero === null
                          ? <span className="text-[var(--texto-suave)]">Sin jornada</span>
                          : (
                            <Link href={`/explorar/competicion/${fila.grupo_id}/jornada/${fila.jornada_numero}` as Route}
                              className="text-[var(--accion)] hover:underline">
                              J{fila.jornada_numero}
                            </Link>
                          )}
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-left text-[var(--texto-suave)]">
                        {CONVOCATORIA[fila.convocatoria] ?? fila.convocatoria}
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 font-bold text-[var(--texto)]">
                        {fila.goles}
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] py-1.5 pl-1.5 pr-4 text-[var(--texto-suave)]">
                        {fila.amarillas} · {fila.rojas}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
    </section>
  );
}

export function IdentidadDelJugador({ jugador }: { jugador: FilaPersona }) {
  if (jugador.identidad_nominal) {
    return (
      <section aria-labelledby="identidad" className={`${TARJETA} flex flex-col gap-2 p-4`}>
        <h2 id="identidad" className="m-0 text-bloque font-bold text-[var(--texto)]">Identidad</h2>
        <p className="m-0 text-tabla leading-6 text-[var(--texto-suave)]">
          <b className="text-[var(--texto)]">Sin código federativo.</b> Este nombre une sus temporadas por
          el contexto de su equipo y su nombre, no por una prueba de que sea la misma persona. Un nombre
          igual no une a dos personas.
        </p>
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          {jugador.decisiones_identidad === 0
            ? 'No hay ninguna decisión de identidad registrada.'
            : `${formatoNumero(jugador.decisiones_identidad)} decisión(es) de identidad registrada(s).`}
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="identidad" className={`${TARJETA} flex flex-col gap-2 p-4`}>
      <h2 id="identidad" className="m-0 text-bloque font-bold text-[var(--texto)]">Identidad</h2>
      <p className="m-0 text-tabla leading-6 text-[var(--texto-suave)]">
        <b className="text-[var(--texto)]">Identidad confirmada</b> con el código federativo{' '}
        <span className="font-semibold tabular-nums text-[var(--texto)]">{jugador.codigos ?? 'no publicado'}</span>.
      </p>
    </section>
  );
}
