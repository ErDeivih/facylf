import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  HAY_CALENDARIO_FUTURO, PROXIMOS_DEL_CALENDARIO, PROXIMOS_PARTIDOS, PROXIMOS_POR_COMPETICION, TEMPORADA_EN_CURSO,
  type FilaCrucePrevisto, type FilaProximoPartido, type FilaProximosPorCompeticion,
} from '@/consultas/partidos';
import { SinCanonico } from '@/componentes/SinCanonico';
import {
  CATEGORIAS_FILTRABLES, VENTANAS, agrupaProximos, conCrucesPrevistos, diaCorto, diaYMes, leeFiltrosProximas, linea1X2, urlDeProximas,
  type CompeticionConProximos, type FiltrosProximas,
} from '@/lib/proximas';
import { etiquetaCategoria } from '@/lib/vocabulario-pantalla';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Próximos partidos — Fondo Popular' };

/**
 * Próximos partidos, competición a competición y, dentro de cada una, día a día.
 *
 * Sólo entra lo que aún no se ha jugado y tiene fecha de hoy en adelante, dentro de la ventana elegida
 * (7, 14 o 30 días). Cada competición dice hasta qué día tiene resultados; las que no tienen ningún
 * partido en la ventana se listan aparte, con esa misma fecha, en lugar de desaparecer.
 */
