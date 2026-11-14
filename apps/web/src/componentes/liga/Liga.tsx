import Link from 'next/link';
import type { Route } from 'next';
import { Escudo } from '@/componentes/Escudo';
import { Cifras } from '@/componentes/estadisticas/Cifras';
import { BarraReparto, GraficoBarras } from '@/componentes/estadisticas/Graficos';
import { ETIQUETA, TARJETA } from '@/componentes/estadisticas/controles';
import type { FilaClasificacionPantalla } from '@/consultas/competiciones';
import type { FilaEquipoDeLiga } from '@/consultas/liga';
import type { FilaPartidoCanonico } from '@/consultas/partidos';
import type { ResumenDePartidos } from '@/consultas/estadisticas';
import {
  conclusionDeResultados, conclusionDeTramos, decimal, golesPorPartido, numero, porcentaje,
  repartoDeResultados,
} from '@/lib/estadisticas';
import {
  cifraOTexto, clasificacionResumida, disciplinaOrdenada, equiposConCantera, equiposSinCantera,
  equiposSinMinutos, hayCantera, hayDisciplina, type CanteraDeEquipo,
} from '@/lib/liga';
import { fechaCorta } from '@/lib/vocabulario-pantalla';

/**
 * Las secciones de la página de liga, contra `prototipo/Liga.dc.html`.
 *
 * Orden de lectura: las cifras de la liga, el reparto de resultados y la última jornada jugada, cuándo
 * se marcan los goles, los minutos de los equipos inferiores (cantera), la clasificación resumida y la
 * disciplina por equipo. Los partidos y los equipos enlazan a sus pantallas.
 *
 * Se reutilizan las piezas de las páginas de estadísticas (cifras, reparto en barra, gráfico de barras
 * con tabla equivalente) para que la pantalla sea la misma familia visual, no una invención nueva.
 */

const MARGEN = 'px-4 py-3.5';

/**
 * Estado vacío de una sección. Es propio de esta pantalla y no el de estadísticas porque `SinDatos`
 * usa un `id` fijo: con varias secciones vacías en la misma página repetiría el `id`.
 */
function SinDatosDeLiga({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={`${TARJETA} px-4 py-4`}>
      <h2 id={id} className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
      <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">{children}</p>
    </section>
  );
}

/** Cifras de cabecera: partidos, goles, porterías a cero y actas. */
export function CifrasDeLiga({ resumen }: { resumen: ResumenDePartidos }) {
  const cifras = [
    {
      etiqueta: 'Partidos',
      valor: numero(resumen.con_resultado),
      nota: `de ${numero(resumen.partidos)} publicados`,
    },
    {
      etiqueta: 'Goles por partido',
      valor: golesPorPartido(resumen) === null ? '—' : decimal(golesPorPartido(resumen)),
      nota: `${numero(resumen.goles)} goles en total`,
    },
    {
      etiqueta: 'Algún equipo a cero',
      valor: porcentaje(resumen.con_cero, resumen.con_resultado) === null
        ? '—' : `${porcentaje(resumen.con_cero, resumen.con_resultado)} %`,
      nota: 'Partidos con algún equipo sin marcar',
    },
    {
      etiqueta: 'Actas correctas',
      valor: porcentaje(resumen.actas_correctas, resumen.actas) === null
        ? '—' : `${porcentaje(resumen.actas_correctas, resumen.actas)} %`,
      nota: `${numero(resumen.actas)} partidos con acta`,
    },
  ];
  return <Cifras cifras={cifras} />;
}

/** Reparto de resultados (gana el local / empate / gana el visitante). */
export function ResultadosDeLiga({ resumen }: { resumen: ResumenDePartidos }) {
  if (resumen.con_resultado === 0) {
    return <SinDatosDeLiga id="resultados-vacio" titulo="Resultados">Sin resultados publicados: no hay partidos con marcador.</SinDatosDeLiga>;
  }
  const clases: Record<string, string> = {
    local: 'bg-[var(--accion)]',
    empate: 'bg-[var(--texto-tenue)]',
    visitante: 'bg-[var(--zona-fase-ascenso)]',
  };
  const partes = repartoDeResultados(resumen).map((parte) => ({ ...parte, clase: clases[parte.clave]! }));
  return (
    <BarraReparto
      id="resultados-liga"
      titulo={conclusionDeResultados(resumen)}
      subtitulo="Reparto de los partidos con marcador publicado"
      resumen={`Reparto de resultados: ${partes.map((parte) => `${parte.etiqueta} ${parte.porcentaje} %`).join(', ')}`}
      partes={partes}
      nota="Sólo cuentan los partidos con resultado publicado."
    />
  );
}

