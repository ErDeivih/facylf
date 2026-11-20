import Link from 'next/link';
import type { Route } from 'next';
import type { FilaClub, FilaEquipoDeClub } from '@/consultas/entidades';
import {
  etiquetaCategoria, etiquetaGenero, formatoNumero, letraDeEquipo, resumenDelClub, type EvolucionDelClub as Evolucion,
} from '@/lib/fichas';

/**
 * Las secciones de la ficha de club, contra `prototipo/Club.dc.html`.
 *
 * El club no es un equipo: es el paraguas de todas sus inscripciones. La ficha enseña sus equipos de
 * la temporada en curso, cómo ha evolucionado cada línea (Juvenil A, Cadete B…) y un resumen con lo
 * que el archivo sabe de verdad: cuántas temporadas aparecen, cuántos equipos y su mejor puesto.
 *
 * No hay palmarés porque el canónico no guarda títulos de club, y no se inventa: un club con veinte
 * temporadas no «ha ganado» nada por aparecer aquí.
 */

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
const ETIQUETA = 'text-etiqueta font-semibold text-[var(--texto-suave)]';

const COLOR_LETRA: Record<string, string> = { A: 'var(--accion)', B: 'var(--accion)', C: 'var(--accion)' };

export function ResumenDelClub({ equipos }: { club: FilaClub; equipos: readonly FilaEquipoDeClub[] }) {
  const resumen = resumenDelClub(equipos);
  const tarjetas = [
    {
      etiqueta: 'Temporadas',
      valor: formatoNumero(resumen.temporadas),
      nota: 'Temporadas con algún equipo publicado',
    },
    {
      etiqueta: 'Equipos',
      valor: formatoNumero(resumen.equipos),
      nota: 'Inscripciones en todas sus categorías',
    },
    {
      etiqueta: 'Mejor posición',
      valor: resumen.mejorPosicion === null ? 'Sin datos' : `${resumen.mejorPosicion}º`,
      nota: 'Su mejor puesto en una clasificación final',
    },
    {
      etiqueta: 'Última temporada',
      valor: resumen.ultimaTemporada ?? 'Sin datos',
      nota: 'La más reciente con equipo publicado',
    },
  ];
  return (
    <section aria-label="Resumen del club" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
      {tarjetas.map((tarjeta) => (
        <article key={tarjeta.etiqueta} className={`${TARJETA} flex flex-col gap-1 p-3.5`}>
          <span className={ETIQUETA}>{tarjeta.etiqueta}</span>
          <span className="text-dato font-extrabold tabular-nums text-[var(--texto)]">{tarjeta.valor}</span>
          <span className="text-nota leading-5 text-[var(--texto-suave)]">{tarjeta.nota}</span>
        </article>
      ))}
    </section>
  );
}

