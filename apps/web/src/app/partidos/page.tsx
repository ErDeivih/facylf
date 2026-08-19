import Link from 'next/link';
import { competicion, aSlug, MI_EQUIPO } from '@/lib/datos';
import { esDe } from '@fcylf/dominio';
import { Bloque } from '@/componentes/Bloque';
import { fechaCorta } from '@/componentes/Proximo';

export const revalidate = 3600;

export default function Partidos() {
  const c = competicion();
  const jornadas = [...new Set(c.partidos.map((p) => p.jornada))].sort((a, b) => a - b);

  return (
    <>
      <p className="mb-6 text-sm text-[#5C646C]">
        Las {c.jornadas} jornadas de la temporada, con los {c.partidos.length} partidos del
        grupo. Las fechas son las de la jornada, tal cual las publica la federación: los
        horarios reales de cada partido aún no están.
      </p>
      {jornadas.map((j) => {
        const ps = c.partidos.filter((p) => p.jornada === j);
        return (
          <Bloque key={j} titulo={`Jornada ${j}`} pie={ps[0]?.fecha ? fechaCorta(ps[0].fecha) : undefined}>
            <ul>
              {ps.map((p, i) => (
                <li key={i}
                    className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-[#EDF0ED] px-4 py-2 text-sm first:border-t-0 ${esDe(p, MI_EQUIPO) ? 'bg-club-claro' : ''}`}>
                  <Link className="text-right hover:underline" href={`/equipo/${aSlug(p.local)}`}>{p.local}</Link>
                  <span className="font-display text-[#5C646C]">–</span>
                  <Link className="hover:underline" href={`/equipo/${aSlug(p.visitante)}`}>{p.visitante}</Link>
                </li>
              ))}
            </ul>
          </Bloque>
        );
      })}
    </>
  );
}
