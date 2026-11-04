import type { FilaClasificacionPantalla } from '@/consultas/competiciones';
import {
  claseForma, claseZona, etiquetaZona, formaDe, golesDeLaFila, publicaGoles, siglas, zonaDe,
  type ZonaPantalla, type ZonasDelGrupo,
} from '@/lib/pantalla-competicion';

/**
 * La tabla de clasificación de la pantalla 2.
 *
 * Enseña UNA tabla: la que la federación publicó (o, si no hay, la reconstruida) y lo dice al pie. No
 * mezcla orígenes ni rellena huecos: los recuentos son los que trae la consulta. Las franjas de zona
 * y las insignias de forma son las del prototipo.
 */
export function Clasificacion({ filas, rachas, zonas, equipos }: {
  filas: readonly FilaClasificacionPantalla[];
  rachas: ReadonlyMap<number, string>;
  zonas: ZonasDelGrupo | null;
  equipos: number;
}) {
  const origen = filas[0]?.origen ?? null;
  const jornada = filas[0]?.jornada ?? null;
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
  return (
    <section aria-labelledby="clasificacion"
      className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3.5">
        <h2 id="clasificacion" className="m-0 text-base font-bold text-[var(--texto)]">Clasificación</h2>
        <div role="group" aria-label="Vista" className="flex rounded-[var(--radius-md)] bg-[var(--fondo-sutil)] p-[3px]">
          <span className="rounded-[var(--radius-sm)] bg-[var(--fondo-elevado)] px-3 py-1 text-[13px] font-semibold text-[var(--texto)]">
            Total
          </span>
          <button type="button" disabled title="Necesita la proyección por condición (casa/fuera), que aún no existe"
            className="cursor-not-allowed px-3 py-1 text-[13px] font-medium text-[var(--texto-tenue)]">Casa</button>
          <button type="button" disabled title="Necesita la proyección por condición (casa/fuera), que aún no existe"
            className="cursor-not-allowed px-3 py-1 text-[13px] font-medium text-[var(--texto-tenue)]">Fuera</button>
        </div>
      </div>

      {filas.length === 0
        ? (
          <p className="px-4 pb-4 text-sm text-[var(--texto-suave)]">
            Este grupo no tiene clasificación publicada ni reconstruida. No se pinta una tabla vacía: no es
            que todos los equipos tengan cero puntos, es que no hay tabla.
          </p>
        )
        : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 600 }}>
              <thead>
                <tr className="text-right text-[11px] uppercase tracking-[0.05em] text-[var(--texto-suave)]">
                  <th scope="col" className="w-10 px-1.5 py-2 pl-4 text-left">#</th>
                  <th scope="col" className="px-1.5 py-2 text-left">Equipo</th>
                  <th scope="col" className="px-1.5 py-2" title="Partidos jugados">PJ</th>
                  <th scope="col" className="px-1.5 py-2" title="Ganados-Empatados-Perdidos">G-E-P</th>
                  <th scope="col" className="px-1.5 py-2" title="Goles a favor y en contra">Goles</th>
                  <th scope="col" className="px-1.5 py-2 text-left" title="Últimos 5 partidos, del más antiguo al más reciente">Forma</th>
                  <th scope="col" className="px-4 py-2 pl-1.5">Pts</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const zona = zonaDe(f.posicion, equipos, zonas);
                  const forma = formaDe(rachas.get(f.equipo_id));
                  return (
                    <tr key={f.equipo_id} className="border-t border-[var(--fondo-sutil)] text-right">
                      <td className="p-0 text-left">
                        <div className="flex h-[42px] items-center gap-2.5">
                          <span aria-hidden="true" className={`h-[42px] w-1 flex-none ${claseZona(zona)}`} />
                          <span className="w-[22px] text-right font-bold text-[var(--texto)]">{f.posicion}</span>
                        </div>
                      </td>
                      <td className="px-1.5 p-0 text-left">
                        <div className="flex min-h-[42px] items-center gap-2.5 font-medium text-[var(--texto)]">
                          <span aria-hidden="true"
                            className="flex size-[22px] flex-none items-center justify-center rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] text-[9px] font-bold text-[var(--texto-suave)]">
                            {siglas(f.equipo)}
                          </span>
                          <span className="whitespace-nowrap">{f.equipo}</span>
                        </div>
                      </td>
                      <td className="px-1.5 text-[var(--texto)]" >{f.jugados}</td>
                      <td className="whitespace-nowrap px-1.5 text-[var(--texto)]">{f.ganados}-{f.empatados}-{f.perdidos}</td>
                      <td className="px-1.5 text-[var(--texto)]" title={usaReconstruccion ? 'Goles reconstruidos: la tabla oficial no los publica' : undefined}>
                        {golesDeLaFila(f, usaReconstruccion)}
                      </td>
                      <td className="px-1.5 text-left">
                        <div className="flex gap-[3px]">
                          {forma.map((letra, i) => (
                            <span key={`${letra}-${i}`} title={letra === 'G' ? 'Ganado' : letra === 'E' ? 'Empatado' : 'Perdido'}
                              className={`flex size-[18px] items-center justify-center rounded-[var(--radius-sm)] text-[11px] font-bold text-white ${claseForma(letra)}`}>
                              {letra}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 pl-1.5 text-[15px] font-extrabold text-[var(--texto)]">{f.puntos}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      {zonasPresentes.length > 0 && (
        <div className="flex flex-wrap gap-3.5 border-t border-[var(--fondo-sutil)] px-4 py-3 text-xs text-[var(--texto)]">
          {zonasPresentes.map(([zona, cuantas]) => (
            <span key={zona} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-2.5 rounded-[2px] ${claseZona(zona)}`} />
              {etiquetaZona(zona)} ({cuantas})
            </span>
          ))}
        </div>
      )}
      <p className="m-0 px-4 pb-3.5 text-xs text-[var(--texto-suave)]">
        {zonas
          ? (zonas.origen === 'reglamento'
            ? 'Zonas según el reglamento de la competición.'
            : `Zonas según lo ocurrido en las últimas ${zonas.temporadas ?? '—'} temporadas de esta liga. Un administrador puede fijarlas con las bases de la competición.`)
          : 'Este grupo no tiene zonas fijadas: no se pinta ninguna franja de color.'}
        {' '}
        {origen === 'oficial'
          ? 'La clasificación es la oficial publicada por la federación tras cada jornada.'
          : origen === 'reconstruida'
            ? `La clasificación está reconstruida a partir de los resultados: la federación no publicó tabla${jornada !== null ? ` en la jornada ${jornada}` : ''}.`
            : ''}
        {usaReconstruccion
          ? ' Los goles no vienen en la tabla oficial: se enseñan los reconstruidos a partir de los resultados publicados.'
          : ''}
      </p>
      <details className="mx-4 mb-3.5 text-xs text-[var(--texto-suave)]">
        <summary className="cursor-pointer text-[var(--accion)]">Sobre estos datos</summary>
        <p className="mt-1.5">
          Un partido sin resultado publicado no cuenta como 0-0: aparece sin marcador. Los recuentos de esta
          tabla son los del último punto de control del grupo; lo que la federación aún no ha publicado no se
          rellena.
        </p>
      </details>
    </section>
  );
}
