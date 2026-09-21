import Link from 'next/link';
import { notFound } from 'next/navigation';
import { competicionLocal, slugEquipo, slugJugador } from '@/lib/repositorio-local';
import { Bloque } from '@/componentes/Bloque';
import { NavegacionCompeticion } from '@/componentes/NavegacionCompeticion';

export const revalidate = 60;

const normaliza = (s: string) => s.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default async function JugadoresCompeticion({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; orden?: string; equipo?: string }>;
}) {
  const { slug } = await params;
  const filtros = await searchParams;
  const c = competicionLocal(slug);
  if (!c) notFound();
  const equipos = [...new Set(c.jugadores.map((j) => j.equipo))].sort((a, b) => a.localeCompare(b, 'es'));
  const q = normaliza((filtros.q ?? '').trim());
  const orden = filtros.orden ?? 'goles';
  const jugadores = c.jugadores.filter((j) =>
    (!q || normaliza(j.nombre).includes(q)) && (!filtros.equipo || j.equipo === filtros.equipo))
    .sort((a, b) => {
      if (orden === 'partidos') return b.partidos - a.partidos || b.titularidades - a.titularidades;
      if (orden === 'minutos') return b.minutosEstimados - a.minutosEstimados || b.partidos - a.partidos;
      if (orden === 'tarjetas') return b.tarjetas - a.tarjetas || b.partidos - a.partidos;
      return b.goles - a.goles || b.partidos - a.partidos;
    });
  return (
    <>
      <div className="mb-5 text-xs text-[#5C646C]">
        <Link href="/competiciones" className="hover:text-club hover:underline">Competiciones</Link><span className="mx-2">/</span>
        <Link href={`/competicion/${slug}`} className="hover:text-club hover:underline">{c.nombre}</Link><span className="mx-2">/</span>
        <span>Jugadores</span>
      </div>
      <p className="font-display text-xs uppercase tracking-[0.16em] text-club">{c.temporada} · {c.grupo}</p>
      <h2 className="mb-1 mt-1 font-display text-3xl uppercase">Jugadores</h2>
      <p className="mb-5 text-sm text-[#5C646C]">{c.nombre}</p>
      <NavegacionCompeticion slug={slug} />

      <>
        <form className="mb-5 grid gap-3 border border-[#D6D6D4] bg-white p-4 sm:grid-cols-3" action={`/competicion/${slug}/jugadores`}>
          <label><span className="etiqueta-filtro">Jugador</span><input className="control-filtro" name="q" defaultValue={filtros.q ?? ''} placeholder="Buscar por nombre" /></label>
          <label><span className="etiqueta-filtro">Equipo</span><select className="control-filtro" name="equipo" defaultValue={filtros.equipo ?? ''}>
            <option value="">Todos los equipos</option>{equipos.map((x) => <option key={x}>{x}</option>)}
          </select></label>
          <label><span className="etiqueta-filtro">Ordenar por</span><select className="control-filtro" name="orden" defaultValue={orden}>
            <option value="goles">Goles</option><option value="partidos">Partidos</option>
            <option value="minutos">Minutos estimados</option><option value="tarjetas">Tarjetas</option>
          </select></label>
          <div className="flex gap-2 sm:col-span-3 sm:justify-end">
            <Link className="boton-secundario" href={`/competicion/${slug}/jugadores`}>Limpiar</Link>
            <button className="boton-primario">Aplicar</button>
          </div>
        </form>
        <Bloque titulo={`${jugadores.length} jugadores`} pie="Estadísticas calculadas sólo dentro de esta competición, grupo y temporada.">
          <div className="overflow-x-auto"><table className="w-full text-sm tabular-nums">
            <thead><tr className="border-b border-[#D6D6D4] text-xs uppercase text-[#5C646C]">
              <th className="p-2 text-left">Jugador</th><th className="p-2 text-left">Equipo</th>
              <th className="p-2 text-right">Conv.</th><th className="p-2 text-right">PJ</th><th className="p-2 text-right">Tit.</th>
              <th className="p-2 text-right">Min.</th><th className="p-2 text-right">Goles</th><th className="p-2 text-right">Tarjetas</th>
            </tr></thead>
            <tbody>{jugadores.map((j) => <tr key={`${j.codigo ?? j.nombre}-${j.equipoCodigo ?? j.equipo}`} className="border-b border-[#EDF0ED]">
              <td className="p-2">{j.codigo ? <Link className="hover:text-club hover:underline" href={`/jugador/${slugJugador(j.codigo, c.federacion)}`}>{j.nombre}</Link> : j.nombre}</td>
              <td className="p-2">{j.equipoCodigo ? <Link className="hover:text-club hover:underline"
                href={`/equipo/${slugEquipo(c.temporadaCodigo, j.equipoCodigo, c.competicionCodigo, c.grupoCodigo, c.federacion)}`}>{j.equipo}</Link> : j.equipo}</td>
              <td className="p-2 text-right">{j.convocatorias}</td><td className="p-2 text-right">{j.partidos}</td><td className="p-2 text-right">{j.titularidades}</td>
              <td className="p-2 text-right">{j.minutosEstimados}</td><td className="p-2 text-right font-semibold">{j.goles}</td>
              <td className="p-2 text-right">{j.tarjetas}</td>
            </tr>)}</tbody>
          </table></div>
        </Bloque>
      </>
    </>
  );
}
