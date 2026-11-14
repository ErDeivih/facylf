import Link from 'next/link';
import type { Route } from 'next';
import { Cifras, type Cifra } from '@/componentes/estadisticas/Cifras';
import { TARJETA } from '@/componentes/estadisticas/controles';
import type {
  AsignacionDeEntrenador, FilaEntrenador, PartidoDeEntrenador,
} from '@/consultas/oficiales';
import { agrupaAsignacionesPorTemporada, rachaDeResultados } from '@/lib/oficiales';
import { fechaCorta } from '@/lib/presentacion-canonico';
import {
  EnlaceActa, EtiquetaRol, InsigniaResultado, InsigniasRacha, Marcador, TextoVacio,
} from './piezas';

/**
 * Secciones de la ficha de un entrenador.
 *
 * El balance se lee **desde el punto de vista de su equipo** (una victoria es del equipo que dirigía, no
 * del rival) y la racha va en V-E-D, como el resto de la aplicación. Los partidos sin resultado publicado
 * no suman a ninguna columna.
 */

/** Balance, equipos y racha. */
export function ResumenDeEntrenador({ fila }: { fila: FilaEntrenador }) {
  const cifras: Cifra[] = [
    { etiqueta: 'Partidos', valor: String(fila.partidos), nota: `${fila.temporadas} ${fila.temporadas === 1 ? 'temporada' : 'temporadas'}` },
    { etiqueta: 'Victorias', valor: String(fila.victorias) },
    { etiqueta: 'Empates', valor: String(fila.empates) },
    { etiqueta: 'Derrotas', valor: String(fila.derrotas) },
    { etiqueta: 'Equipos', valor: String(fila.equipos), nota: `${fila.clubes} ${fila.clubes === 1 ? 'club' : 'clubes'}` },
    { etiqueta: 'Temporadas', valor: String(fila.temporadas) },
  ];
  // La racha se calcula del más antiguo al más reciente: `ultimos` llega al revés (lo último primero).
  const racha = rachaDeResultados([...fila.ultimos].reverse().map((p) => p.resultado));
  return (
    <>
      <Cifras cifras={cifras} />
      <section aria-labelledby="racha-entrenador" className={TARJETA}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 id="racha-entrenador" className="m-0 text-bloque font-bold text-[var(--texto)]">Racha</h2>
          <div className="flex items-center gap-2.5">
            <InsigniasRacha signos={racha} />
          </div>
        </div>
      </section>
    </>
  );
}

/** Equipos y clubes por temporada, con su tramo y su balance. */
export function AsignacionesDeEntrenador({ asignaciones }: { asignaciones: readonly AsignacionDeEntrenador[] }) {
  const temporadas = agrupaAsignacionesPorTemporada(asignaciones);
  return (
    <section aria-labelledby="equipos-entrenador" className={TARJETA}>
      <div className="px-4 py-3.5">
        <h2 id="equipos-entrenador" className="m-0 text-bloque font-bold text-[var(--texto)]">Equipos</h2>
      </div>
      {asignaciones.length === 0
        ? <TextoVacio>Sin equipos dirigidos.</TextoVacio>
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
                        {' · '}<span className="tabular-nums font-semibold text-[var(--texto)]">{a.victorias}-{a.empates}-{a.derrotas}</span>
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

/** Los últimos partidos dirigidos, con marcador, resultado en V-E-D y acta. */
export function UltimosPartidosDeEntrenador({ partidos }: { partidos: readonly PartidoDeEntrenador[] }) {
  return (
    <section aria-labelledby="partidos-entrenador" className={TARJETA}>
      <div className="px-4 py-3.5">
        <h2 id="partidos-entrenador" className="m-0 text-bloque font-bold text-[var(--texto)]">Últimos partidos</h2>
      </div>
      {partidos.length === 0
        ? <TextoVacio>Sin partidos dirigidos.</TextoVacio>
        : (
          <ul className="m-0 list-none p-0">
            {partidos.map((p) => (
              <li key={p.match_id} className="border-t border-[var(--fondo-sutil)] px-4 py-2.5">
                <p className="m-0 text-nota text-[var(--texto-suave)]">
                  {fechaCorta(p.fecha)}
                  {p.jornada !== null && <> · J{p.jornada}</>}
                  {' · '}
                  <Link href={`/explorar/competicion/${p.grupo_id}` as Route}
                    className="hover:text-[var(--accion)] hover:underline">{p.edicion} · {p.grupo}</Link>
                  {' · '}{p.condicion === 'casa' ? 'en casa' : 'fuera'}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <InsigniaResultado resultado={p.resultado} />
                  <p className="m-0 min-w-0 flex-1 text-tabla text-[var(--texto)]">
                    <Link href={`/explorar/equipo/${p.equipo_id}` as Route} className="hover:underline">{p.equipo}</Link>
                    {' '}<Marcador propios={p.goles_propios} rival={p.goles_rival} />{' '}
                    {p.rival_id !== null
                      ? <Link href={`/explorar/equipo/${p.rival_id}` as Route} className="hover:underline">{p.rival}</Link>
                      : p.rival}
                  </p>
                  {p.tiene_acta && <EnlaceActa matchId={p.match_id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