export function EquiposDeLaTemporada({ filas, temporada }: {
  filas: readonly FilaEquipoDeClub[];
  temporada: string | null;
}) {
  return (
    <section aria-labelledby="equipos-club" className="flex flex-col gap-3">
      <h2 id="equipos-club" className="m-0 text-bloque font-bold text-[var(--texto)]">
        {temporada === null ? 'Equipos' : `Equipos ${temporada}`}
      </h2>
      {filas.length === 0
        ? <p className="m-0 text-tabla text-[var(--texto-suave)]">Sin equipos publicados en la temporada en curso.</p>
        : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filas.map((equipo) => {
              const letra = letraDeEquipo(equipo.nombre_en_fuente) ?? 'A';
              return (
                <Link key={equipo.equipo_id} href={`/explorar/equipo/${equipo.equipo_id}` as Route}
                  className="flex min-h-[44px] items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-3.5 py-3 text-[var(--texto)] hover:border-[var(--borde-fuerte)]">
                  <span aria-hidden="true"
                    className="flex size-9 flex-none items-center justify-center rounded-[var(--radius-md)] text-cuerpo font-extrabold text-[var(--texto-inverso)]"
                    style={{ background: COLOR_LETRA[letra] ?? 'var(--accion)' }}>
                    {letra}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-bold">{etiquetaCategoria(equipo.edicion_categoria)}</span>
                    <span className="truncate text-nota text-[var(--texto-suave)]">
                      {equipo.edicion} · {equipo.grupo}
                      {equipo.edicion_genero === 'femenina' ? ` · ${etiquetaGenero(equipo.edicion_genero)}` : ''}
                    </span>
                  </span>
                  <span className="flex flex-none flex-col items-end">
                    <span className="text-dato font-extrabold tabular-nums text-[var(--texto)]">
                      {equipo.posicion === null ? '—' : `${equipo.posicion}º`}
                    </span>
                    <span className="text-nota text-[var(--texto-suave)]">
                      {equipo.puntos === null ? 'Sin puntos' : `${formatoNumero(equipo.puntos)} pts`}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
    </section>
  );
}

export function EvolucionDelClub({ evolucion }: { evolucion: Evolucion }) {
  return (
    <section aria-labelledby="evolucion-club" className={`${TARJETA} overflow-hidden`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
        <h2 id="evolucion-club" className="m-0 text-bloque font-bold text-[var(--texto)]">Evolución de cada equipo</h2>
        <span className="text-nota text-[var(--texto-suave)]">Puesto final de cada temporada</span>
      </div>
      {evolucion.temporadas.length === 0
        ? <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">Sin temporadas publicadas.</p>
        : (
          <>
          <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2 text-nota text-[var(--texto-suave)] md:hidden">Desplaza para ver todas las temporadas.</p>
          <div data-tabla-scroll tabIndex={0} role="region"
            aria-label="Evolución del club: desplázate en horizontal para ver todas las temporadas"
            className="relative overflow-x-auto focus-visible:[outline-offset:-2px]">
            <table className="w-full border-separate border-spacing-0 text-tabla" style={{ minWidth: 560 }}>
              <caption className="sr-only">
                Puesto final de cada equipo del club en las últimas temporadas, con la flecha de si sube o baja respecto a la anterior.
              </caption>
              <thead>
                <tr className="text-etiqueta text-[var(--texto-suave)]">
                  <th scope="col" className="sticky left-0 z-[var(--capa-pegajoso)] bg-[var(--fondo-elevado)] py-2 pl-4 pr-2 text-left font-semibold">Equipo</th>
                  {evolucion.temporadas.map((temporada) => (
                    <th key={temporada} scope="col" className="px-2 py-2 text-center font-semibold tabular-nums">{temporada}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evolucion.filas.map((fila) => (
                  <tr key={fila.clave}>
                    <th scope="row" className="sticky left-0 z-[var(--capa-pegajoso)] whitespace-nowrap border-t border-[var(--fondo-sutil)] bg-[var(--fondo-elevado)] py-1.5 pl-4 pr-2 text-left font-semibold text-[var(--texto)]">
                      {fila.etiqueta}
                    </th>
                    {fila.celdas.map((celda, i) => (
                      <td key={`${fila.clave}-${i}`} className="border-t border-[var(--fondo-sutil)] px-2 py-1.5 text-center">
                        {celda === null || celda.posicion === null
                          ? <span className="text-[var(--texto-suave)]">—</span>
                          : (
                            <span className="inline-flex items-center gap-1">
                              {celda.grupo_id === null
                                ? <span className="font-semibold tabular-nums text-[var(--texto)]">{celda.posicion}º</span>
                                : (
                                  <Link href={`/explorar/competicion/${celda.grupo_id}` as Route}
                                    className="font-semibold tabular-nums text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
                                    {celda.posicion}º
                                  </Link>
                                )}
                              {celda.movimiento === 'sube' && (
                                <span aria-label="Sube respecto a la temporada anterior" className="text-[var(--victoria)]">▲</span>
                              )}
                              {celda.movimiento === 'baja' && (
                                <span aria-label="Baja respecto a la temporada anterior" className="text-[var(--derrota)]">▼</span>
                              )}
                            </span>
                          )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-nota leading-5 text-[var(--texto-suave)]">
        Una casilla vacía es una temporada en la que ese equipo no aparece en el archivo.
      </p>
    </section>
  );
}
