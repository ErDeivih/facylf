import Link from 'next/link';
import type { Route } from 'next';
import { datosFederacion, federacionDesde, FEDERACIONES_LOCALES,
  listarJugadoresLocal, slugJugador } from '@/lib/repositorio-local';
import { Bloque } from '@/componentes/Bloque';

export const revalidate = 60;
const POR_PAGINA = 100;

export default async function Jugadores({ searchParams }: {
  searchParams: Promise<{ q?: string; orden?: string; p?: string; federacion?: string }>;
}) {
  const filtros = await searchParams;
  const seleccionFederacion = filtros.federacion === 'todas' ? 'todas' : federacionDesde(filtros.federacion);
  const federacion = federacionDesde(filtros.federacion);
  const orden = filtros.orden ?? 'partidos';
  const todos = seleccionFederacion === 'todas'
    ? FEDERACIONES_LOCALES.flatMap((f) => listarJugadoresLocal(10000, (filtros.q ?? '').trim(), f.codigo))
    : listarJugadoresLocal(10000, (filtros.q ?? '').trim(), federacion);
  todos.sort((a, b) => orden === 'goles' ? b.goles - a.goles || b.partidos - a.partidos
    : orden === 'tarjetas' ? b.tarjetas - a.tarjetas || b.partidos - a.partidos
      : orden === 'temporadas' ? b.temporadas - a.temporadas || b.partidos - a.partidos
        : b.partidos - a.partidos || b.convocatorias - a.convocatorias);
  const pagina = Math.max(1, Number(filtros.p) || 1);
  const desde = (pagina - 1) * POR_PAGINA;
  const jugadores = todos.slice(desde, desde + POR_PAGINA);
  const paginaUrl = (n: number) => {
    const u = new URLSearchParams();
    if (filtros.q) u.set('q', filtros.q);
    if (orden) u.set('orden', orden);
    u.set('federacion', seleccionFederacion);
    u.set('p', String(n));
    return `/jugadores?${u.toString()}`;
  };
  return <>
    <p className="font-display text-xs uppercase tracking-[0.16em] text-club">Buscador deportivo</p>
    <h2 className="mt-1 font-display text-3xl uppercase">Jugadores</h2>
    <p className="mb-6 mt-2 max-w-3xl text-sm leading-6 text-[#5C646C]">
      Busca por nombre o apodo federativo {seleccionFederacion === 'todas' ? 'en todas las federaciones' : `en ${datosFederacion(federacion).nombre}`}. Cada perfil separa temporada, equipo, competición,
      convocatorias, partidos jugados y estadísticas históricas.
    </p>
    <form action="/jugadores" className="mb-6 grid gap-3 border border-[#D6D6D4] bg-white p-4 sm:grid-cols-2 lg:grid-cols-[14rem_1fr_14rem_auto]">
      <label><span className="etiqueta-filtro">Federación</span><select name="federacion" defaultValue={seleccionFederacion} className="control-filtro">
        <option value="todas">Todas las federaciones</option>
        {FEDERACIONES_LOCALES.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombre}</option>)}
      </select></label>
      <label><span className="etiqueta-filtro">Nombre o apodo</span>
        <input name="q" defaultValue={filtros.q ?? ''} className="control-filtro" placeholder="Ej. Isma, García, Hugo…" /></label>
      <label><span className="etiqueta-filtro">Ordenar por</span><select name="orden" defaultValue={orden} className="control-filtro">
        <option value="partidos">Partidos jugados</option><option value="goles">Goles</option>
        <option value="tarjetas">Tarjetas</option><option value="temporadas">Temporadas</option>
      </select></label>
      <div className="flex items-end gap-2"><Link href={`/jugadores?federacion=${seleccionFederacion}`} className="boton-secundario">Limpiar</Link>
        <button className="boton-primario">Buscar</button></div>
    </form>
    <Bloque titulo={`${todos.length.toLocaleString('es-ES')} jugadores encontrados`}
      pie="PJ sólo cuenta titularidades y suplentes cuya participación está confirmada.">
      <div className="overflow-x-auto"><table className="w-full text-sm tabular-nums">
        <thead><tr className="border-b border-[#D6D6D4] text-xs uppercase text-[#5C646C]">
          <th className="p-3 text-left">Jugador</th><th className="p-3 text-right">Temp.</th>
          <th className="p-3 text-right">Conv.</th><th className="p-3 text-right">PJ</th>
          <th className="p-3 text-right">Tit.</th><th className="p-3 text-right">G</th>
          <th className="p-3 text-right">TA</th><th className="p-3 text-right">TR</th>
        </tr></thead>
        <tbody>{jugadores.map((j) => <tr key={`${j.federacion}:${j.codigo}`} className="border-b border-[#EDF0ED] hover:bg-[#FAFBFA]">
          <td className="p-3"><Link href={`/jugador/${slugJugador(j.codigo, j.federacion)}`} className="font-medium hover:text-club hover:underline">{j.nombre}</Link>
            <span className="block text-[10px] text-[#8A8E91]">{datosFederacion(j.federacion).nombre} · {j.codigo}</span></td>
          <td className="p-3 text-right">{j.temporadas}</td><td className="p-3 text-right">{j.convocatorias}</td>
          <td className="p-3 text-right font-semibold">{j.partidos}</td><td className="p-3 text-right">{j.titularidades}</td>
          <td className="p-3 text-right font-semibold">{j.goles}</td><td className="p-3 text-right">{j.amarillas + j.doblesAmarillas}</td>
          <td className="p-3 text-right">{j.rojas}</td>
        </tr>)}</tbody>
      </table></div>
      {!jugadores.length && <p className="p-6 text-center text-sm text-[#5C646C]">No hay jugadores con ese nombre en las actas analizadas.</p>}
    </Bloque>
    <nav className="flex items-center justify-between text-sm" aria-label="Paginación">
      {pagina > 1 ? <Link className="boton-secundario" href={paginaUrl(pagina - 1) as Route}>← Anterior</Link> : <span />}
      <span className="text-xs text-[#5C646C]">{todos.length ? `${desde + 1}–${Math.min(desde + POR_PAGINA, todos.length)} de ${todos.length}` : '0 resultados'}</span>
      {desde + POR_PAGINA < todos.length ? <Link className="boton-secundario" href={paginaUrl(pagina + 1) as Route}>Siguiente →</Link> : <span />}
    </nav>
  </>;
}