/** Los partidos de la última jornada jugada, con sus enlaces. */
export function ResultadosRecientes({ jornada, partidos, base }: {
  jornada: number | null;
  partidos: readonly FilaPartidoCanonico[];
  base: string;
}) {
  if (partidos.length === 0) {
    return <SinDatosDeLiga id="recientes-vacio" titulo="Resultados recientes">Todavía no hay resultados publicados.</SinDatosDeLiga>;
  }
  return (
    <section aria-labelledby="resultados-recientes" className={`${TARJETA} overflow-hidden`}>
      <div className={`flex flex-wrap items-baseline justify-between gap-2 ${MARGEN}`}>
        <h2 id="resultados-recientes" className="m-0 text-bloque font-bold text-[var(--texto)]">
          Resultados recientes
        </h2>
        {jornada !== null && (
          <Link href={`${base}/jornada/${jornada}` as Route}
            className="text-nota font-semibold text-[var(--accion)] hover:underline">
            Ver la jornada {jornada}
          </Link>
        )}
      </div>
      <ul className="m-0 list-none p-0">
        {partidos.map((partido) => {
          const local = partido.local_nombre_corto ?? partido.local;
          const visitante = partido.visitante_nombre_corto ?? partido.visitante;
          return (
            <li key={Number(partido.match_id)}
              className="flex flex-col gap-1 border-t border-[var(--fondo-sutil)] px-4 py-2.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <Link href={`/explorar/equipo/${Number(partido.local_id)}` as Route}
                  className="flex min-w-0 items-center justify-end gap-1.5 text-right text-tabla font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
                  <span className="truncate">{local}</span>
                  <Escudo equipoId={Number(partido.local_id)} nombre={partido.local}
                    clubId={partido.local_club_id ?? null} tieneEscudo={partido.local_tiene_escudo ?? null} />
                </Link>
                <span className="rounded-[var(--radius-md)] bg-[var(--fondo-fuerte)] px-2 py-0.5 text-tabla font-bold tabular-nums text-[var(--texto-fuerte)]">
                  {partido.goles_local} - {partido.goles_visitante}
                </span>
                <Link href={`/explorar/equipo/${Number(partido.visitante_id)}` as Route}
                  className="flex min-w-0 items-center gap-1.5 text-tabla font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
                  <Escudo equipoId={Number(partido.visitante_id)} nombre={partido.visitante}
                    clubId={partido.visitante_club_id ?? null} tieneEscudo={partido.visitante_tiene_escudo ?? null} />
                  <span className="truncate">{visitante}</span>
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-nota text-[var(--texto-suave)]">
                {fechaCorta(partido.fecha) !== null && <span>{fechaCorta(partido.fecha)}</span>}
                {partido.jornada !== null && (
                  <Link href={`${base}/jornada/${partido.jornada}` as Route}
                    className="font-semibold text-[var(--accion)] hover:underline">
                    Jornada
                  </Link>
                )}
                {partido.calidad_acta !== null && (
                  <Link href={`/explorar/acta/${Number(partido.match_id)}` as Route}
                    className="font-semibold text-[var(--accion)] hover:underline">
                    Acta
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Cuándo se marcan los goles, con la tabla equivalente. */
export function GolesPorTramoDeLiga({ tramos }: { tramos: ReadonlyArray<{ orden: number; etiqueta: string; goles: number }> }) {
  const total = tramos.reduce((suma, tramo) => suma + tramo.goles, 0);
  if (total === 0) {
    return <SinDatosDeLiga id="goles-vacio" titulo="Cuándo se marcan los goles">Sin goles publicados en las actas de esta liga.</SinDatosDeLiga>;
  }
  const ultimo = tramos
    .filter((tramo) => tramo.orden === 5 || tramo.orden === 6)
    .reduce((suma, tramo) => suma + tramo.goles, 0);
  const nota = ultimo > 0
    ? `Los últimos quince minutos y el tiempo añadido concentran el ${Math.round((100 * ultimo) / total)} % de los goles.`
    : 'Los goles sin minuto publicado no se reparten en tramos.';
  return (
    <GraficoBarras
      id="goles-por-tramo-liga"
      titulo="Cuándo se marcan los goles"
      subtitulo={`${conclusionDeTramos(tramos)} · Goles por tramo de quince minutos, contados desde las actas`}
      resumen={`Goles por tramo: ${tramos.map((tramo) => `${tramo.etiqueta}, ${tramo.goles} goles`).join('; ')}`}
      datos={tramos.map((tramo) => ({
        etiqueta: tramo.etiqueta,
        valor: tramo.goles,
        titulo: `${tramo.etiqueta}: ${tramo.goles} goles`,
      }))}
      tableHeaders={['Tramo', 'Goles', '% del total']}
      tableRows={tramos.map((tramo) => [
        tramo.etiqueta,
        String(tramo.goles),
        `${Math.round((100 * tramo.goles) / total)} %`,
      ])}
      nota={nota}
    />
  );
}

/** Clasificación resumida: puesto, equipo, partidos, goles y puntos. */
export function ClasificacionResumida({ filas, base }: {
  filas: readonly FilaClasificacionPantalla[];
  base: string;
}) {
  if (filas.length === 0) {
    return <SinDatosDeLiga id="clasificacion-vacia" titulo="Clasificación">Sin clasificación publicada para esta liga.</SinDatosDeLiga>;
  }
  const { filas: resumen, usaReconstruccion } = clasificacionResumida(filas);
  return (
    <section aria-labelledby="clasificacion-liga" className={`${TARJETA} overflow-hidden`}>
      <div className={`flex flex-wrap items-baseline justify-between gap-2 ${MARGEN}`}>
        <h2 id="clasificacion-liga" className="m-0 text-bloque font-bold text-[var(--texto)]">Clasificación</h2>
        <Link href={base as Route} className="text-nota font-semibold text-[var(--accion)] hover:underline">
          Ver la clasificación completa
        </Link>
      </div>
      <table className="w-full border-separate border-spacing-0 text-tabla">
        <caption className="sr-only">
          Clasificación resumida: posición, equipo, partidos jugados, goles y puntos.
        </caption>
        <thead>
          <tr className="text-etiqueta text-[var(--texto-suave)]">
            <th scope="col" className="py-2 pl-4 pr-1.5 text-left font-semibold">#</th>
            <th scope="col" className="px-1.5 py-2 text-left font-semibold">Equipo</th>
            <th scope="col" className="px-1.5 py-2 text-right font-semibold">PJ</th>
            <th scope="col" className="hidden px-1.5 py-2 text-right font-semibold sm:table-cell">Goles</th>
            <th scope="col" className="py-2 pl-1.5 pr-4 text-right font-semibold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {resumen.map((fila) => (
            <tr key={fila.equipo_id}>
              <td className="border-t border-[var(--fondo-sutil)] py-2 pl-4 pr-1.5 text-right font-semibold tabular-nums text-[var(--texto-suave)]">
                {fila.posicion}
              </td>
              <th scope="row" className="min-w-0 border-t border-[var(--fondo-sutil)] px-1.5 py-2 text-left font-semibold">
                <Link href={`/explorar/equipo/${fila.equipo_id}` as Route}
                  className="block truncate text-[var(--texto)] hover:text-[var(--accion)] hover:underline"
                  title={fila.equipo}>
                  {fila.nombre}
                </Link>
              </th>
              <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-2 text-right tabular-nums text-[var(--texto-suave)]">
                {fila.jugados}
              </td>
              <td className="hidden border-t border-[var(--fondo-sutil)] px-1.5 py-2 text-right tabular-nums text-[var(--texto-suave)] sm:table-cell">
                {fila.goles}
              </td>
              <td className="border-t border-[var(--fondo-sutil)] py-2 pl-1.5 pr-4 text-right font-bold tabular-nums text-[var(--texto)]">
                {fila.puntos}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-nota leading-5 text-[var(--texto-suave)]">
        {usaReconstruccion
          ? 'La clasificación se ha calculado con los resultados publicados; la federación no publicó tabla.'
          : 'La clasificación es la que publica la federación tras cada jornada.'}
        {usaReconstruccion ? ' Los goles también se han calculado con los resultados.' : ''}
      </p>
    </section>
  );
}

/** Minutos jugados por futbolistas de equipos inferiores del mismo club. */
export function CanteraDelGrupo({ filas }: { filas: readonly FilaEquipoDeLiga[] }) {
  const conCantera = equiposConCantera(filas);
  const sinCantera = equiposSinCantera(filas);
  const sinMinutos = equiposSinMinutos(filas);
  if (!hayCantera(filas)) {
    return (
      <SinDatosDeLiga id="cantera-vacia" titulo="Minutos para la cantera">
        Sin datos: en esta liga no hay futbolistas con minutos en un equipo de categoría inferior del
        mismo club.
      </SinDatosDeLiga>
    );
  }
  const maximo = Math.max(...conCantera.map((equipo) => equipo.porcentaje));
  return (
    <section aria-labelledby="cantera-liga" className={`${TARJETA} overflow-hidden`}>
      <div className={MARGEN}>
        <h2 id="cantera-liga" className="m-0 text-bloque font-bold text-[var(--texto)]">
          Minutos para la cantera
        </h2>
        <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">
          Minutos en este equipo de futbolistas que también han jugado en un equipo de categoría inferior del mismo club.
        </p>
      </div>
      <ul className="m-0 list-none p-0">
        {conCantera.map((equipo) => (
          <li key={equipo.fila.equipo_id}
            className="flex flex-col gap-1.5 border-t border-[var(--fondo-sutil)] px-4 py-2.5 sm:grid sm:grid-cols-[minmax(140px,220px)_minmax(0,1fr)_110px] sm:items-center sm:gap-3">
            <Link href={`/explorar/equipo/${equipo.fila.equipo_id}` as Route}
              className="min-w-0 truncate text-tabla font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
              {equipo.fila.equipo}
            </Link>
            <span role="img"
              aria-label={`${equipo.fila.equipo}: ${textoPorcentaje(equipo)} de minutos de jugadores de equipos inferiores`}
              className="block h-3 w-full overflow-hidden rounded-full bg-[var(--fondo-sutil)]">
              <span aria-hidden="true" className="block h-full rounded-full bg-[var(--victoria)]"
                style={{ width: `${maximo > 0 ? Math.max(3, (100 * equipo.porcentaje) / maximo) : 0}%` }} />
            </span>
            <span className="text-nota text-[var(--texto-suave)] sm:text-right">
              <strong className="text-tabla tabular-nums text-[var(--texto)]">{textoPorcentaje(equipo)}</strong>
              {' · '}{numero(equipo.fila.jugadores_inferiores ?? 0)} jugadores
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-nota leading-5 text-[var(--texto-suave)]">
        Porcentaje sobre los minutos publicados del equipo.
        {sinCantera > 0 ? ` ${numero(sinCantera)} equipos no han alineado a futbolistas de categorías inferiores.` : ''}
        {sinMinutos > 0 ? ` ${numero(sinMinutos)} equipos no tienen minutos publicados.` : ''}
      </p>
    </section>
  );
}

function textoPorcentaje(equipo: CanteraDeEquipo): string {
  return `${equipo.porcentaje.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** Una cifra de disciplina: guion si el equipo no tiene actas, y guion si la proyección no la trae. */
function valorDeDisciplina(sinActa: boolean, valor: number | null): string {
  return sinActa ? '—' : cifraOTexto(valor);
}

/** Disciplina por equipo: amarillas, expulsiones y partidos de sanción. */
export function DisciplinaDelGrupo({ filas }: { filas: readonly FilaEquipoDeLiga[] }) {
  const ordenadas = disciplinaOrdenada(filas);
  if (!hayDisciplina(filas)) {
    return <SinDatosDeLiga id="disciplina-vacia" titulo="Disciplina por equipo">Sin actas publicadas: no hay tarjetas ni sanciones que enseñar.</SinDatosDeLiga>;
  }
  return (
    <section aria-labelledby="disciplina-liga" className={`${TARJETA} overflow-hidden`}>
      <div className={MARGEN}>
        <h2 id="disciplina-liga" className="m-0 text-bloque font-bold text-[var(--texto)]">Disciplina por equipo</h2>
        <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">
          Tarjetas y sanciones de las actas publicadas.
        </p>
      </div>
      <ul className="m-0 list-none p-0 sm:hidden">
        {ordenadas.map((fila) => {
          const sinActa = fila.partidos_con_acta === 0;
          return (
            <li key={fila.equipo_id} className="border-t border-[var(--fondo-sutil)] px-4 py-2.5">
              <Link href={`/explorar/equipo/${fila.equipo_id}` as Route}
                className="block truncate text-tabla font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline"
                title={fila.equipo}>
                {fila.equipo}
              </Link>
              <dl className="m-0 mt-1 grid grid-cols-3 gap-2 text-nota">
                <div>
                  <dt className="m-0 text-etiqueta text-[var(--texto-suave)]">Amarillas</dt>
                  <dd className="m-0 font-semibold tabular-nums text-[var(--texto)]">{valorDeDisciplina(sinActa, fila.amarillas)}</dd>
                </div>
                <div>
                  <dt className="m-0 text-etiqueta text-[var(--texto-suave)]">Expulsiones</dt>
                  <dd className="m-0 font-semibold tabular-nums text-[var(--texto)]">{valorDeDisciplina(sinActa, fila.rojas)}</dd>
                </div>
                <div>
                  <dt className="m-0 text-etiqueta text-[var(--texto-suave)]">Sanciones</dt>
                  <dd className="m-0 font-semibold tabular-nums text-[var(--texto)]">{valorDeDisciplina(sinActa, fila.partidos_sancion)}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
      <div className="hidden sm:block">
        <table className="w-full border-separate border-spacing-0 text-tabla">
          <caption className="sr-only">Amarillas, expulsiones y partidos de sanción de cada equipo.</caption>
          <thead>
            <tr className="text-etiqueta text-[var(--texto-suave)]">
              <th scope="col" className="py-2 pl-4 pr-1.5 text-left font-semibold">Equipo</th>
              <th scope="col" className="px-1.5 py-2 text-right font-semibold">Amarillas</th>
              <th scope="col" className="px-1.5 py-2 text-right font-semibold">Expulsiones</th>
              <th scope="col" className="py-2 pl-1.5 pr-4 text-right font-semibold">Sanciones</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((fila) => {
              const sinActa = fila.partidos_con_acta === 0;
              return (
                <tr key={fila.equipo_id}>
                  <th scope="row" className="min-w-0 border-t border-[var(--fondo-sutil)] py-2 pl-4 pr-1.5 text-left font-semibold">
                    <Link href={`/explorar/equipo/${fila.equipo_id}` as Route}
                      className="block truncate text-[var(--texto)] hover:text-[var(--accion)] hover:underline"
                      title={fila.equipo}>
                      {fila.equipo}
                    </Link>
                  </th>
                  <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-2 text-right tabular-nums text-[var(--texto)]">
                    {valorDeDisciplina(sinActa, fila.amarillas)}
                  </td>
                  <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-2 text-right tabular-nums text-[var(--texto)]">
                    {valorDeDisciplina(sinActa, fila.rojas)}
                  </td>
                  <td className="border-t border-[var(--fondo-sutil)] py-2 pl-1.5 pr-4 text-right tabular-nums text-[var(--texto)]">
                    {valorDeDisciplina(sinActa, fila.partidos_sancion)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-nota leading-5 text-[var(--texto-suave)]">
        «Sanciones» son los partidos que la federación publica como castigo. Un equipo sin actas aparece
        con guiones: no es que no tenga tarjetas, es que no se sabe.
      </p>
    </section>
  );
}
