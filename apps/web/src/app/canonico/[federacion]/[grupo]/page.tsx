import Link from 'next/link';
import type { Route } from 'next';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { CLASIFICACION_DEL_GRUPO, GOLES_DE_PARTIDOS, GRUPO_DEL_CANONICO, PARAMETROS_PARTIDOS, PARTIDOS_DE_GRUPO } from '@/consultas/partidos';
import type { FilaClasificacion, FilaGoleador, FilaGrupoDetalle, FilaPartidoCanonico } from '@/consultas/partidos';

export const dynamic = 'force-dynamic';

/**
 * Detalle de un grupo importado: jornadas, resultados y goleadores, todo del canónico.
 *
 * Tres reglas que se ven en la pantalla:
 * - un marcador ausente es un guion, nunca un 0-0 inventado;
 * - un goleador que sólo se conoce por su nombre va marcado (`n`), porque no es un perfil confirmado;
 * - un penalti y un gol en propia puerta se distinguen del gol normal: si no, la tabla de goleadores
 *   no cuadra con el marcador.
 */

const numero = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : String(v));

const marcador = (p: FilaPartidoCanonico): string =>
  p.goles_local === null || p.goles_visitante === null ? '—' : `${p.goles_local}-${p.goles_visitante}`;

function SinCanonico({ motivo }: { motivo: string }) {
  return <>
    <h2 className="font-display text-2xl uppercase">Detalle del grupo</h2>
    <div className="mt-4 border-l-4 border-[var(--cobertura-parcial)] bg-[var(--fondo-elevado)] p-4 text-sm leading-6">
      <b className="block">No se puede leer el canónico.</b>
      <p className="mt-1 text-[var(--texto-suave)]">{motivo}</p>
      <Link className="mt-3 inline-block text-xs text-[var(--accion)] hover:underline"
        href={'/canonico' as Route}>← Estado del canónico</Link>
    </div>
  </>;
}

