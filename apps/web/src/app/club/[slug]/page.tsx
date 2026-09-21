import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bloque } from '@/componentes/Bloque';
import { clubLocal, slugClub } from '@/lib/repositorio-local';

export const revalidate = 60;

export default async function Club({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = clubLocal(slug);
  if (!club) notFound();
  const temporadas = [...new Map(club.historico.map((e) => [e.temporadaCodigo, e.temporada])).entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]));
  return <>
    <div className="mb-5 text-xs text-[#5C646C]">
      <Link href="/equipos" className="hover:text-club hover:underline">Equipos</Link>
      <span className="mx-2">/</span><span>Club</span><span className="mx-2">/</span><span>{club.temporada}</span>
    </div>
    <p className="font-display text-xs uppercase tracking-[0.16em] text-club">Club · temporada {club.temporada}</p>
    <h2 className="mt-1 font-display text-3xl uppercase">{club.nombre}</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5C646C]">
      Agrupa equipos con el mismo nombre federativo de club durante esta temporada, admitiendo únicamente
      sufijos inequívocos de filial. Cada plantilla y competición continúa separada en su ficha de equipo.
    </p>

    <div className="my-6 grid grid-cols-2 gap-px border border-[#D6D6D4] bg-[#D6D6D4] sm:grid-cols-4">
      {([['Equipos inscritos', club.equipos.length], ['Partidos', club.jugados],
        ['Goles a favor', club.golesFavor], ['Campos utilizados', club.campos.length]] as const)
        .map(([titulo, valor]) => <div key={titulo} className="bg-white p-4">
          <p className="font-display text-2xl">{valor}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-[#5C646C]">{titulo}</p>
        </div>)}
    </div>

    <Bloque titulo={`Equipos inscritos · ${club.equipos.length}`}
      pie="Un juvenil, un alevín y un equipo aficionado del club son contextos deportivos distintos.">
      <div className="grid gap-px bg-[#EDF0ED] md:grid-cols-2">
        {club.equipos.map((e) => <Link key={e.slug} href={`/equipo/${e.slug}`}
          className="bg-white p-4 hover:bg-[#FAFBFA] hover:text-club">
          <div className="mb-1 flex flex-wrap gap-1.5"><span className="insignia">{e.categoria}</span>
            {e.provincias.map((p) => <span key={p} className="insignia insignia-roja">{p}</span>)}</div>
          <p className="font-medium">{e.competicion}</p>
          <p className="mt-1 text-xs text-[#5C646C]">{e.grupo} · {e.jugados}/{e.partidos} jugados · {e.golesFavor}-{e.golesContra} goles</p>
        </Link>)}
      </div>
      {club.equipos.length === 0 && <p className="p-5 text-sm text-[#5C646C]">Aún no hay equipos estructurados para esta temporada.</p>}
    </Bloque>

    <div className="grid gap-5 lg:grid-cols-2">
      <Bloque titulo="Campos utilizados" pie="Ordenados por partidos registrados del club.">
        <ol>{club.campos.map((campo, i) => <li key={`${campo.codigo}-${campo.nombre}`}
          className="flex gap-3 border-t border-[#EDF0ED] px-4 py-3 text-sm first:border-t-0">
          <span className="w-6 font-display text-[#5C646C]">{i + 1}</span>
          <span className="flex-1">{campo.nombre}</span><span>· {campo.comoLocal} local · {campo.partidos} total</span>
        </li>)}</ol>
        {club.campos.length === 0 && <p className="p-5 text-sm text-[#5C646C]">Sin campos informados todavía.</p>}
      </Bloque>
      <Bloque titulo="Otras temporadas con el mismo nombre federativo"
        pie="Es una coincidencia nominal conservadora; no se fusionan automáticamente entidades dudosas.">
        <div className="flex flex-wrap gap-2 p-4">
          {temporadas.map(([codigo, etiqueta]) => {
            const candidato = club.historico.find((e) => e.temporadaCodigo === codigo)!;
            return <Link key={codigo} className="boton-secundario" href={`/club/${slugClub(codigo, candidato.codigo, club.federacion)}`}>{etiqueta}</Link>;
          })}
          {temporadas.length === 0 && <p className="text-sm text-[#5C646C]">Todavía no hay otra temporada enlazable con seguridad.</p>}
        </div>
      </Bloque>
    </div>
  </>;
}
