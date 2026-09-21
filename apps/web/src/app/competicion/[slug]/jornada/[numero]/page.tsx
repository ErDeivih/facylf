import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { calculaClasificacion } from '@facylf/dominio';
import { competicionLocal, slugActa, slugEquipo } from '@/lib/repositorio-local';
import { Bloque } from '@/componentes/Bloque';
import { Tabla } from '@/componentes/Tabla';
import { NavegacionCompeticion } from '@/componentes/NavegacionCompeticion';

export const revalidate = 60;

export default async function Jornada({ params }: { params: Promise<{ slug: string; numero: string }> }) {
  const { slug, numero } = await params;
  const c = competicionLocal(slug);
  const n = Number(numero);
  if (!c || !Number.isInteger(n) || n < 1 || (c.jornadas > 0 && n > c.jornadas)) notFound();
  const partidos = c.partidosLista.filter((p) => p.jornada === n);
  const hastaJornada = c.partidosLista.filter((p) => p.jornada <= n);
  const tabla = calculaClasificacion(hastaJornada);
  const enlacesEquipo = Object.fromEntries(c.partidosLista.flatMap((p) => [
    [p.local, p.codLocal ? `/equipo/${slugEquipo(c.temporadaCodigo, p.codLocal, c.competicionCodigo, c.grupoCodigo, c.federacion)}` : ''],
    [p.visitante, p.codVisitante ? `/equipo/${slugEquipo(c.temporadaCodigo, p.codVisitante, c.competicionCodigo, c.grupoCodigo, c.federacion)}` : ''],
  ]));
  return (
    <>
      <div className="mb-5 text-xs text-[#5C646C]">
        <Link href="/competiciones" className="hover:text-club hover:underline">Competiciones</Link><span className="mx-2">/</span>
        <Link href={`/competicion/${slug}`} className="hover:text-club hover:underline">{c.nombre}</Link><span className="mx-2">/</span>
        <span>Jornada {n}</span>
      </div>
      <p className="font-display text-xs uppercase tracking-[0.16em] text-club">{c.temporada} · {c.grupo}</p>
      <h2 className="mb-1 mt-1 font-display text-3xl uppercase">Jornada {n}</h2>
      <p className="mb-5 text-sm text-[#5C646C]">{c.nombre}</p>
      <NavegacionCompeticion slug={slug} />

      <nav className="mb-6 flex items-center justify-between gap-3 border border-[#D6D6D4] bg-white p-2" aria-label="Cambiar jornada">
        {n > 1 ? <Link className="boton-secundario" href={`/competicion/${slug}/jornada/${n - 1}`}>← Jornada {n - 1}</Link> : <span />}
        <Link className="text-center font-display text-xs uppercase text-club hover:underline" href={`/competicion/${slug}/calendario`}>Todas las jornadas</Link>
        {n < c.jornadas ? <Link className="boton-secundario" href={`/competicion/${slug}/jornada/${n + 1}`}>Jornada {n + 1} →</Link> : <span />}
      </nav>

      <Bloque titulo={`${partidos.length} partidos`} pie="Selecciona un equipo o abre el acta cuando esté disponible.">
        <ul>{partidos.map((p) => {
          const localHref = p.codLocal ? `/equipo/${slugEquipo(c.temporadaCodigo, p.codLocal, c.competicionCodigo, c.grupoCodigo, c.federacion)}` : null;
          const visitanteHref = p.codVisitante ? `/equipo/${slugEquipo(c.temporadaCodigo, p.codVisitante, c.competicionCodigo, c.grupoCodigo, c.federacion)}` : null;
          return <li key={p.orden} className="border-t border-[#EDF0ED] px-4 py-4 first:border-t-0">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
              {localHref ? <Link className="text-right font-medium hover:text-club hover:underline" href={localHref as Route}>{p.local}</Link> : <span className="text-right">{p.local}</span>}
              <strong className="min-w-14 text-center font-display text-xl">{p.golesLocal == null ? '–' : `${p.golesLocal} – ${p.golesVisitante}`}</strong>
              {visitanteHref ? <Link className="font-medium hover:text-club hover:underline" href={visitanteHref as Route}>{p.visitante}</Link> : <span>{p.visitante}</span>}
            </div>
            <p className="mt-2 text-center text-xs text-[#5C646C]">{[p.fecha, p.hora, p.campo, p.arbitro].filter(Boolean).join(' · ') || 'Horario pendiente'}</p>
            {p.codActa && <p className="mt-2 text-center">
              {p.actaLista
                ? <Link className="font-display text-xs uppercase tracking-wider text-club hover:underline" href={`/acta/${slugActa(c.temporadaCodigo, c.competicionCodigo, c.grupoCodigo, p.jornada, p.codActa, c.federacion)}`}>Ver acta y alineaciones →</Link>
                : <span className="text-[11px] text-[#8A8E91]">Acta localizada, pendiente de análisis</span>}
            </p>}
          </li>;
        })}</ul>
        {partidos.length === 0 && <p className="p-6 text-sm text-[#5C646C]">Esta jornada está en el calendario, pero aún no tiene partidos estructurados.</p>}
      </Bloque>

      {tabla.length > 0 && <Bloque titulo={`Clasificación tras la jornada ${n}`}
        pie="Calculada exclusivamente con los resultados disponibles hasta esta jornada.">
        <Tabla filas={tabla} enlacesEquipo={enlacesEquipo} />
      </Bloque>}
    </>
  );
}
