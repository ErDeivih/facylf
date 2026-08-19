import Link from 'next/link';
import { notFound } from 'next/navigation';
import { calculaClasificacion, esDe, mismoEquipo } from '@fcylf/dominio';
import { aSlug, competicion, MI_EQUIPO } from '@/lib/datos';
import { Bloque } from '@/componentes/Bloque';
import { fechaCorta } from '@/componentes/Proximo';

export const revalidate = 3600;

export function generateStaticParams() {
  return competicion().equipos.map((e) => ({ slug: aSlug(e) }));
}

export default async function Equipo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = competicion();
  const equipo = c.equipos.find((e) => aSlug(e) === slug);
  if (!equipo) notFound();

  const fila = calculaClasificacion(c.partidos).find((f) => f.equipo === equipo)!;
  const suyos = c.partidos.filter((p) => esDe(p, equipo));
  const contraNosotros = mismoEquipo(equipo, MI_EQUIPO)
    ? [] : suyos.filter((p) => esDe(p, MI_EQUIPO));

  return (
    <>
      <h2 className="mb-4 font-display text-2xl uppercase tracking-wide">{equipo}</h2>

      <div className="mb-6 grid grid-cols-2 gap-px border border-[#D6D6D4] bg-[#D6D6D4] sm:grid-cols-4">
        {[
          ['Puntos', fila.puntos], ['Jugados', fila.jugados],
          ['G · E · P', `${fila.ganados}-${fila.empatados}-${fila.perdidos}`],
          ['Posición', fila.jugados ? `${fila.posicion}º` : '—'],
        ].map(([k, v]) => (
          <div key={String(k)} className="bg-white px-3 py-3">
            <div className="font-display text-2xl leading-none">{v}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.1em] text-[#5C646C]">{k}</div>
          </div>
        ))}
      </div>

      {contraNosotros.length > 0 && (
        <Bloque titulo="Contra nosotros">
          <ul className="p-4 text-sm">
            {contraNosotros.map((p, i) => (
              <li key={i} className="py-1">
                Jornada {p.jornada} · {p.fecha && fechaCorta(p.fecha)} ·{' '}
                {mismoEquipo(p.local, MI_EQUIPO) ? 'en casa' : 'fuera'} · {p.local} – {p.visitante}
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      <Bloque titulo={`Sus ${suyos.length} partidos`}>
        <ul>
          {suyos.map((p, i) => (
            <li key={i} className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-3 border-t border-[#EDF0ED] px-4 py-2 text-sm first:border-t-0">
              <span className="w-14 font-display text-xs uppercase tracking-wider text-[#5C646C]">J{p.jornada}</span>
              <Link className="text-right hover:underline" href={`/equipo/${aSlug(p.local)}`}>{p.local}</Link>
              <span className="font-display text-[#5C646C]">–</span>
              <Link className="hover:underline" href={`/equipo/${aSlug(p.visitante)}`}>{p.visitante}</Link>
            </li>
          ))}
        </ul>
      </Bloque>
    </>
  );
}
