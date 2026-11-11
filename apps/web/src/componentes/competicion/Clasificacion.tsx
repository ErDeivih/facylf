import Link from 'next/link';
import type { FilaClasificacionPantalla } from '@/consultas/competiciones';
import { Escudo } from '@/componentes/Escudo';
import { insigniaForma } from '@/lib/forma-equipo';
import {
  claseZona, estiloForma, etiquetaZona, formaDe, golesDeLaFila, publicaGoles, zonaDe,
  type ZonaPantalla, type ZonasDelGrupo,
} from '@/lib/pantalla-competicion';

/**
 * La tabla de clasificación de la pantalla 2, contra el prototipo.
 *
 * Enseña UNA tabla: la que la federación publicó (o, si no hay, la reconstruida) y lo dice al pie. No
 * mezcla orígenes ni rellena huecos: los recuentos son los que trae la consulta. Las franjas de zona,
 * las insignias de forma y las medidas son las del prototipo.
 *
 * En móvil no se colapsa a tarjetas (DESIGN.md): la tabla se desplaza dentro de su caja con
 * `data-tabla-scroll` y las dos primeras columnas —puesto y equipo— quedan fijas a la izquierda, que es
 * la identidad de la fila.
 */
export function Clasificacion({ filas, rachas, zonas, equipos }: {
  filas: readonly FilaClasificacionPantalla[];
  rachas: ReadonlyMap<number, string>;
  zonas: ZonasDelGrupo | null;
  equipos: number;
}) {
  const origen = filas[0]?.origen ?? null;
  // Si la tabla oficial no publica goles (CyL los guarda a cero), se enseñan los reconstruidos.
  const usaReconstruccion = !publicaGoles(filas, origen);
  const zonasPresentes = zonas
    ? ([
      ['asciende', zonas.ascensos],
      ['fase-ascenso', zonas.promocion],
      ['permanencia', zonas.promocion_permanencia],
      ['desciende', zonas.descensos],
    ] as Array<[Exclude<ZonaPantalla, null>, number]>).filter(([, n]) => n > 0)
    : [];
  const fijas = 'sticky z-[var(--capa-pegajoso)] bg-[var(--fondo-elevado)]';
  return (
    <section aria-labelledby="clasificacion"
      className="-mx-4 min-w-0 w-full flex-[999_1_auto] overflow-hidden rounded-none border-x-0 md:mx-0 md:flex-[999_1_640px] md:rounded-[var(--radius-tarjeta)] md:border-x rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3.5">
        <h2 id="clasificacion" className="m-0 text-bloque font-bold text-[var(--texto)]">Clasificación</h2>
        <div role="group" aria-label="Vista" className="flex rounded-[var(--radius-control)] bg-[var(--fondo-sutil)] p-[3px]">
          <span className="flex h-9 items-center rounded-[var(--radius-md)] bg-[var(--fondo-elevado)] px-3 text-tabla font-semibold text-[var(--texto)] shadow-[var(--sombra-segmento)]">
            Total
          </span>
          {/*
            Casa y Fuera se apagan, no se fingen: `analytics` sólo guarda jugados_casa / jugados_fuera,
            no el desglose V-E-D ni los goles por condición. El motivo va en el propio control, no sólo en
            un `title`, para que también lo oiga un lector de pantalla.
          */}
          <button type="button" disabled
            className="flex h-9 cursor-not-allowed items-center px-3 text-tabla font-medium text-[var(--texto-suave)]">
            Casa
          </button>
          <button type="button" disabled
            className="flex h-9 cursor-not-allowed items-center px-3 text-tabla font-medium text-[var(--texto-suave)]">
            Fuera
          </button>
        </div>
      </div>

      {filas.length === 0
        ? (
          <p className="px-4 pb-4 text-cuerpo text-[var(--texto-suave)]">
            Sin clasificación publicada.
          </p>
        )
        : (
          <div data-tabla-scroll tabIndex={0} role="region"
            aria-label="Clasificación: desplázate en horizontal para ver todas las columnas"
            className="relative overflow-x-auto focus-visible:[outline-offset:-2px]">
            <table className="w-full table-fixed border-separate border-spacing-0 text-tabla md:table-auto md:min-w-[600px]">
              <caption className="sr-only">
                Clasificación del grupo: posición, partidos jugados, victorias-empatadas-derrotas, goles y puntos de cada equipo.
              </caption>
              <thead>
                <tr className="text-right text-etiqueta uppercase tracking-[0.05em] text-[var(--texto-suave)]">
                  <th scope="col" className={`${fijas} left-0 w-7 py-2 pl-2 pr-1 text-left font-semibold md:w-9 md:pl-4 md:pr-1.5`}>#</th>
                  <th scope="col" className={`${fijas} left-9 px-1.5 py-2 text-left font-semibold`}>Equipo</th>
                  <th scope="col" className="w-8 px-0.5 py-2 font-semibold md:w-auto md:px-1.5" title="Partidos jugados">PJ</th>
                  {/*
                    El recuento de victorias-empatadas-derrotas también se rotula V-E-D: la aplicación
                    usa V-E-D para Victoria/Empate/Derrota en toda la interfaz (decisión de David,
                    04/11/2026). El dato no cambia: `ganados`/`empatados`/`perdidos` son los de la
                    consulta.
                  */}
                  <th scope="col" className="hidden px-1.5 py-2 font-semibold md:table-cell" title="Victorias-Empates-Derrotas">V-E-D</th>
                  <th scope="col" className="hidden px-1.5 py-2 font-semibold md:table-cell" title="Goles a favor y en contra">Goles</th>
                  <th scope="col" className="w-9 py-2 pl-0.5 pr-1 font-semibold md:w-auto md:pl-1.5 md:pr-4">Pts</th>
                  <th scope="col" className="hidden w-[3.75rem] px-0.5 py-2 text-left font-semibold md:table-cell md:w-auto md:px-1.5"
                    title="Últimos 5 partidos hasta la jornada de la tabla, del más antiguo al más reciente">Forma</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const zona = zonaDe(f.posicion, equipos, zonas);
                  const forma = formaDe(rachas.get(f.equipo_id));
                  return (
                    <tr key={f.equipo_id} className="text-right">
                      <td className={`${fijas} left-0 w-9 border-t border-[var(--fondo-sutil)] p-0 text-left`}>
                        <div className="flex h-[var(--fila-densa)] items-center gap-2.5">
                          <span aria-hidden="true" className={`h-[var(--fila-densa)] w-1 flex-none ${claseZona(zona)}`} />
                          <span className="w-[22px] font-bold text-[var(--texto)]">{f.posicion}</span>
                        </div>
                      </td>
                      <td className={`${fijas} left-8 w-auto min-w-[5.5rem] border-t border-[var(--fondo-sutil)] px-1 py-0 text-left md:left-9 md:w-[13.75rem] md:px-1.5 lg:w-auto`}>
                        <div className="flex h-[var(--fila-densa)] min-w-0 items-center gap-2.5">
                          <Escudo equipoId={f.equipo_id} nombre={f.equipo} clubId={f.club_id} tieneEscudo={f.tiene_escudo} />
                          {/*
                            En móvil la celda del equipo se acota para que quepa junto al puesto (#) y no
                            tape la columna pegajosa; el nombre completo sigue en el DOM (un lector de
                            pantalla lo lee entero) y en el `title` para el ratón. En escritorio no se
                            recorta: la tabla cabe.
                          */}
                          <Link href={`/explorar/equipo/${f.equipo_id}`}
                            className="block max-w-[3.75rem] md:max-w-[11rem] truncate font-medium text-[var(--texto)] hover:underline md:max-w-[11rem] lg:max-w-none"
                            title={f.equipo}>
                            {f.equipo}
                          </Link>
                          {/* En móvil, V-E-D y goles no caben: se despliegan al tocar la fila. */}
                          <details className="md:hidden">
                            <summary className="cursor-pointer list-none text-nota text-[var(--texto-suave)]"
                              aria-label={`Ver victorias, empates, derrotas y goles de ${f.equipo}`}>+</summary>
                            <span className="block whitespace-nowrap text-nota text-[var(--texto-suave)]">
                              V-E-D {f.ganados}-{f.empatados}-{f.perdidos} · Goles {golesDeLaFila(f, usaReconstruccion)} · Forma {forma.map((signo) => insigniaForma(signo).letra).join('')}
                            </span>
                          </details>
                        </div>
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1 text-[var(--texto-suave)]">{f.jugados}</td>
                      <td className="hidden whitespace-nowrap border-t border-[var(--fondo-sutil)] px-1 text-[var(--texto-suave)] md:table-cell">
                        {f.ganados}-{f.empatados}-{f.perdidos}
                      </td>
                      <td className="hidden border-t border-[var(--fondo-sutil)] px-1.5 text-[var(--texto-suave)] md:table-cell">
                        {golesDeLaFila(f, usaReconstruccion)}
                      </td>

                      <td className="border-t border-[var(--fondo-sutil)] py-0 pl-1 pr-2 text-cuerpo font-extrabold text-[var(--texto)] md:pl-1.5 md:pr-4">
                        {f.puntos}
                      </td>
                      <td className="hidden border-t border-[var(--fondo-sutil)] px-1 text-left md:table-cell md:px-1.5">
                        <span className="whitespace-nowrap text-etiqueta font-bold tracking-[0.08em] text-[var(--texto-suave)] md:hidden">
                          {forma.map((signo) => insigniaForma(signo).letra).join('')}
                        </span>
                        <div className="hidden gap-[3px] md:flex">
                          {forma.map((signo, i) => {
                            const { letra, etiqueta } = insigniaForma(signo);
                            // `role="img"` + `aria-label`: un lector de pantalla oye «Victoria» y la
                            // letra sigue siendo la única letra visible de la insignia. El texto del
                            // `sr-only` se colaba en `innerText` (y en la prueba e2e que mide la letra
                            // visible), así que la palabra va en el nombre accesible, no en un span.
                            return (
                              <span key={`${letra}-${i}`} role="img" aria-label={etiqueta} title={etiqueta}
                                className="flex size-4 items-center justify-center rounded-[5px] text-[9px] font-bold md:size-5 md:text-[10px]"
                                style={estiloForma(signo)}>
                                {letra}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      {filas.length > 0 && zonasPresentes.length > 0 && (
        <div className="flex flex-wrap gap-3.5 border-t border-[var(--fondo-sutil)] px-4 py-3 text-nota text-[var(--texto)]">
          {zonasPresentes.map(([zona]) => (
            <span key={zona} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-3 rounded-[3px] ${claseZona(zona)}`} />
              {etiquetaZona(zona)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
