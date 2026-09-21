import Link from 'next/link';
import type { Route } from 'next';
import type { FilaClasificacion } from '@facylf/dominio';

export function Tabla({ filas, ascienden = 2, enlacesEquipo = {} }: {
  filas: FilaClasificacion[]; ascienden?: number; enlacesEquipo?: Record<string, string>;
}) {
  if (filas.every((f) => f.jugados === 0)) {
    return (
      <p className="p-6 text-sm text-[var(--texto-suave)]">
        Todavía no se ha jugado ninguna jornada. La clasificación aparecerá sola en cuanto
        haya resultados.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm tabular-nums">
        {/*
          * `caption` SIEMPRE, aunque sea visualmente invisible: es lo que anuncia un lector de pantalla al
          * entrar en la tabla, y sin él una tabla de clasificación es una rejilla de números sin nombre.
        */}
        <caption className="sr-only">
          Clasificación: posición, equipo, partidos jugados, ganados, empatados, perdidos, goles a favor,
          goles en contra, diferencia de goles y puntos.
        </caption>
        <thead>
          <tr className="border-b border-[var(--borde)] text-xs uppercase tracking-[0.1em] text-[var(--texto-suave)]">
            <th scope="col" className="p-2 text-left">#</th>
            <th scope="col" className="p-2 text-left">Equipo</th>
            {['PJ', 'G', 'E', 'P', 'GF', 'GC', 'DG', 'Pts'].map((h) => (
              <th key={h} scope="col" className="p-2 text-right">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            return (
              <tr key={f.equipo}
                  className="border-b border-[var(--borde)]">
                <td className={`p-2 font-display text-[var(--texto-suave)] ${f.posicion <= ascienden ? 'border-l-[3px] border-[var(--victoria)]' : ''}`}>
                  {f.posicion}
                </td>
                <td className="p-2">
                  {enlacesEquipo[f.equipo]
                    ? <Link className="hover:underline" href={enlacesEquipo[f.equipo] as Route}>{f.equipo}</Link>
                    : f.equipo}
                  {f.sorteoPendiente && (
                    <span className="ml-2 text-xs font-normal text-[var(--amarilla)]" title="empate que sólo rompe un sorteo">
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
