import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { PROXIMA_JORNADA, type FilaProximaJornada } from '@/consultas/partidos';
import { SinCanonico } from '@/componentes/SinCanonico';
import { formateaPorcentaje } from '@/lib/prediccion';
import { Barra1X2 } from '@/componentes/partidos/Barra1X2';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Próxima jornada — Fondo Popular' };

/**
 * Próxima jornada por competición: los partidos pendientes de cada grupo, agrupados, con la predicción
 * 1-X-2 y el marcador más probable. Es la vista para saber qué se juega el próximo fin de semana sin
 * abrir grupo por grupo.
 */
export default async function PantallaProximas() {
  let filas: FilaProximaJornada[] = [];
  try {
    filas = await consulta<FilaProximaJornada>(PROXIMA_JORNADA.sql, []);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Próxima jornada" motivo={error.message} />;
    throw error;
  }

  // Primero se agrupa todo lo pendiente; después, para cada grupo, se elige la jornada siguiente:
  // la más baja posterior a la última jugada y, si no hay, la más baja pendiente (un aplazado).
  const porGrupo = new Map<string, FilaProximaJornada[]>();
  for (const fila of filas) {
    const clave = `${fila.edicion_id}:${fila.grupo_id}`;
    if (!porGrupo.has(clave)) porGrupo.set(clave, []);
    porGrupo.get(clave)!.push(fila);
  }
  const grupos = new Map<string, { edicion: string; grupo: string; grupoId: number; jornada: number; fecha: string | null; partidos: FilaProximaJornada[] }>();
  for (const [clave, todos] of porGrupo) {
    const primera = todos[0];
    const maxJugada = primera.max_jugada ?? 0;
    const posteriores = todos.filter((f) => f.jornada > maxJugada);
    const candidatos = posteriores.length > 0 ? posteriores : todos;
    const jornada = Math.min(...candidatos.map((f) => f.jornada));
    const partidos = todos.filter((f) => f.jornada === jornada);
    const fecha = partidos.find((f) => f.fecha !== null)?.fecha ?? null;
    grupos.set(clave, {
      edicion: primera.edicion, grupo: primera.grupo, grupoId: primera.grupo_id, jornada, fecha, partidos,
    });
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-titulo font-bold tracking-[-0.02em] text-[var(--texto)]">Próxima jornada</h1>
          <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
            Los partidos que quedan por jugar en cada competición, con la expectativa 1-X-2 de cada uno.
          </p>
        </div>
        <Link href={'/explorar/competiciones' as Route} className="text-tabla font-semibold text-[var(--accion)] hover:underline">
          Ver competiciones
        </Link>
      </header>

      {grupos.size === 0
        ? <p className="text-tabla text-[var(--texto-suave)]">No hay partidos pendientes con fecha próxima.</p>
        : (
          <div className="grid gap-4 xl:grid-cols-2">
            {[...grupos.entries()].map(([clave, grupo]) => (
              <section key={clave} aria-labelledby={`grupo-${clave}`}
                className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
                <header className="border-b border-[var(--fondo-sutil)] px-4 py-3">
                  <h2 id={`grupo-${clave}`} className="m-0 text-bloque font-bold text-[var(--texto)]">
                    {grupo.edicion} · {grupo.grupo}
                  </h2>
                  <p className="m-0 mt-0.5 text-etiqueta text-[var(--texto-suave)]">
                    Jornada {grupo.jornada}{grupo.fecha ? ` · ${grupo.fecha.split('-').reverse().join('/')}` : ''}
                  </p>
                </header>
                <ul className="m-0 list-none p-0">
                  {grupo.partidos.map((partido) => (
                    <li key={partido.match_id} className="border-t border-[var(--fondo-sutil)] px-4 py-2.5 first:border-t-0">
                      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0 break-words text-tabla font-medium text-[var(--texto)]">
                          {partido.local} <span className="text-[var(--texto-suave)]">–</span> {partido.visitante}
                        </span>
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-etiqueta tabular-nums text-[var(--texto-suave)]">
                          <span><strong className="text-[var(--texto)]">1</strong> {partido.pred_local == null ? '—' : formateaPorcentaje(partido.pred_local)}</span>
                          <span><strong className="text-[var(--texto)]">X</strong> {partido.pred_empate == null ? '—' : formateaPorcentaje(partido.pred_empate)}</span>
                          <span><strong className="text-[var(--texto)]">2</strong> {partido.pred_visitante == null ? '—' : formateaPorcentaje(partido.pred_visitante)}</span>
                          <span className="rounded bg-[var(--fondo-sutil)] px-1.5 py-0.5">
                            {partido.pred_marcador ?? 'sin marcador'}
                          </span>
                        </span>
                      </div>
                      {partido.pred_local != null && partido.pred_empate != null && partido.pred_visitante != null && (
                        <div className="mt-1.5">
                          <Barra1X2 local={partido.pred_local} empate={partido.pred_empate} visitante={partido.pred_visitante} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <footer className="border-t border-[var(--fondo-sutil)] px-4 py-2">
                  <Link href={`/explorar/competicion/${grupo.grupoId}` as Route}
                    className="text-etiqueta font-semibold text-[var(--accion)] hover:underline">
                    Ver competición
                  </Link>
                </footer>
              </section>
            ))}
          </div>
        )}
    </div>
  );
}