export default async function PantallaProximas({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filtros = leeFiltrosProximas(await searchParams);
  let partidos: FilaProximoPartido[] = [];
  let resumen: FilaProximosPorCompeticion[] = [];
  try {
    const parametros = [TEMPORADA_EN_CURSO, filtros.dias, filtros.categoria];
    const [p, r] = await consultaEnUnaFoto([
      { sql: PROXIMOS_PARTIDOS.sql, parametros },
      { sql: PROXIMOS_POR_COMPETICION.sql, parametros },
    ]);
    partidos = p as unknown as FilaProximoPartido[];
    resumen = r as unknown as FilaProximosPorCompeticion[];
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Próximos partidos" motivo={error.message} />;
    throw error;
  }

  // Los cruces del calendario previsto se piden aparte: su tabla sólo existe con la migración 0067
  // aplicada. Si la consulta falla, la pantalla sigue con los partidos que ya tienen fila.
  let previstos: FilaCrucePrevisto[] = [];
  try {
    previstos = await consulta<FilaCrucePrevisto>(PROXIMOS_DEL_CALENDARIO.sql,
      [TEMPORADA_EN_CURSO, filtros.dias, filtros.categoria], { presupuestoMs: PROXIMOS_DEL_CALENDARIO.presupuestoMs });
  } catch {
    previstos = [];
  }
  // ¿Está cargado el calendario futuro? `false` también si la tabla no existe: en los dos casos lo que
  // se le dice al visitante es lo mismo, que el calendario está pendiente de cargar.
  let hayCalendario = previstos.length > 0;
  if (!hayCalendario) {
    try {
      const [fila] = await consulta<{ hay: boolean }>(HAY_CALENDARIO_FUTURO.sql, [TEMPORADA_EN_CURSO]);
      hayCalendario = fila?.hay === true;
    } catch {
      hayCalendario = false;
    }
  }
  partidos = conCrucesPrevistos(partidos, previstos);

  const { con, sin } = agrupaProximos(partidos, resumen);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-titulo font-bold tracking-[-0.02em] text-[var(--texto)]">Próximos partidos</h1>
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          {partidos.length === 0
            ? `Temporada ${TEMPORADA_EN_CURSO}`
            : `${partidos.length} ${partidos.length === 1 ? 'partido' : 'partidos'} en ${con.length} ${con.length === 1 ? 'competición' : 'competiciones'} · ${TEMPORADA_EN_CURSO}`}
        </p>
      </header>

      <Filtros filtros={filtros} />

      {!hayCalendario && (
        <section className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-4">
          <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">Calendario pendiente de cargar</h2>
          <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
            Las jornadas que aún no se han jugado no están cargadas todavía.
            {con.length > 0 ? ' Debajo sólo aparecen los partidos con fecha ya publicada.' : ''}
          </p>
        </section>
      )}

      {con.length === 0 ? (
        hayCalendario && (
          <section className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-4">
            <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">Sin partidos en los próximos {filtros.dias} días</h2>
            <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
              No hay partidos con fecha en ese plazo
              {filtros.categoria ? ` para ${etiquetaCategoria(filtros.categoria).toLowerCase()}` : ''}.
              {filtros.dias < 30 && (
                <>
                  {' '}
                  <Link href={urlDeProximas({ ...filtros, dias: 30 }) as Route}
                    className="inline-flex min-h-11 items-center font-semibold text-[var(--accion)] hover:underline">
                    Ampliar a 30 días
                  </Link>
                </>
              )}
            </p>
          </section>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {con.map((competicion, i) => <Competicion key={competicion.edicionId} competicion={competicion} abierta={i < 3} />)}
        </div>
      )}

      {sin.length > 0 && (
        <section aria-labelledby="sin-proximos" className="flex flex-col gap-2">
          <h2 id="sin-proximos" className="m-0 text-bloque font-bold text-[var(--texto)]">
            {hayCalendario ? `Sin partidos en ${filtros.dias} días` : 'Sin calendario futuro cargado'}
          </h2>
          <ul className="m-0 list-none overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-0">
            {sin.map((c) => (
              <li key={c.edicion_id} className="border-t border-[var(--fondo-sutil)] first:border-t-0">
                <Link href={`/explorar/competicion/${c.grupo_id}` as Route}
                  className="flex min-h-11 flex-col justify-center gap-0.5 px-4 py-2 hover:bg-[var(--fondo-sutil)]">
                  <span className="text-tabla font-semibold text-[var(--texto)]">{c.edicion}</span>
                  <span className="text-nota tabular-nums text-[var(--texto-suave)]">{frescura(c.ultimo_resultado, c.atrasados)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** «Resultados hasta el 8 nov · 12 partidos sin resultado». */
function frescura(ultimo: string | null, atrasados: number): string {
  const hasta = ultimo ? `Resultados hasta el ${diaYMes(ultimo)}` : 'Sin resultados todavía';
  if (atrasados === 0) return hasta;
  return `${hasta} · ${atrasados} ${atrasados === 1 ? 'partido pasado sin resultado' : 'partidos pasados sin resultado'}`;
}

function Filtros({ filtros }: { filtros: FiltrosProximas }) {
  const base = 'inline-flex min-h-11 items-center rounded-[var(--radius-md)] border px-3 text-tabla font-semibold';
  const clase = (activa: boolean) => `${base} ${activa
    ? 'border-[var(--accion)] bg-[var(--accion)] text-[var(--texto-inverso)]'
    : 'border-[var(--borde)] bg-[var(--fondo-elevado)] text-[var(--texto)] hover:border-[var(--accion)]'}`;
  return (
    <nav aria-label="Filtros" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {VENTANAS.map((dias) => (
          <Link key={dias} href={urlDeProximas({ ...filtros, dias }) as Route}
            aria-current={filtros.dias === dias ? 'true' : undefined} className={clase(filtros.dias === dias)}>
            {dias} días
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={urlDeProximas({ ...filtros, categoria: null }) as Route}
          aria-current={filtros.categoria === null ? 'true' : undefined} className={clase(filtros.categoria === null)}>
          Todas
        </Link>
        {CATEGORIAS_FILTRABLES.map((categoria) => (
          <Link key={categoria} href={urlDeProximas({ ...filtros, categoria }) as Route}
            aria-current={filtros.categoria === categoria ? 'true' : undefined} className={clase(filtros.categoria === categoria)}>
            {etiquetaCategoria(categoria)}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function Competicion({ competicion, abierta }: { competicion: CompeticionConProximos; abierta: boolean }) {
  return (
    <details open={abierta}
      className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <summary className="flex min-h-11 cursor-pointer flex-col justify-center gap-0.5 px-4 py-3">
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 break-words text-bloque font-bold text-[var(--texto)]">{competicion.edicion}</span>
          <span className="flex-none text-tabla tabular-nums text-[var(--texto-suave)]">{competicion.partidos}</span>
        </span>
        <span className="text-nota tabular-nums text-[var(--texto-suave)]">
          {frescura(competicion.ultimoResultado, competicion.atrasados)}
        </span>
      </summary>
      {competicion.fechas.map((dia) => (
        <section key={dia.fecha} className="border-t border-[var(--borde)]">
          <h3 className="m-0 flex items-baseline justify-between gap-3 bg-[var(--fondo-sutil)] px-4 py-2 text-nota font-semibold text-[var(--texto)]">
            <span>{diaCorto(dia.fecha)}</span>
            <span className="flex-none tabular-nums text-[var(--texto-suave)]">
              {dia.partidos.length} {dia.partidos.length === 1 ? 'partido' : 'partidos'}
            </span>
          </h3>
          <ul className="m-0 list-none p-0">
            {dia.partidos.map((p) => {
              const prediccion = linea1X2(p);
              return (
                <li key={p.match_id ?? `c-${p.grupo_id}-${p.jornada}-${p.orden}`} className="border-t border-[var(--fondo-sutil)] first:border-t-0">
                  <Link href={(p.match_id !== null ? `/explorar/previa/${p.match_id}` : `/explorar/competicion/${p.grupo_id}`) as Route}
                    className="flex min-h-11 flex-col justify-center gap-0.5 px-4 py-2 hover:bg-[var(--fondo-sutil)]">
                    <span className="break-words text-nota tabular-nums text-[var(--texto-suave)]">
                      {competicion.grupos.length > 1 ? `${p.grupo} · ` : ''}Jornada {p.jornada}
                    </span>
                    <span className="break-words text-tabla font-semibold text-[var(--texto)]">
                      {p.local} <span className="font-normal text-[var(--texto-suave)]">–</span> {p.visitante}
                    </span>
                    {prediccion && (
                      <span className="text-nota tabular-nums text-[var(--texto-suave)]">{prediccion}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </details>
  );
}
