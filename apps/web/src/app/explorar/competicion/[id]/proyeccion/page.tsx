import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import {
  GRUPO_POR_ID, SIMULACION_DEL_GRUPO,
  type FilaPortadaGrupo, type FilaSimulacionFinal,
} from '@/consultas/competiciones';
import { SinCanonico } from '@/componentes/SinCanonico';

export const revalidate = 60;

function idDeGrupo(crudo: string | undefined): number {
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

const portadaDe = cache(async (id: number): Promise<FilaPortadaGrupo | undefined> => {
  const [fila] = await consulta<FilaPortadaGrupo>(GRUPO_POR_ID.sql, [id]);
  return fila;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeGrupo(crudo);
  if (Number.isNaN(id)) return {};
  try {
    const p = await portadaDe(id);
    return p ? { title: `Clasificación final estimada · ${p.edicion} · ${p.grupo} — Fondo Popular` } : {};
  } catch { return {}; }
}

/**
 * Clasificación final estimada por Monte Carlo (0062): resumen legible y, debajo, la matriz de
 * probabilidad de cada puesto. La tabla ancha se desplaza dentro de sí misma y la primera columna queda
 * fija para no perder el equipo al mirar los puestos.
 */
export default async function PantallaFinal({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeGrupo(crudo);
  if (Number.isNaN(id)) notFound();

  let portada: FilaPortadaGrupo | undefined;
  let filas: FilaSimulacionFinal[] = [];
  try {
    portada = await portadaDe(id);
    if (portada) filas = await consulta<FilaSimulacionFinal>(SIMULACION_DEL_GRUPO.sql, [id]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Clasificación final" motivo={error.message} />;
    throw error;
  }
  if (!portada) notFound();

  const equipos = filas[0]?.equipos ?? 0;
  const simulaciones = filas[0]?.simulaciones ?? 0;
  const calculado = filas[0]?.calculado_en ?? null;
  const pct = (p: number) => (p <= 0 ? '·' : p < 0.5 ? '<1 %' : `${p.toFixed(0)} %`);
  const resumen = filas.map((f) => {
    const probs = Array.isArray(f.prob_posiciones) ? f.prob_posiciones : [];
    const primero = probs[0] ?? 0;
    const top3 = probs.slice(0, 3).reduce((s, p) => s + p, 0);
    const bottom3 = probs.slice(-3).reduce((s, p) => s + p, 0);
    return { ...f, probs, primero, top3, bottom3 };
  });

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
        <Link className="hover:underline" href={`/explorar/competicion/${portada.grupo_id}` as Route}>
          {portada.edicion} · {portada.grupo}
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--texto)]">Clasificación final estimada</span>
      </nav>

      <header>
        <h1 className="m-0 text-titulo font-bold tracking-[-0.02em] text-[var(--texto)]">Clasificación final estimada</h1>
        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
          {portada.edicion} · {portada.grupo} · {portada.temporada}
        </p>
        <p className="m-0 mt-2 max-w-[70ch] text-tabla text-[var(--texto-suave)]">
          Simulación de las jornadas que quedan con la fuerza de cada equipo, su forma reciente y la ventaja
          de jugar en casa. No es una promesa: es el reparto de finales posibles.
        </p>
        {simulaciones > 0 && (
          <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">
            Pronóstico: {simulaciones.toLocaleString('es-ES')} simulaciones{calculado ? ` · calculado el ${calculado}` : ''}.
          </p>
        )}
      </header>

      {resumen.length === 0
        ? <p className="text-tabla text-[var(--texto-suave)]">Todavía no hay simulación para este grupo.</p>
        : (
          <>
            <section aria-labelledby="resumen-final"
              className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
              <h2 id="resumen-final" className="m-0 border-b border-[var(--fondo-sutil)] px-4 py-3 text-bloque font-bold text-[var(--texto)]">
                Resumen
              </h2>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Resumen de la clasificación final estimada">
                <table className="w-full border-collapse text-tabla">
                  <thead>
                    <tr className="text-left text-etiqueta text-[var(--texto-suave)]">
                      <th scope="col" className="px-3 py-2 font-semibold">Pos.</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Equipo</th>
                      <th scope="col" className="hidden px-3 py-2 text-right font-semibold md:table-cell">Puntos</th>
                      <th scope="col" className="hidden px-3 py-2 text-right font-semibold md:table-cell">P(1.º)</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">P(top 3)</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">P(bottom 3)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.map((f) => (
                      <tr key={f.team_entry_id} className="border-t border-[var(--fondo-sutil)]">
                        <td className="px-3 py-1.5 tabular-nums font-bold text-[var(--texto)]">{f.posicion_esperada.toFixed(1)}</td>
                        <td className="px-3 py-1.5 text-[var(--texto)]">{f.nombre_corto ?? f.nombre}</td>
                        <td className="hidden px-3 py-1.5 text-right tabular-nums text-[var(--texto)] md:table-cell">{f.puntos_medios.toFixed(1)}</td>
                        <td className="hidden px-3 py-1.5 text-right tabular-nums text-[var(--texto)] md:table-cell">{f.primero.toFixed(1)} %</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--texto)]">{f.top3.toFixed(1)} %</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-[var(--texto)]">{f.bottom3.toFixed(1)} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="detalle-final" className="lg:hidden">
              <h2 id="detalle-final" className="m-0 px-1 pb-2 text-bloque font-bold text-[var(--texto)]">Detalle por puesto</h2>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {resumen.map((f) => (
                  <li key={f.team_entry_id} className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-3 py-2">
                    <details>
                      <summary className="flex cursor-pointer items-baseline justify-between gap-2 text-tabla">
                        <span className="min-w-0 break-words font-medium text-[var(--texto)]">{f.nombre_corto ?? f.nombre}</span>
                        <span className="flex-none tabular-nums text-[var(--texto-suave)]">pos. {f.posicion_esperada.toFixed(1)}</span>
                      </summary>
                      <div className="mt-2 flex h-20 items-end gap-px" aria-hidden="true">
                        {f.probs.map((p, i) => (
                          <span key={i} title={`Puesto ${i + 1}: ${pct(p)}`}
                            className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
                            <span className="w-full rounded-t-[2px] bg-[var(--accion)]" style={{ height: `${Math.max(2, Math.min(100, p))}%` }} />
                            <span className="text-[9px] tabular-nums text-[var(--texto-suave)]">{i + 1}</span>
                          </span>
                        ))}
                      </div>
                      <p className="m-0 mt-1 text-etiqueta text-[var(--texto-suave)]">Cada barra es la probabilidad de acabar en ese puesto.</p>
                    </details>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="matriz-final"
              className="hidden overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] lg:block">
              <h2 id="matriz-final" className="m-0 border-b border-[var(--fondo-sutil)] px-4 py-3 text-bloque font-bold text-[var(--texto)]">
                Probabilidad de cada puesto
              </h2>
              <p className="m-0 px-4 pt-2 text-etiqueta text-[var(--texto-suave)]">
                Cada fila suma 100 %. Desliza en horizontal para ver todos los puestos.
              </p>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Probabilidad de cada puesto">
                <table className="min-w-[860px] border-collapse text-tabla">
                  <caption className="sr-only">Porcentaje de veces que cada equipo acaba en cada puesto ({equipos} equipos)</caption>
                  <thead>
                    <tr className="text-etiqueta text-[var(--texto-suave)]">
                      <th scope="col" className="sticky left-0 z-10 bg-[var(--fondo-elevado)] px-3 py-2 text-left font-semibold">Equipo</th>
                      {Array.from({ length: equipos }, (_, i) => (
                        <th key={i} scope="col" className="px-1.5 py-2 text-right font-semibold tabular-nums">{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.map((f) => (
                      <tr key={f.team_entry_id} className="border-t border-[var(--fondo-sutil)]">
                        <th scope="row" className="sticky left-0 z-10 max-w-[180px] truncate bg-[var(--fondo-elevado)] px-3 py-1.5 text-left font-medium text-[var(--texto)]">
                          {f.nombre_corto ?? f.nombre}
                        </th>
                        {Array.from({ length: equipos }, (_, i) => {
                          const p = f.probs[i] ?? 0;
                          return (
                            <td key={i} title={`${f.nombre_corto ?? f.nombre}: ${p.toFixed(1)} % en el puesto ${i + 1}`}
                              style={{ backgroundColor: p > 0 ? `color-mix(in srgb, var(--accion) ${Math.min(60, 6 + p * 0.7)}%, transparent)` : undefined }}
                              className="px-1.5 py-1.5 text-right tabular-nums text-[var(--texto)]">
                              {pct(p)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
    </div>
  );
}
