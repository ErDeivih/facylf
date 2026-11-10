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
      className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
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
            <table className="w-full border-separate border-spacing-0 text-tabla" style={{ minWidth: 600 }}>
              <caption className="sr-only">
                Clasificación del grupo: posición, partidos jugados, victorias-empatadas-derrotas, goles y puntos de cada equipo.
              </caption>
              <thead>
                <tr className="text-right text-etiqueta uppercase tracking-[0.05em] text-[var(--texto-suave)]">
                  <th scope="col" className={`${fijas} left-0 w-9 py-2 pl-4 pr-1.5 text-left font-semibold`}>#</th>
                  <th scope="col" className={`${fijas} left-9 px-1.5 py-2 text-left font-semibold`}>Equipo</th>
                  <th scope="col" className="px-1.5 py-2 font-semibold" title="Partidos jugados">PJ</th>
                  {/*
                    El recuento de victorias-empatadas-derrotas también se rotula V-E-D: la aplicación
                    usa V-E-D para Victoria/Empate/Derrota en toda la interfaz (decisión de David,
                    04/11/2026). El dato no cambia: `ganados`/`empatados`/`perdidos` son los de la
                    consulta.
                  */}
                  <th scope="col" className="hidden px-1.5 py-2 font-semibold md:table-cell" title="Victorias-Empates-Derrotas">V-E-D</th>
                  <th scope="col" className="hidden px-1.5 py-2 font-semibold md:table-cell" title="Goles a favor y en contra">Goles</th>
                  <th scope="col" className="px-1.5 py-2 text-left font-semibold"
                    title="Últimos 5 partidos hasta la jornada de la tabla, del más antiguo al más reciente">Forma</th>
                  <th scope="col" className="py-2 pl-1.5 pr-4 font-semibold">Pts</th>
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
                      <td className={`${fijas} left-9 w-[13.75rem] border-t border-[var(--fondo-sutil)] px-1.5 py-0 text-left md:w-auto`}>
                        <div className="flex h-[var(--fila-densa)] min-w-0 items-center gap-2.5">
                          <Escudo equipoId={f.equipo_id} nombre={f.equipo} clubId={f.club_id} tieneEscudo={f.tiene_escudo} />
                          {/*
                            En móvil la celda del equipo se acota para que quepa junto al puesto (#) y no
                            tape la columna pegajosa; el nombre completo sigue en el DOM (un lector de
                            pantalla lo lee entero) y en el `title` para el ratón. En escritorio no se
                            recorta: la tabla cabe.
                          */}
                          <Link href={`/explorar/equipo/${f.equipo_id}`}
                            className="block max-w-[11rem] truncate font-medium text-[var(--texto)] hover:underline md:max-w-none"
                            title={f.equipo}>
                            {f.equipo}
                          </Link>
                          {/* En móvil, V-E-D y goles no caben: se despliegan al tocar la fila. */}
                          <details className="md:hidden">
                            <summary className="cursor-pointer list-none text-nota text-[var(--texto-suave)]"
                              aria-label={`Ver victorias, empates, derrotas y goles de ${f.equipo}`}>+</summary>
                            <span className="block whitespace-nowrap text-nota text-[var(--texto-suave)]">
                              V-E-D {f.ganados}-{f.empatados}-{f.perdidos} · Goles {golesDeLaFila(f, usaReconstruccion)}
                            </span>
                          </details>
                        </div>
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 text-[var(--texto-suave)]">{f.jugados}</td>
                      <td className="hidden whitespace-nowrap border-t border-[var(--fondo-sutil)] px-1.5 text-[var(--texto-suave)] md:table-cell">
                        {f.ganados}-{f.empatados}-{f.perdidos}
                      </td>
                      <td className="hidden border-t border-[var(--fondo-sutil)] px-1.5 text-[var(--texto-suave)] md:table-cell">
                        {golesDeLaFila(f, usaReconstruccion)}
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] px-1.5 text-left">
                        <div className="flex gap-[3px]">
                          {forma.map((signo, i) => {
                            const { letra, etiqueta } = insigniaForma(signo);
                            // `role="img"` + `aria-label`: un lector de pantalla oye «Victoria» y la
                            // letra sigue siendo la única letra visible de la insignia. El texto del
                            // `sr-only` se colaba en `innerText` (y en la prueba e2e que mide la letra
                            // visible), así que la palabra va en el nombre accesible, no en un span.
                            return (
                              <span key={`${letra}-${i}`} role="img" aria-label={etiqueta} title={etiqueta}
                                className="flex size-5 items-center justify-center rounded-[5px] text-[10px] font-bold"
                                style={estiloForma(signo)}>
                                {letra}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="border-t border-[var(--fondo-sutil)] py-0 pl-1.5 pr-4 text-cuerpo font-extrabold text-[var(--texto)]">
                        {f.puntos}
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
