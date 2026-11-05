import Link from 'next/link';
import type { Route } from 'next';
import type { FilaOjeo } from '@/consultas/ojeo';
import { nombrePublicado, numero } from '@/lib/estadisticas';
import { etiquetaCategoria } from '@/lib/vocabulario-pantalla';
import { TD, TD_NUM, TH, TH_NUM, TABLA } from '@/componentes/listados/controles';
import { TablaDesplazable } from '@/componentes/listados/TablaDesplazable';

/** Los minutos: si no son exactos se enseñan como cota inferior («≥»), y sin dato, «—». */
function minutosTexto(fila: FilaOjeo): string {
  if (fila.minutos === null) return '—';
  return `${fila.minutos_exactos ? '' : '≥ '}${numero(fila.minutos)}`;
}

/** La puntuación orientativa, con las mismas cifras que da la consulta. */
function puntuacion(fila: FilaOjeo): string {
  return String(Math.round(Number(fila.puntuacion)));
}

/**
 * Perfil de percentiles del jugador dentro de la búsqueda.
 *
 * Es la parte visual del prototipo: seis barras (minutos, % del equipo, nivel, minutos por encima,
 * continuidad y goles). El dibujo es decorativo pero la información no se pierde: el `aria-label` dice
 * cada percentil en palabras.
 */
function Perfil({ fila }: { fila: FilaOjeo }) {
  const valores = [
    { nombre: 'minutos', valor: Number(fila.p_minutos) },
    { nombre: '% del equipo', valor: Number(fila.p_pct) },
    { nombre: 'nivel', valor: Number(fila.p_nivel) },
    { nombre: 'minutos por encima', valor: Number(fila.p_encima) },
    { nombre: 'continuidad', valor: Number(fila.p_continuidad) },
    { nombre: 'goles', valor: Number(fila.p_goles) },
  ];
  const descripcion = valores.map((v) => `${v.nombre}: percentil ${v.valor}`).join('; ');
  return (
    <span role="img" aria-label={descripcion} className="flex h-8 items-end gap-[3px]">
      {valores.map((v) => (
        <span key={v.nombre} aria-hidden="true"
          className="w-[5px] rounded-t-[2px] bg-[var(--accion)]"
          style={{ height: `${Math.max(8, Math.round(v.valor * 0.3))}px`, opacity: 0.35 + Math.min(v.valor, 100) / 160 }} />
      ))}
    </span>
  );
}

/**
 * Tabla de perfiles de ojeo.
 *
 * Enlaza a la ficha del jugador y a su historial; el equipo es texto y la competición no se enlaza
 * porque la consulta de ojeo no devuelve su nombre (sí el id del grupo, que se usa en la fila como
 * enlace a la competición con nombre accesible). Lo no medido («—», «≥») no se convierte en cero.
 */

/**
 * Lista para móvil: la tabla de 900 px no cabe a 360 y desplazarla para ver la puntuación de cada fila
 * es peor que enseñar la fila entera en dos columnas. La tabla sigue siendo la vista de escritorio.
 */
