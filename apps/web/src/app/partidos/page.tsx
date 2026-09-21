import Link from 'next/link';
import { datosFederacion, federacionDesde, listarPartidosLocal, slugActa, slugEquipo } from '@/lib/repositorio-local';
import { Bloque } from '@/componentes/Bloque';
import { SelectorFederacion } from '@/componentes/SelectorFederacion';

export const revalidate = 60;

export default async function Partidos({ searchParams }: { searchParams: Promise<{ federacion?: string }> }) {
  const federacion = federacionDesde((await searchParams).federacion);
  const partidos = listarPartidosLocal(150, federacion);
  return (
    <>
      <h2 className="font-display text-2xl uppercase">Partidos</h2>
      <p className="mb-4 mt-2 text-sm text-[#5C646C]">Últimos {partidos.length} partidos estructurados de {datosFederacion(federacion).nombre}.</p>
      <SelectorFederacion federacion={federacion} action="/partidos" />
      <Bloque titulo="Resultados y calendario">
        <ul>{partidos.map((p) => <li key={`${p.grupoSlug}-${p.jornada}-${p.orden}`} className="border-t border-[#EDF0ED] px-4 py-3 first:border-t-0">
          <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-[#5C646C]">
            <Link className="hover:text-club" href={`/competicion/${p.grupoSlug}`}>{p.competicion} · {p.grupo}</Link><span>{p.temporada} · J{p.jornada}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 text-sm">
            <Link className="text-right hover:underline" href={p.codLocal ? `/equipo/${slugEquipo(p.temporadaCodigo, p.codLocal, p.competicionCodigo, p.grupoCodigo, p.federacion)}` : '#'}>{p.local}</Link>
            <strong className="font-display">{p.golesLocal == null ? '–' : `${p.golesLocal} – ${p.golesVisitante}`}</strong>
            <Link className="hover:underline" href={p.codVisitante ? `/equipo/${slugEquipo(p.temporadaCodigo, p.codVisitante, p.competicionCodigo, p.grupoCodigo, p.federacion)}` : '#'}>{p.visitante}</Link>
          </div>
          {(p.fecha || p.campo || p.arbitro) && <p className="mt-1 text-center text-xs text-[#5C646C]">{[p.fecha, p.hora, p.campo, p.arbitro].filter(Boolean).join(' · ')}</p>}
          {p.codActa && p.actaLista && <p className="mt-1 text-center text-xs"><Link className="text-club hover:underline" href={`/acta/${slugActa(p.temporadaCodigo, p.competicionCodigo, p.grupoCodigo, p.jornada, p.codActa, p.federacion)}`}>Ver acta</Link></p>}
        </li>)}</ul>
      </Bloque>
    </>
  );
}
