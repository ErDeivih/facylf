'use client';

import { evolucionPorJornada, equiposDe, type Partido } from '@facylf/dominio';

/** Color según puntos acumulados al cierre de esa jornada. */
function colorDe(puntos: number): string {
  if (puntos >= 30) return 'bg-[var(--calor-3)]';
  if (puntos >= 15) return 'bg-[var(--calor-2)]';
  if (puntos >= 5) return 'bg-[var(--calor-1)]';
  return 'bg-[var(--fondo-sutil)]';
}

/** Mapa de calor de la temporada: filas = equipos, columnas = jornadas, color = puntos. */
export function MapaCalor({ partidos }: { partidos: Partido[] }) {
  const equipos = equiposDe(partidos);
  const evolucion = evolucionPorJornada(partidos);
  const jornadas = evolucion.map((e) => e.jornada);

  if (jornadas.length === 0 || equipos.length === 0) {
    return <p className="p-6 text-sm text-[var(--texto-suave)]">Sin datos para el mapa de calor.</p>;
  }

  // puntos[equipo][jornada] (en el orden de `jornadas`)
  const puntos = new Map<string, Map<number, number>>();
  for (const { jornada, filas } of evolucion) {
    for (const f of filas) {
      if (!puntos.has(f.equipo)) puntos.set(f.equipo, new Map());
      puntos.get(f.equipo)!.set(jornada, f.puntos);
    }
  }

  return (
    <div className="overflow-x-auto p-4">
      <table className="border-collapse text-xs tabular-nums">
        <caption className="sr-only">
          Puntos por jornada: una fila por equipo y una columna por jornada. El número y el color son los
          puntos acumulados al cierre de esa jornada (cuanto más rojo, más puntos).
        </caption>
        <thead>
          <tr>
            <th scope="col" className="p-1 text-left text-[var(--texto-suave)]" />
            {jornadas.map((j) => <th key={j} scope="col" className="p-1 text-center font-normal text-[var(--texto-suave)]">{j}</th>)}
          </tr>
        </thead>
        <tbody>
          {equipos.map((eq) => (
            <tr key={eq}>
              <td className="whitespace-nowrap pr-2 text-sm">{eq}</td>
              {jornadas.map((j) => {
                const p = puntos.get(eq)?.get(j);
                return (
                  <td key={j} className="p-[1px]">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-sm text-[10px] text-white ${colorDe(p ?? 0)}`}>
                      {p ?? ''}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
