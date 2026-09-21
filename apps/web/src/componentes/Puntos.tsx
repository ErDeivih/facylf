'use client';

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { serieDeEquipo, type Partido } from '@facylf/dominio';

/** Puntos acumulados del equipo jornada a jornada. */
export function Puntos({ partidos, equipo }: { partidos: Partido[]; equipo: string }) {
  const s = serieDeEquipo(partidos, equipo);
  const datos = s.jornadas.map((j, i) => ({ jornada: j, puntos: s.puntos[i] }));

  if (datos.length === 0) {
    return <p className="p-6 text-sm text-[var(--texto-suave)]">Sin partidos todavía.</p>;
  }

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={datos} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}>
          <CartesianGrid stroke="currentColor" className="text-[var(--borde)]" />
          <XAxis dataKey="jornada" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} className="text-[var(--texto-suave)]" />
          <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} allowDecimals={false} className="text-[var(--texto-suave)]" />
          <Tooltip />
          <Area type="monotone" dataKey="puntos" name="Puntos" stroke="currentColor" fill="currentColor" fillOpacity={0.15} strokeWidth={2} className="text-[var(--victoria)]" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
