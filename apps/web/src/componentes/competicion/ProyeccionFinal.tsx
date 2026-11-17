import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPortadaGrupo, FilaSimulacionFinal } from '@/consultas/competiciones';
import type { ZonasDelGrupo } from '@/lib/pantalla-competicion';
import {
  porcentajeDeProbabilidad as porcentajeGeneral, simulacionCubreLoQueQueda, textoDeTramo, tramoMasProbable, tramosDelReglamento,
  unDecimal,
} from '@/lib/proyeccion';

const porcentaje = (p: number) => porcentajeGeneral(Math.min(p, 99.99));

/** Zona dominante de un equipo, para el filo de color de la fila. */
function zonaDe(e: { probs: number[]; zonas: ReturnType<typeof tramosDelReglamento> }): 'ascenso' | 'promocion' | 'descenso' | 'medio' {
  const p = (t: { probabilidad: number } | null) => t?.probabilidad ?? 0;
  if (p(e.zonas.descenso) >= 50) return 'descenso';
  if (p(e.zonas.ascenso) >= 50) return 'ascenso';
  if (p(e.zonas.promocion) >= 40) return 'promocion';
  return 'medio';
}

const FILO: Record<string, string> = {
  ascenso: 'border-l-[var(--victoria)]',
  promocion: 'border-l-[var(--accion)]',
  descenso: 'border-l-[var(--derrota)]',
  medio: 'border-l-[var(--borde)]',
};

/**
 * Clasificación final: una tabla legible, no una tarjeta por equipo. La primera lectura es el puesto
 * esperado y el rango en el que acaba ocho de cada diez veces; las probabilidades de campeón, ascenso y
 * descenso van en columnas. La matriz completa de puesto a puesto queda plegada y se desplaza dentro de
 * su caja: es el detalle, no la portada.
 */