function ListaMovil({ filas }: { filas: readonly FilaOjeo[] }) {
  return (
    <ul className="m-0 list-none p-0 md:hidden">
      {filas.map((fila) => {
        const nacimiento = fila.nacimiento_desde === null && fila.nacimiento_hasta === null
          ? null
          : `${fila.nacimiento_desde ?? '?'}${fila.nacimiento_hasta && fila.nacimiento_hasta !== fila.nacimiento_desde ? `-${fila.nacimiento_hasta}` : ''}`;
        return (
          <li key={`${fila.persona_id}-${fila.grupo_persona_id}`}
            className="border-t border-[var(--fondo-sutil)] px-4 py-3 first:border-t-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/explorar/jugador/${fila.persona_id}` as Route}
                  className="text-tabla font-semibold text-[var(--texto)] hover:underline">
                  {nombrePublicado(fila.nombre)}
                </Link>
                <p className="m-0 text-nota text-[var(--texto-suave)]">
                  {fila.equipo ?? '—'} · {etiquetaCategoria(fila.categoria)}
                  {fila.mejor_escalon === null ? '' : ` · Nivel ${fila.mejor_escalon}`}
                </p>
                <p className="m-0 text-nota text-[var(--texto-suave)]">{nacimiento ?? 'Año de nacimiento no publicado'}</p>
                <Link href={`/explorar/jugador/${fila.persona_id}/historial` as Route}
                  className="text-nota font-semibold text-[var(--accion)] hover:underline">
                  Historial
                </Link>
              </div>
              <div className="flex flex-none flex-col items-end gap-1">
                <span className={`inline-flex min-w-11 justify-center rounded-[var(--radius-control)] px-2 py-1 text-tabla font-extrabold ${
                  Number(fila.puntuacion) >= 80
                    ? 'bg-[var(--fondo-fuerte)] text-[var(--texto-fuerte)]'
                    : 'bg-[var(--fondo-sutil)] text-[var(--texto)]'
                }`}>
                  {puntuacion(fila)}
                </span>
                <span className="text-nota tabular-nums text-[var(--texto-suave)]">{minutosTexto(fila)} min</span>
                <span className="text-nota tabular-nums text-[var(--texto-suave)]">{numero(fila.goles)} goles</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function TablaOjeo({ filas }: { filas: readonly FilaOjeo[] }) {
  return (
    <><ListaMovil filas={filas} />
      <div className="hidden md:block">
    <TablaDesplazable etiqueta="Perfiles de jugadores">
      <table className={`${TABLA} w-full min-w-[560px] md:min-w-[900px]`}>
        <caption className="sr-only">Perfiles de jugadores del buscador de talento</caption>
        <thead>
          <tr className="border-b border-[var(--borde)]">
            <th scope="col" className={`${TH} w-10 text-right`}>#</th>
            <th scope="col" className={TH}>Jugador</th>
            <th scope="col" className={`${TH} hidden md:table-cell`}>Equipo</th>
            <th scope="col" className={TH_NUM}>Minutos</th>
            <th scope="col" className={`${TH_NUM} hidden lg:table-cell`}>% equipo</th>
            <th scope="col" className={TH_NUM}>Goles</th>
            <th scope="col" className={TH_NUM}>Puntuación</th>
            <th scope="col" className={`${TH} hidden lg:table-cell`}>Perfil</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const nacimiento = fila.nacimiento_desde === null && fila.nacimiento_hasta === null
              ? null
              : `${fila.nacimiento_desde ?? '?'}${fila.nacimiento_hasta && fila.nacimiento_hasta !== fila.nacimiento_desde ? `-${fila.nacimiento_hasta}` : ''}`;
            return (
              <tr key={`${fila.persona_id}-${fila.grupo_persona_id}`}
                className="border-b border-[var(--fondo-sutil)] last:border-b-0 hover:bg-[var(--fondo-sutil)]">
                <td className={`${TD} text-right font-bold tabular-nums text-[var(--texto-suave)]`}>{fila.posicion}</td>
                <td className={TD}>
                  <Link href={`/explorar/jugador/${fila.persona_id}` as Route}
                    className="whitespace-nowrap text-tabla font-semibold text-[var(--texto)] hover:underline">
                    {nombrePublicado(fila.nombre)}
                  </Link>
                  <span className="block text-nota text-[var(--texto-suave)]">
                    {nacimiento ?? 'Año de nacimiento no publicado'}
                  </span>
                  <Link href={`/explorar/jugador/${fila.persona_id}/historial` as Route}
                    className="text-nota font-semibold text-[var(--accion)] hover:underline">
                    Historial
                  </Link>
                </td>
                <td className={`${TD} hidden md:table-cell`}>
                  <span className="block text-tabla font-medium text-[var(--texto)]">{fila.equipo ?? '—'}</span>
                  <span className="block text-nota text-[var(--texto-suave)]">
                    {etiquetaCategoria(fila.categoria)}
                    {fila.mejor_escalon === null ? '' : ` · Nivel ${fila.mejor_escalon}`}
                  </span>
                  <Link href={`/explorar/competicion/${fila.grupo_persona_id}` as Route}
                    className="text-nota font-semibold text-[var(--accion)] hover:underline"
                    aria-label={`Ver la competición de ${nombrePublicado(fila.nombre)}`}>
                    Ver competición
                  </Link>
                </td>
                <td className={TD_NUM}>{minutosTexto(fila)}</td>
                <td className={`${TD_NUM} hidden lg:table-cell`}>
                  {fila.pct_minutos === null ? '—' : `${Math.round(Number(fila.pct_minutos))} %`}
                </td>
                <td className={`${TD_NUM} font-bold`}>{numero(fila.goles)}</td>
                <td className={TD_NUM}>
                  <span className={`inline-flex min-w-11 justify-center rounded-[var(--radius-control)] px-2 py-1 text-tabla font-extrabold ${
                    Number(fila.puntuacion) >= 80
                      ? 'bg-[var(--fondo-fuerte)] text-[var(--texto-fuerte)]'
                      : 'bg-[var(--fondo-sutil)] text-[var(--texto)]'
                  }`}>
                    {puntuacion(fila)}
                  </span>
                </td>
                <td className={`${TD} hidden lg:table-cell`}><Perfil fila={fila} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </TablaDesplazable>
      </div>
    </>
  );
}
