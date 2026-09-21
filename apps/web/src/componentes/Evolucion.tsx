'use client';

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { serieDeEquipo, type Partido } from '@facylf/dominio';

/** Posición del equipo jornada a jornada. La posición 1 se ve arriba (eje invertido). */
export function Evolucion({ partidos, equipo }: { partidos: Partido[]; equipo: string }) {
  const s = serieDeEquipo(partidos, equipo);

  // rellena hacia delante: si una jornada no tiene posición (no ha jugado), se mantiene la anterior
  let previo: number | null = null;
  const datos = s.jornadas.map((j, i) => {
    const p = s.posicion[i] ?? previo;
    previo = p;
    return { jornada: j, posicion: p };
  });

  const conDatos = datos.some((d) => d.posicion !== null);
  if (!conDatos) {
    return (
      <p className="p-6 text-sm text-[var(--texto-suave)]">
        Todavía no hay resultados: la gráfica de posición aparecerá en cuanto el equipo
        tenga partidos jugados.
      </p>
    );
  }

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          {/*
            * Los colores de serie salen de los TOKENS, no de la paleta de la librería: un atributo de SVG no
            * admite `var()`, así que el color viaja por `currentColor` y lo pone una clase con el rol.
          */}
          <CartesianGrid stroke="currentColor" className="text-[var(--borde)]" />
          <XAxis dataKey="jornada" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} className="text-[var(--texto-suave)]" />
          <YAxis reversed domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} className="text-[var(--texto-suave)]" />
          <Tooltip formatter={(v: number) => v === 1 ? '1º' : `${v}º`} />
          <Line type="monotone" dataKey="posicion" name="Posición" stroke="currentColor" strokeWidth={2} dot={{ r: 3, fill: 'currentColor' }} className="text-[var(--derrota)]" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
