import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPortadaGrupo, FilaSimulacionFinal } from '@/consultas/competiciones';
import type { ZonasDelGrupo } from '@/lib/pantalla-competicion';
import {
  porcentajeDeProbabilidad, simulacionCubreLoQueQueda, textoDeTramo, tramoMasProbable, tramosDelReglamento,
  unDecimal,
} from '@/lib/proyeccion';

/**
 * Contenido de la pestaña «Proyección».
 *
 * Una fila por equipo, pensada para 390 px: puesto medio, nombre, puntos estimados y el tramo de
 * puestos en el que acaba ocho de cada diez veces. Debajo de cada equipo, las probabilidades que
 * importan con su rango escrito (campeón, ascenso, descenso). El reparto puesto a puesto se abre bajo
 * demanda: es el detalle, no la lectura principal.
 *
 * Tres estados antes de la tabla, cada uno con su texto: no hay simulación; la hay pero no cubre lo
 * que queda de liga (no se enseña); la hay y además parte del calendario está deducido (se dice).
 */
export function ProyeccionFinal({ grupo, filas, zonas }: {
  grupo: FilaPortadaGrupo;
  filas: readonly FilaSimulacionFinal[];
  zonas: ZonasDelGrupo | null;
}) {
  const rutaClasificacion = `/explorar/competicion/${grupo.grupo_id}` as Route;
  if (filas.length === 0) {
    return (
      <Aviso titulo="Sin proyección">
        Este grupo no tiene clasificación final estimada: o ya ha terminado, o su formato (fases,
        eliminatorias) no permite saber qué partidos quedan.{' '}
        <Link href={rutaClasificacion} className="font-semibold text-[var(--accion)] hover:underline">Ver la clasificación</Link>
      </Aviso>
    );
  }

  const primera = filas[0];
  const cubre = simulacionCubreLoQueQueda({
    equipos: primera.equipos,
    jornadasPrevistas: grupo.jornadas_previstas,
    jornadaActual: grupo.jornada_actual,
    partidosPendientes: primera.partidos_pendientes,
    partidosDeducidos: primera.partidos_deducidos,
  });
  if (!cubre) {
    return (
      <Aviso titulo="Proyección pendiente de recalcular">
        La última estimación ({primera.calculado_en}) se hizo sin las jornadas que quedan por publicar y
        no se muestra.{' '}
        <Link href={rutaClasificacion} className="font-semibold text-[var(--accion)] hover:underline">Ver la clasificación</Link>
      </Aviso>
    );
  }

  const equipos = filas.map((f) => {
    const probs = Array.isArray(f.prob_posiciones) ? f.prob_posiciones.map(Number) : [];
    return {
      id: f.team_entry_id,
      nombre: f.nombre_corto ?? f.nombre,
      posicion: f.posicion_esperada,
      puntos: f.puntos_medios,
      probs,
      campeon: probs[0] ?? 0,
      tramo: tramoMasProbable(probs),
      zonas: tramosDelReglamento(probs, zonas),
    };
  });
  const maximo = Math.max(1, ...equipos.flatMap((e) => e.probs));
  const deducidos = primera.partidos_deducidos ?? 0;
  const simulados = (primera.partidos_pendientes ?? 0) + deducidos;

  return (
    <section aria-labelledby="proyeccion" className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <h2 id="proyeccion" className="m-0 text-bloque font-bold text-[var(--texto)]">Clasificación final estimada</h2>
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          {simulados} partidos por jugar · {primera.simulaciones.toLocaleString('es-ES')} simulaciones · {primera.calculado_en}
        </p>
        {deducidos > 0 && (
          <p className="m-0 text-nota text-[var(--texto-suave)]">
            {deducidos} de esos partidos aún no tienen fecha publicada: se cuentan por el formato de liga.
          </p>
        )}
      </header>

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {equipos.map((e) => (
          <li key={e.id}
            className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-3 py-3">
            <div className="flex items-baseline gap-3">
              <span className="w-8 flex-none text-right text-bloque font-bold tabular-nums text-[var(--texto)]">
                {unDecimal(e.posicion)}
              </span>
              <span className="min-w-0 flex-1 break-words text-tabla font-semibold text-[var(--texto)]">{e.nombre}</span>
              <span className="flex-none text-tabla tabular-nums text-[var(--texto-suave)]">
                {Math.round(e.puntos)} pts
              </span>
            </div>
            <dl className="m-0 mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-11 text-nota tabular-nums text-[var(--texto-suave)]">
              {e.tramo && (
                <div className="flex gap-1">
                  <dt>Acaba {textoDeTramo(e.tramo)}</dt>
                  <dd className="m-0 font-semibold text-[var(--texto)]">{porcentajeDeProbabilidad(e.tramo.probabilidad)}</dd>
                </div>
              )}
              {e.campeon >= 1 && (
                <div className="flex gap-1">
                  <dt>Campeón</dt>
                  <dd className="m-0 font-semibold text-[var(--texto)]">{porcentajeDeProbabilidad(e.campeon)}</dd>
                </div>
              )}
              {e.zonas.ascenso && e.zonas.ascenso.hasta > 1 && e.zonas.ascenso.probabilidad >= 1 && (
                <div className="flex gap-1">
                  <dt>Ascenso ({textoDeTramo(e.zonas.ascenso)})</dt>
                  <dd className="m-0 font-semibold text-[var(--texto)]">{porcentajeDeProbabilidad(e.zonas.ascenso.probabilidad)}</dd>
                </div>
              )}
              {e.zonas.promocion && e.zonas.promocion.probabilidad >= 1 && (
                <div className="flex gap-1">
                  <dt>Fase de ascenso ({textoDeTramo(e.zonas.promocion)})</dt>
                  <dd className="m-0 font-semibold text-[var(--texto)]">{porcentajeDeProbabilidad(e.zonas.promocion.probabilidad)}</dd>
                </div>
              )}
              {e.zonas.descenso && e.zonas.descenso.probabilidad >= 1 && (
                <div className="flex gap-1">
                  <dt>Descenso ({textoDeTramo(e.zonas.descenso)})</dt>
                  <dd className="m-0 font-semibold text-[var(--texto)]">{porcentajeDeProbabilidad(e.zonas.descenso.probabilidad)}</dd>
                </div>
              )}
            </dl>
            <details className="mt-2 pl-11">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-nota font-semibold text-[var(--accion)]">
                Puesto a puesto
              </summary>
              <div className="flex h-16 items-end gap-px" role="img"
                aria-label={`Probabilidad de ${e.nombre} en cada puesto, del 1.º al ${e.probs.length}.º`}>
                {e.probs.map((p, i) => (
                  <span key={i} title={`${i + 1}.º: ${porcentajeDeProbabilidad(p)}`} className="flex h-full flex-1 items-end">
                    <span className="w-full rounded-t-[2px] bg-[var(--accion)]"
                      style={{ height: p > 0 ? `${Math.max(3, (p / maximo) * 100)}%` : '0' }} />
                  </span>
                ))}
              </div>
              <div className="flex justify-between text-etiqueta tabular-nums text-[var(--texto-suave)]">
                <span>1.º</span><span>{e.probs.length}.º</span>
              </div>
              <table className="mt-2 w-full border-collapse text-nota">
                <caption className="sr-only">Probabilidad de {e.nombre} en cada puesto</caption>
                <tbody>
                  {e.probs.map((p, i) => (p >= 1 ? (
                    <tr key={i} className="border-t border-[var(--fondo-sutil)]">
                      <th scope="row" className="py-1 text-left font-normal text-[var(--texto-suave)]">{i + 1}.º</th>
                      <td className="py-1 text-right tabular-nums text-[var(--texto)]">{porcentajeDeProbabilidad(p)}</td>
                    </tr>
                  ) : null))}
                </tbody>
              </table>
            </details>
          </li>
        ))}
      </ol>

      <p className="m-0 text-nota text-[var(--texto-suave)]">
        Los porcentajes de un equipo suman 100 % entre todos sus puestos.{' '}
        <Link href={'/explorar/modelo' as Route} className="font-semibold text-[var(--accion)] hover:underline">Cómo se calcula</Link>
      </p>
    </section>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-4">
      <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
      <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">{children}</p>
    </section>
  );
}
