import Link from 'next/link';
import type { Route } from 'next';
import { Cifras, type Cifra } from '@/componentes/estadisticas/Cifras';
import { TARJETA } from '@/componentes/estadisticas/controles';
import type { AsignacionDeDelegado, FilaDelegado, PartidoDeDelegado } from '@/consultas/oficiales';
import { agrupaAsignacionesPorTemporada } from '@/lib/oficiales';
import { fechaCorta } from '@/lib/presentacion-canonico';
import { EnlaceActa, EtiquetaRol, Marcador, TextoVacio } from './piezas';

/**
 * Secciones de la ficha de un delegado **de equipo**.
 *
 * El delegado de campo (el del recinto) es otra figura y no suma aquí: sus partidos los cuenta su propia
 * familia de rol. Lo que se enseña es con qué equipos y en qué partidos figura como delegado del equipo,
 * con el marcador y el enlace al acta.
 */

/** Partidos, equipos, clubes y temporadas como delegado. */
export function ResumenDeDelegado({ fila }: { fila: FilaDelegado }) {
  const cifras: Cifra[] = [
    {
      etiqueta: 'Partidos', valor: String(fila.partidos),
      nota: `${fila.temporadas} ${fila.temporadas === 1 ? 'temporada' : 'temporadas'}`,
    },
    { etiqueta: 'Equipos', valor: String(fila.equipos) },
    { etiqueta: 'Clubes', valor: String(fila.clubes) },
    { etiqueta: 'Temporadas', valor: String(fila.temporadas) },
  ];
  return <Cifras cifras={cifras} />;
}

/** Equipos por temporada, con su competición y su tramo de fechas. */
export function AsignacionesDeDelegado({ asignaciones }: { asignaciones: readonly AsignacionDeDelegado[] }) {
  const temporadas = agrupaAsignacionesPorTemporada(asignaciones);
  return (
    <section aria-labelledby="equipos-delegado" className={TARJETA}>
      <div className="px-4 py-3.5">
        <h2 id="equipos-delegado" className="m-0 text-bloque font-bold text-[var(--texto)]">Equipos</h2>
      </div>
      {asignaciones.length === 0
        ? <TextoVacio>Sin equipos como delegado.</TextoVacio>
        : (
          <ul className="m-0 list-none p-0">
            {temporadas.map((grupo) => (
              <li key={grupo.temporada} className="border-t border-[var(--fondo-sutil)] px-4 py-3">
                <p className="m-0 text-etiqueta text-[var(--texto-suave)]">{grupo.temporada}</p>
                <ul className="m-0 mt-1.5 flex list-none flex-col gap-2.5 p-0">
                  {grupo.asignaciones.map((a) => (
                    <li key={`${a.equipo_id}-${a.edicion_id}-${a.rol}`} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <p className="m-0 min-w-0 flex-1 text-tabla font-semibold text-[var(--texto)]">
                        <Link href={`/explorar/equipo/${a.equipo_id}` as Route} className="hover:text-[var(--accion)] hover:underline">
                          {a.equipo}
                        </Link>
                        {' '}<EtiquetaRol rol={a.rol} />
                      </p>
                      <p className="m-0 w-full text-nota text-[var(--texto-suave)]">
                        {a.edicion} ·{' '}
                        <Link href={`/explorar/competicion/${a.grupo_id}` as Route} className="hover:text-[var(--accion)] hover:underline">{a.grupo}</Link>
                        {' · '}{a.partidos} {a.partidos === 1 ? 'partido' : 'partidos'}
                      </p>
                      <p className="m-0 w-full text-nota text-[var(--texto-suave)]">
                        {fechaCorta(a.primera_fecha)} — {fechaCorta(a.ultima_fecha)}
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

/** Los últimos partidos como delegado, con marcador y acta. */
export function UltimosPartidosDeDelegado({ partidos }: { partidos: readonly PartidoDeDelegado[] }) {
  return (
    <section aria-labelledby="partidos-delegado" className={TARJETA}>
      <div className="px-4 py-3.5">
        <h2 id="partidos-delegado" className="m-0 text-bloque font-bold text-[var(--texto)]">Últimos partidos</h2>
      </div>
      {partidos.length === 0
        ? <TextoVacio>Sin partidos como delegado.</TextoVacio>
        : (
          <ul className="m-0 list-none p-0">
            {partidos.map((p) => (
              <li key={p.match_id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-[var(--fondo-sutil)] px-4 py-2.5">
                <p className="m-0 w-full text-nota text-[var(--texto-suave)]">
                  {fechaCorta(p.fecha)}
                  {p.jornada !== null && <> · J{p.jornada}</>}
                  {' · '}
                  <Link href={`/explorar/competicion/${p.grupo_id}` as Route}
                    className="hover:text-[var(--accion)] hover:underline">{p.edicion} · {p.grupo}</Link>
                  {' · '}{p.condicion === 'casa' ? 'en casa' : 'fuera'}
                </p>
                <p className="m-0 min-w-0 flex-1 text-tabla text-[var(--texto)]">
                  <Link href={`/explorar/equipo/${p.equipo_id}` as Route} className="hover:underline">{p.equipo}</Link>
                  {' '}<Marcador propios={p.goles_propios} rival={p.goles_rival} />{' '}
                  {p.rival_id !== null
                    ? <Link href={`/explorar/equipo/${p.rival_id}` as Route} className="hover:underline">{p.rival}</Link>
                    : p.rival}
                </p>
                {p.tiene_acta && <EnlaceActa matchId={p.match_id} />}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