export default async function GrupoDelCanonico({ params }: { params: Promise<{ federacion: string; grupo: string }> }) {
  const { federacion, grupo } = await params;
  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico motivo={motivo} />;

  let cabecera: FilaGrupoDetalle | null = null;
  let partidos: FilaPartidoCanonico[] = [];
  let goles: FilaGoleador[] = [];
  let clasificacion: FilaClasificacion[] = [];
  try {
    const [cabeza] = await consulta<FilaGrupoDetalle>(GRUPO_DEL_CANONICO.sql, [federacion, grupo]);
    cabecera = cabeza ?? null;
    if (cabecera) {
      partidos = await consulta<FilaPartidoCanonico>(PARTIDOS_DE_GRUPO.sql, [federacion, grupo, PARAMETROS_PARTIDOS['partidos-de-grupo']![2]]);
      goles = await consulta<FilaGoleador>(GOLES_DE_PARTIDOS.sql, [federacion, grupo, PARAMETROS_PARTIDOS['goles-de-partidos']![2]]);
      clasificacion = await consulta<FilaClasificacion>(CLASIFICACION_DEL_GRUPO.sql, [federacion, grupo]);
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico motivo={error.message} />;
    throw error;
  }

  if (!cabecera) {
    return <>
      <h2 className="font-display text-2xl uppercase">Ese grupo no está en el canónico</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--texto-suave)]">
        No hay ningún grupo <b>{grupo}</b> de <b>{federacion}</b> importado. No es un error de la web:
        el canónico se llena grupo a grupo con <code className="bg-[var(--fondo-sutil)] px-1">pnpm importar</code>,
        y hasta que un grupo no se importa, aquí no hay nada que enseñar. No se rellena con datos de
        ejemplo ni con ceros.
      </p>
      <Link className="mt-3 inline-block text-xs text-[var(--accion)] hover:underline"
        href={'/canonico' as Route}>← Estado del canónico</Link>
    </>;
  }

  const golesPorPartido = new Map<number, FilaGoleador[]>();
  for (const gol of goles) {
    const lista = golesPorPartido.get(gol.match_id) ?? [];
    lista.push(gol);
    golesPorPartido.set(gol.match_id, lista);
  }
  // Dos tablas pueden convivir: la que publica la federación (`oficial`) y la que suma el importador
  // (`reconstruida`). Se enseña la oficial cuando existe; la reconstruida es el respaldo, y su nota
  // avisa de que no incluye sanciones. Nunca se mezclan filas de las dos.
  const oficial = clasificacion.filter((f) => f.origen === 'oficial');
  const reconstruida = clasificacion.filter((f) => f.origen !== 'oficial');
  const tabla = oficial.length > 0 ? oficial : reconstruida;
  const usaOficial = oficial.length > 0;
  const jornadas = [...new Set(partidos.map((p) => p.jornada))].sort((a, b) => a - b);
  const sinResultado = partidos.filter((p) => p.goles_local === null || p.goles_visitante === null).length;
  const etiqueta = (gol: FilaGoleador): string =>
    gol.subtipo === 'penalti' ? ' (p)' : gol.subtipo === 'propia_puerta' ? ' (pp)' : '';

  return <>
    <Link className="text-xs text-[var(--accion)] hover:underline" href={'/canonico' as Route}>← Estado del canónico</Link>
    <h2 className="mt-2 font-display text-2xl uppercase">{cabecera.grupo}</h2>
    <p className="mt-1 text-sm text-[var(--texto-suave)]">
      {cabecera.federacion_nombre} · {cabecera.temporada} · {cabecera.edicion} · grupo {cabecera.grupo_codigo}
    </p>

    <div className="my-4 grid grid-cols-2 gap-px border border-[var(--borde-fuerte)] bg-[var(--borde)] sm:grid-cols-5">
      {[
        ['Jornadas previstas', numero(cabecera.jornadas_previstas)],
        ['Partidos', numero(cabecera.partidos_conocidos)],
        ['Con resultado', numero(cabecera.partidos_con_resultado)],
        ['Actas', `${numero(cabecera.actas_parseadas)} / ${numero(cabecera.actas_disponibles)}`],
        ['Completo hasta', cabecera.complete_through_matchday === null ? '—' : `J${cabecera.complete_through_matchday}`],
      ].map(([t, v]) => (
        <div key={String(t)} className="bg-[var(--fondo-elevado)] p-3">
          <p className="font-display text-xl tabular-nums">{v}</p>
          <p className="text-[0.6875rem] uppercase tracking-wider text-[var(--texto-suave)]">{t}</p>
        </div>
      ))}
    </div>

    <p className="mb-4 border-l-4 border-[var(--accion)] bg-[var(--fondo-elevado)] p-3 text-xs leading-5 text-[var(--texto-suave)]">
      Estado de la cobertura: <b>{cabecera.visibility_state ?? 'sin punto de control'}</b>.
      {sinResultado > 0 && <> De {numero(cabecera.partidos_conocidos)} partidos, <b>{sinResultado}</b> todavía no
        tienen marcador publicado: se enseñan con un guion, no con un 0-0.</>}
      {' '}Un goleador marcado con <b>n</b> sólo se conoce por su nombre en su equipo esa temporada
      (identidad nominal); no es un perfil confirmado. <b>(p)</b> penalti, <b>(pp)</b> propia puerta.
    </p>

    {clasificacion.length > 0 && (
      <section className="mb-5 border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)]">
        <header className="flex items-baseline justify-between gap-2 border-b border-[var(--borde)] px-3 py-2">
          <h3 className="font-display text-sm uppercase tracking-wider text-[var(--texto-suave)]">
            Clasificación {usaOficial ? 'oficial' : 'reconstruida'} · hasta la jornada {tabla[0]!.jornada}
          </h3>
          <span className="text-xs text-[var(--texto-tenue)]">
            {usaOficial ? 'publicada por la federación' : 'sumada desde los resultados'}
          </span>
        </header>
        <table className="w-full text-xs">
          <thead className="cabecera-tabla text-left">
            <tr>
              <th scope="col" className="px-3 py-2">#</th><th scope="col" className="px-3 py-2">Equipo</th>
              <th scope="col" className="px-3 py-2 text-right">Pts</th><th scope="col" className="px-3 py-2 text-right">J</th>
              <th scope="col" className="px-3 py-2 text-right">G</th><th scope="col" className="px-3 py-2 text-right">E</th>
              <th scope="col" className="px-3 py-2 text-right">P</th>
              {!usaOficial && <><th scope="col" className="px-3 py-2 text-right">GF</th><th scope="col" className="px-3 py-2 text-right">GC</th></>}
            </tr>
          </thead>
          <tbody>
            {tabla.map((fila) => (
              <tr key={`${fila.equipo}-${fila.origen}`} className="border-t border-[var(--borde)]">
                <td className="px-3 py-2 tabular-nums text-[var(--texto-tenue)]">{fila.posicion}</td>
                <td className="px-3 py-2">{fila.equipo}</td>
                <td className="px-3 py-2 text-right font-display tabular-nums">{fila.puntos}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fila.jugados}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fila.ganados}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fila.empatados}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fila.perdidos}</td>
                {!usaOficial && <>
                  <td className="px-3 py-2 text-right tabular-nums">{fila.goles_favor}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fila.goles_contra}</td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
        {usaOficial ? (
          <p className="border-t border-[var(--borde)] px-3 py-2 text-xs text-[var(--texto-tenue)]">
            Tabla tal y como la publica la federación, con sus sanciones incluidas en los puntos
            (la vista que se archiva no trae goles a favor y en contra, por eso no se enseñan).
            {' '}El importador también suma su propia tabla desde los resultados; cuando no cuadran,
            la diferencia queda registrada para poder mirarla, y aquí se enseña la oficial.
          </p>
        ) : (
          <p className="border-t border-[var(--borde)] px-3 py-2 text-xs text-[var(--texto-tenue)]">
            Suma de los resultados de este grupo: 3 puntos por victoria, 1 por empate. El desempate es
            enfrentamiento directo (sólo cuando los empatados ya se han enfrentado todos entre sí),
            diferencia de goles y goles a favor; si sigue el empate, el reglamento manda sorteo y aquí
            se diría, no se ordena a dedo. <b>No incluye sanciones ni ajustes de la federación</b>: si
            la federación publica su tabla, se enseñará la suya.
          </p>
        )}
      </section>
    )}

    {partidos.length === 0 ? (
      <p className="border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] p-4 text-sm">
        Este grupo está en el canónico pero todavía no tiene partidos importados.
      </p>
    ) : (
      <div className="space-y-5">
        {jornadas.map((jornada) => (
          <section key={jornada} className="border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)]">
            <header className="border-b border-[var(--borde)] px-3 py-2 font-display text-sm uppercase tracking-wider text-[var(--texto-suave)]">
              Jornada {jornada}
            </header>
            <table className="w-full text-xs">
              <tbody>
                {partidos.filter((p) => p.jornada === jornada).map((p) => (
                  <tr key={p.match_id} className="border-t border-[var(--borde)] align-top">
                    <td className="w-[38%] px-3 py-2 text-right">{p.local}</td>
                    <td className="w-[8%] px-2 py-2 text-center font-display text-base tabular-nums">{marcador(p)}</td>
                    <td className="w-[38%] px-3 py-2">{p.visitante}</td>
                    <td className="px-3 py-2 text-xs text-[var(--texto-tenue)]">
                      {p.fecha ?? 'sin fecha'}
                      {p.campo ? ` · ${p.campo}` : ''}
                      {p.arbitro ? ` · ${p.arbitro}` : ' · sin árbitro publicado'}
                      {p.calidad_acta === 'review' ? ' · acta a revisar' : ''}
                    </td>
                  </tr>
                ))}
                {partidos.filter((p) => p.jornada === jornada).map((p) => {
                  const suyos = golesPorPartido.get(p.match_id);
                  if (!suyos || suyos.length === 0) return null;
                  return (
                    <tr key={`g-${p.match_id}`} className="border-t border-[var(--borde)] bg-[var(--fondo-sutil)]">
                      <td colSpan={4} className="px-3 py-1 text-xs text-[var(--texto-suave)]">
                        {suyos.map((gol, i) => (
                          <span key={`${gol.match_id}-${i}`}>
                            {i > 0 && ' · '}
                            {gol.minuto === null ? 'minuto sin publicar' : `${gol.minuto}′`} {gol.autor}{etiqueta(gol)}
                            {gol.identidad_nominal && <b title="identidad nominal: sólo se le conoce por su nombre"> n</b>}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    )}
  </>;
}
