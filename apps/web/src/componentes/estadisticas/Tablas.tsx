import Link from 'next/link';
import type { Route } from 'next';
import { Escudo } from '@/componentes/Escudo';
import type { GoleadorConAcumulado, FilaCasaFuera } from '@/lib/estadisticas';
import { nombrePublicado, numero } from '@/lib/estadisticas';
import { estiloForma } from '@/lib/pantalla-competicion';
import { ENLACE, TARJETA } from './controles';

/**
 * Tablas de apoyo de las estadísticas (listas con la misma información que los gráficos).
 *
 * Se usan listas y no tablas anchas para que a 360/400 px no haya desplazamiento horizontal; las cifras
 * van con `tabular-nums` porque se comparan en vertical.
 */

export function ListaGoleadores({ filas, golesDelAmbito, titulo = 'Goleadores', mostrarAcumulado = true }: {
  filas: readonly GoleadorConAcumulado[];
  golesDelAmbito: number;
  titulo?: string;
  /** En una federación entera el porcentaje de un jugador es ~0: se enseña «PJ» en su lugar. */
  mostrarAcumulado?: boolean;
}) {
  const maximo = Math.max(1, ...filas.map((fila) => fila.goles));
  return (
    <section aria-labelledby="goleadores" className={TARJETA}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
        <h2 id="goleadores" className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
        <p className="m-0 text-nota text-[var(--texto-suave)]">{numero(golesDelAmbito)} goles en el ámbito</p>
      </div>
      {filas.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Sin goleadores publicados.
          </p>
        )
        : (
          <ul className="m-0 list-none p-0">
            {filas.map((fila, indice) => (
              <li key={`${fila.persona_id}-${fila.equipo}`}
                className="flex items-center gap-2.5 border-t border-[var(--fondo-sutil)] px-4 py-2.5">
                <span className="w-5 flex-none text-right text-tabla font-bold tabular-nums text-[var(--texto-suave)]">
                  {indice + 1}
                </span>
                <Escudo equipoId={fila.club_id ?? fila.persona_id} nombre={fila.equipo}
                  clubId={fila.club_id} tieneEscudo={fila.tiene_escudo} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-tabla font-semibold text-[var(--texto)]">{nombrePublicado(fila.nombre)}</p>
                  <p className="m-0 truncate text-nota text-[var(--texto-suave)]">{fila.equipo}</p>
                  <span aria-hidden="true" className="mt-1 block h-1.5 rounded-full bg-[var(--accion)]"
                    style={{ width: `${Math.round((100 * fila.goles) / maximo)}%` }} />
                </div>
                <div className="flex flex-none flex-col items-end">
                  <span className="text-dato font-extrabold tabular-nums text-[var(--texto)]">{fila.goles}</span>
                  {mostrarAcumulado && fila.acumulado !== null && (
                    <span className="text-nota tabular-nums text-[var(--texto-suave)]">{fila.acumulado} %</span>
                  )}
                  {!mostrarAcumulado && (
                    <span className="text-nota tabular-nums text-[var(--texto-suave)]">{fila.partidos} PJ</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

function marcadorCorto(g: number, e: number, p: number, puntos: number): string {
  return `${g}-${e}-${p} · ${puntos} pts`;
}

export function TablaCasaFuera({ filas }: { filas: readonly FilaCasaFuera[] }) {
  return (
    <section aria-labelledby="casa-fuera" className={TARJETA}>
      <div className="px-4 py-3.5">
        <h2 id="casa-fuera" className="m-0 text-bloque font-bold text-[var(--texto)]">Casa y fuera</h2>
        <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">Ganados-Empatados-Perdidos y puntos en cada condición</p>
      </div>
      {filas.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Sin partidos con resultado.
          </p>
        )
        : (
          <ul className="m-0 list-none p-0">
            {filas.map((fila) => (
              <li key={fila.id} className="border-t border-[var(--fondo-sutil)] px-4 py-2.5">
                <p className="m-0 text-tabla font-medium text-[var(--texto)]">{fila.nombre}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-nota text-[var(--texto-suave)]">
                  <span className="flex items-center gap-1.5"
                    title={`Casa: ${marcadorCorto(fila.casa.ganados, fila.casa.empatados, fila.casa.perdidos, fila.casa.puntos)}`}>
                    <span className="text-etiqueta uppercase tracking-[0.05em]">Casa</span>
                    <span className="tabular-nums font-semibold text-[var(--texto)]">
                      {marcadorCorto(fila.casa.ganados, fila.casa.empatados, fila.casa.perdidos, fila.casa.puntos)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5"
                    title={`Fuera: ${marcadorCorto(fila.fuera.ganados, fila.fuera.empatados, fila.fuera.perdidos, fila.fuera.puntos)}`}>
                    <span className="text-etiqueta uppercase tracking-[0.05em]">Fuera</span>
                    <span className="tabular-nums font-semibold text-[var(--texto)]">
                      {marcadorCorto(fila.fuera.ganados, fila.fuera.empatados, fila.fuera.perdidos, fila.fuera.puntos)}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

const PALABRA_FORMA = { G: 'Ganado', E: 'Empate', P: 'Perdido' } as const;

export function InsigniasForma({ forma }: { forma: readonly ('G' | 'E' | 'P')[] }) {
  if (forma.length === 0) return <span className="text-nota text-[var(--texto-suave)]">—</span>;
  return (
    <span className="flex gap-[3px]">
      {forma.map((letra, i) => (
        <span key={`${letra}-${i}`} title={PALABRA_FORMA[letra]}
          className="flex size-5 items-center justify-center rounded-[5px] text-[10px] font-bold"
          style={estiloForma(letra)}>
          <span aria-hidden="true">{letra}</span>
          <span className="sr-only">{PALABRA_FORMA[letra]}</span>
        </span>
      ))}
    </span>
  );
}

export function TablaForma({ filas }: { filas: ReadonlyArray<{ id: number; nombre: string; forma: Array<'G' | 'E' | 'P'> }> }) {
  return (
    <section aria-labelledby="forma" className={TARJETA}>
      <div className="px-4 py-3.5">
        <h2 id="forma" className="m-0 text-bloque font-bold text-[var(--texto)]">Forma</h2>
        <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">Últimos cinco partidos, del más antiguo al más reciente</p>
      </div>
      {filas.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Sin resultados publicados.
          </p>
        )
        : (
          <ul className="m-0 list-none p-0">
            {filas.map((fila) => (
              <li key={fila.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--fondo-sutil)] px-4 py-2">
                <span className="min-w-0 flex-1 text-tabla font-medium text-[var(--texto)]">{fila.nombre}</span>
                <InsigniasForma forma={fila.forma} />
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

export function TablaDisciplina({ filas }: { filas: ReadonlyArray<{ equipo_id: number; equipo: string; amarillas: number; rojas: number }> }) {
  return (
    <section aria-labelledby="disciplina" className={TARJETA}>
      <div className="px-4 py-3.5">
        <h2 id="disciplina" className="m-0 text-bloque font-bold text-[var(--texto)]">Disciplina</h2>
        <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">Tarjetas por equipo</p>
      </div>
      {filas.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Sin tarjetas publicadas.
          </p>
        )
        : (
          <ul className="m-0 list-none p-0">
            {filas.map((fila) => (
              <li key={fila.equipo_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--fondo-sutil)] px-4 py-2.5">
                <span className="min-w-0 flex-1 text-tabla font-medium text-[var(--texto)]">{fila.equipo}</span>
                <span className="flex items-center gap-1.5 text-nota text-[var(--texto-suave)]">
                  <span aria-hidden="true" className="size-3 rounded-[3px] bg-[var(--amarilla)]" />
                  <span className="text-etiqueta font-semibold uppercase tracking-[0.05em]">A</span>
                  <span className="tabular-nums font-semibold text-[var(--texto)]">{fila.amarillas}</span>
                  <span className="sr-only">amarillas</span>
                </span>
                <span className="flex items-center gap-1.5 text-nota text-[var(--texto-suave)]">
                  <span aria-hidden="true" className="size-3 rounded-[3px] bg-[var(--derrota)]" />
                  <span className="text-etiqueta font-semibold uppercase tracking-[0.05em]">R</span>
                  <span className="tabular-nums font-semibold text-[var(--texto)]">{fila.rojas}</span>
                  <span className="sr-only">rojas</span>
                </span>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

/** Un enlace para seguir mirando: la competición, su calendario o su clasificación. */
export function EnlacesDeApoyo({ enlaces }: { enlaces: ReadonlyArray<{ texto: string; href: string }> }) {
  return (
    <nav aria-label="Seguir mirando" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {enlaces.map((enlace) => (
        <Link key={enlace.href} href={enlace.href as Route} className={ENLACE}>{enlace.texto}</Link>
      ))}
    </nav>
  );
}
