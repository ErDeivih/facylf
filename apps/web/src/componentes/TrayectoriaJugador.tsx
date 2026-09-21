'use client';

import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import type { TemporadaJugadorLocal } from '@/lib/repositorio-local';

export function TrayectoriaJugador({ temporadas }: { temporadas: TemporadaJugadorLocal[] }) {
  const datos = [...temporadas].reverse().map((t) => ({
    temporada: t.temporada, PJ: t.partidos, Titular: t.titularidades,
    Goles: t.goles, Minutos: t.minutosEstimados,
  }));
  if (!datos.length) return <p className="p-5 text-sm text-[var(--texto-suave)]">Sin temporadas suficientes.</p>;
  return <div className="grid gap-5 p-3 lg:grid-cols-2">
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 10, right: 14, bottom: 5, left: -20 }}>
          <CartesianGrid stroke="currentColor" className="text-[var(--borde)]" vertical={false} />
          <XAxis dataKey="temporada" tick={{ fontSize: 10 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
          <Tooltip /><Legend />
          <Line type="monotone" dataKey="PJ" name="Partidos jugados" stroke="currentColor" className="text-[var(--texto)]" strokeWidth={2} />
          <Line type="monotone" dataKey="Titular" name="Titularidades" stroke="currentColor" className="text-[var(--derrota)]" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 10, right: 14, bottom: 5, left: -20 }}>
          <CartesianGrid stroke="currentColor" className="text-[var(--borde)]" vertical={false} />
          <XAxis dataKey="temporada" tick={{ fontSize: 10 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
          <Tooltip /><Legend />
          <Bar dataKey="Goles" fill="currentColor" className="text-[var(--derrota)]" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>;
}