export function ProyeccionFinal({ grupo, filas, zonas }: {
  grupo: FilaPortadaGrupo;
  filas: readonly FilaSimulacionFinal[];
  zonas: ZonasDelGrupo | null;
}) {
  const rutaClasificacion = `/explorar/competicion/${grupo.grupo_id}` as Route;
  if (filas.length === 0) {
    return (
      <Aviso titulo="Sin clasificación final estimada">
        Todavía no hay estimación de la clasificación final de este grupo.{' '}
        <Link href={rutaClasificacion} className="inline-flex min-h-11 items-center font-semibold text-[var(--accion)] hover:underline">Ver la clasificación</Link>
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
      <Aviso titulo="Clasificación final pendiente de recalcular">
        La última estimación ({primera.calculado_en}) se hizo sin las jornadas que quedan por publicar y
        no se muestra.{' '}
        <Link href={rutaClasificacion} className="inline-flex min-h-11 items-center font-semibold text-[var(--accion)] hover:underline">Ver la clasificación</Link>
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
  const n = equipos[0]?.probs.length ?? 0;

  return (
    <section aria-labelledby="proyeccion" className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="proyeccion" className="m-0 text-bloque font-bold text-[var(--texto)]">Clasificación final estimada</h2>
          <p className="m-0 text-nota text-[var(--texto-suave)]">{primera.equipos} equipos · {primera.simulaciones.toLocaleString('es-ES')} simulaciones</p>
        </div>
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          {simulados} partidos por jugar · {primera.calculado_en}
          {deducidos > 0 ? ` · ${deducidos} deducidos del formato de liga` : ''}
        </p>
      </header>

      <div className="overflow-x-auto rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]" tabIndex={0} role="region" aria-label="Clasificación final estimada">
        <table className="w-full min-w-[560px] border-collapse text-tabla">
          <caption className="sr-only">Puesto esperado, puntos y probabilidades de cada equipo</caption>
          <thead>
            <tr className="border-b border-[var(--borde)] text-left text-etiqueta text-[var(--texto-suave)]">
              <th scope="col" className="px-2 py-2 text-right font-semibold">#</th>
              <th scope="col" className="px-2 py-2 font-semibold">Equipo</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Pts</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Acaba</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Campeón</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Ascenso</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Descenso</th>
            </tr>
          </thead>
          <tbody>
            {equipos.map((e) => {
              const zona = zonaDe(e);
              return (
                <tr key={e.id} className={`border-b border-l-4 border-[var(--fondo-sutil)] ${FILO[zona]} last:border-b-0`}>
                  <td className="px-2 py-2 text-right align-top tabular-nums font-bold text-[var(--texto)]">{unDecimal(e.posicion)}</td>
                  <td className="px-2 py-2 align-top">
                    <span className="block font-semibold text-[var(--texto)]">{e.nombre}</span>
                    <span className="block text-etiqueta text-[var(--texto-suave)]">
                      {e.tramo ? `80 %: ${textoDeTramo(e.tramo)}` : 'sin rango'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right align-top tabular-nums text-[var(--texto)]">{Math.round(e.puntos)}</td>
                  <td className="px-2 py-2 text-right align-top tabular-nums text-[var(--texto)]">{e.tramo ? porcentaje(e.tramo.probabilidad) : '—'}</td>
                  <td className="px-2 py-2 text-right align-top tabular-nums text-[var(--texto)]">{e.campeon >= 1 ? porcentaje(e.campeon) : '—'}</td>
                  <td className="px-2 py-2 text-right align-top tabular-nums text-[var(--texto)]">{e.zonas.ascenso && e.zonas.ascenso.probabilidad >= 1 ? porcentaje(e.zonas.ascenso.probabilidad) : '—'}</td>
                  <td className="px-2 py-2 text-right align-top tabular-nums text-[var(--texto)]">{e.zonas.descenso && e.zonas.descenso.probabilidad >= 1 ? porcentaje(e.zonas.descenso.probabilidad) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-etiqueta text-[var(--texto-suave)]" aria-label="Leyenda">
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-1 bg-[var(--victoria)]" /> Ascenso</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-1 bg-[var(--accion)]" /> Fase de ascenso</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-1 bg-[var(--derrota)]" /> Descenso</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-1 bg-[var(--borde)]" /> Zona media</span>
      </div>

      <details className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-tabla font-semibold text-[var(--texto)]">
          Matriz de puestos
          <span className="text-etiqueta font-normal text-[var(--texto-suave)]">probabilidad de acabar en cada puesto</span>
        </summary>
        <div className="overflow-x-auto p-2" tabIndex={0} role="region" aria-label="Matriz de puestos">
          <table className="border-collapse text-etiqueta">
            <caption className="sr-only">Probabilidad de cada equipo de acabar en cada puesto, del 1 al {n}</caption>
            <thead><tr><th scope="col" className="sticky left-0 bg-[var(--fondo-elevado)] px-1 py-1 text-left font-semibold text-[var(--texto-suave)]">Equipo</th>
              {Array.from({ length: n }, (_, i) => <th key={i} scope="col" className="px-1 py-1 text-right font-semibold tabular-nums text-[var(--texto-suave)]">{i + 1}</th>)}
            </tr></thead>
            <tbody>
              {equipos.map((e) => (
                <tr key={e.id}>
                  <th scope="row" className="sticky left-0 max-w-[140px] truncate bg-[var(--fondo-elevado)] px-1 py-0.5 text-left font-medium text-[var(--texto)]">{e.nombre}</th>
                  {e.probs.map((p, i) => (
                    <td key={i} title={`${e.nombre}: ${i + 1}.º ${porcentaje(p)}`}
                      className="px-1 py-0.5 text-right tabular-nums text-[var(--texto)]"
                      style={{ background: p >= 1 ? `color-mix(in oklab, var(--accion) ${Math.min(55, (p / maximo) * 55)}%, transparent)` : undefined }}>
                      {p >= 1 ? Math.round(p) : '·'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="m-0 text-nota text-[var(--texto-suave)]">
        «Acaba» es el tramo de puestos que reúne al menos el 80 % de la simulación. Los porcentajes de un
        equipo suman 100 % entre todos sus puestos.{' '}
        <Link href={'/explorar/modelo' as Route} className="inline-flex min-h-11 items-center font-semibold text-[var(--accion)] hover:underline">Cómo se calcula</Link>
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
