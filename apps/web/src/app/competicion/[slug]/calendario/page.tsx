import Link from 'next/link';
import { notFound } from 'next/navigation';
import { competicionLocal, slugActa, slugEquipo } from '@/lib/repositorio-local';
import { Bloque } from '@/componentes/Bloque';
import { NavegacionCompeticion } from '@/componentes/NavegacionCompeticion';

export const revalidate = 60;

export default async function Calendario({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = competicionLocal(slug);
  if (!c) notFound();
  const jornadas = Array.from({ length: c.jornadas }, (_, i) => i + 1);
  return (
    <>
      <div className="mb-5 text-xs text-[#5C646C]">
        <Link href="/competiciones" className="hover:text-club hover:underline">Competiciones</Link><span className="mx-2">/</span>
        <Link href={`/competicion/${slug}`} className="hover:text-club hover:underline">{c.nombre}</Link><span className="mx-2">/</span>
        <span>Calendario</span>
      </div>
      <p className="font-display text-xs uppercase tracking-[0.16em] text-club">{c.temporada} · {c.grupo}</p>
      <h2 className="mb-1 mt-1 font-display text-3xl uppercase">Calendario completo</h2>
      <p className="mb-5 text-sm text-[#5C646C]">{c.nombre} · {c.jornadas} jornadas</p>
      <NavegacionCompeticion slug={slug} />

      <div className="mb-5 flex flex-wrap gap-1.5 border border-[#D6D6D4] bg-white p-3">
        {jornadas.map((j) => <Link key={j} href={`#jornada-${j}`}
          className="flex h-8 w-9 items-center justify-center border border-[#D6D6D4] font-display text-xs hover:border-club hover:text-club">{j}</Link>)}
      </div>

      {jornadas.map((j) => {
        const partidos = c.partidosLista.filter((p) => p.jornada === j);
        const jugados = partidos.filter((p) => p.golesLocal != null).length;
        return <section key={j} id={`jornada-${j}`} className="scroll-mt-4">
          <Bloque titulo={`Jornada ${j}`} pie={`${jugados} de ${partidos.length} partidos con resultado`}>
            <div className="border-b border-[#EDF0ED] px-4 py-2 text-right">
              <Link className="font-display text-xs uppercase tracking-wider text-club hover:underline"
                href={`/competicion/${slug}/jornada/${j}`}>Partidos y clasificación de la jornada →</Link>
            </div>
            <ul>{partidos.map((p) => <li key={p.orden}
              className="grid items-center gap-2 border-t border-[#EDF0ED] px-4 py-3 first:border-t-0 sm:grid-cols-[8rem_1fr_auto_1fr_auto]">
              <span className="text-xs text-[#5C646C]">{[p.fecha, p.hora].filter(Boolean).join(' · ') || 'Pendiente'}</span>
              <Link className="text-left text-sm hover:text-club hover:underline sm:text-right"
                href={p.codLocal ? `/equipo/${slugEquipo(c.temporadaCodigo, p.codLocal, c.competicionCodigo, c.grupoCodigo, c.federacion)}` : '#'}>{p.local}</Link>
              <strong className="text-center font-display">{p.golesLocal == null ? '–' : `${p.golesLocal} – ${p.golesVisitante}`}</strong>
              <Link className="text-sm hover:text-club hover:underline"
                href={p.codVisitante ? `/equipo/${slugEquipo(c.temporadaCodigo, p.codVisitante, c.competicionCodigo, c.grupoCodigo, c.federacion)}` : '#'}>{p.visitante}</Link>
              <span className="text-right text-xs">
                {p.codActa && p.actaLista ? <Link className="text-club hover:underline" href={`/acta/${slugActa(c.temporadaCodigo, c.competicionCodigo, c.grupoCodigo, p.jornada, p.codActa, c.federacion)}`}>Acta</Link> : ''}
              </span>
            </li>)}</ul>
            {partidos.length === 0 && <p className="p-5 text-sm text-[#5C646C]">Partidos todavía no estructurados.</p>}
          </Bloque>
        </section>;
      })}
    </>
  );
}
