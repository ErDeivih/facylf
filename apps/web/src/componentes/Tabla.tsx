import Link from 'next/link';
import type { FilaClasificacion } from '@fcylf/dominio';
import { mismoEquipo } from '@fcylf/dominio';
import { aSlug, MI_EQUIPO } from '@/lib/datos';

export function Tabla({ filas, ascienden = 2 }: { filas: FilaClasificacion[]; ascienden?: number }) {
  if (filas.every((f) => f.jugados === 0)) {
    return (
      <p className="p-6 text-sm text-[#5C646C]">
        Todavía no se ha jugado ninguna jornada. La clasificación aparecerá sola en cuanto
        haya resultados.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead>
          <tr className="border-b border-[#D6D6D4] text-xs uppercase tracking-[0.1em] text-[#5C646C]">
            <th className="p-2 text-left">#</th>
            <th className="p-2 text-left">Equipo</th>
            {['PJ', 'G', 'E', 'P', 'GF', 'GC', 'DG', 'Pts'].map((h) => (
              <th key={h} className="p-2 text-right">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const mio = mismoEquipo(f.equipo, MI_EQUIPO);
            return (
              <tr key={f.equipo}
                  className={`border-b border-[#EDF0ED] ${mio ? 'bg-club-claro font-semibold' : ''}`}>
                <td className={`p-2 font-display text-[#5C646C] ${f.posicion <= ascienden ? 'border-l-[3px] border-[#1F7A46]' : ''}`}>
                  {f.posicion}
                </td>
                <td className="p-2">
                  <Link className="hover:underline" href={`/equipo/${aSlug(f.equipo)}`}>{f.equipo}</Link>
                  {f.sorteoPendiente && (
                    <span className="ml-2 text-xs font-normal text-[#A87A12]" title="empate que sólo rompe un sorteo">
                      empate sin resolver
                    </span>
                  )}
                </td>
                {[f.jugados, f.ganados, f.empatados, f.perdidos, f.golesFavor, f.golesContra].map((v, i) => (
                  <td key={i} className="p-2 text-right">{v}</td>
                ))}
                <td className="p-2 text-right">{f.diferencia > 0 ? '+' : ''}{f.diferencia}</td>
                <td className="p-2 text-right font-display text-base">{f.puntos}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
