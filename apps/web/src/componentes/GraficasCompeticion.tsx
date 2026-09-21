'use client';

import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { FilaClasificacion } from '@facylf/dominio';
import type { TramoGolesLocal } from '@/lib/repositorio-local';

export function RendimientoEquipos({ filas }: { filas: FilaClasificacion[] }) {
  const datos = filas.map((f) => ({ equipo: f.equipo, GF: f.golesFavor, GC: f.golesContra, Puntos: f.puntos }));
  if (!datos.some((d) => d.GF || d.GC)) return <p className="p-5 text-sm text-[var(--texto-suave)]">Aún no hay marcadores suficientes.</p>;
  return <div className="h-[420px] p-3">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={datos} layout="vertical" margin={{ top: 5, right: 15, bottom: 5, left: 95 }}>
        {/* Color por rol, vía `currentColor`: un atributo de SVG no admite `var()`. */}
        <CartesianGrid stroke="currentColor" className="text-[var(--borde)]" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="equipo" width={90} tick={{ fontSize: 10 }} />
        <Tooltip /><Legend />
        <Bar dataKey="GF" name="Goles a favor" fill="currentColor" className="text-[var(--victoria)]" />
        <Bar dataKey="GC" name="Goles en contra" fill="currentColor" className="text-[var(--derrota)]" />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function DistribucionGoles({ tramos }: { tramos: TramoGolesLocal[] }) {
  if (!tramos.some((t) => t.goles > 0)) return <p className="p-5 text-sm text-[var(--texto-suave)]">Aparecerá al analizar las actas.</p>;
  return <div className="h-64 p-3">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={tramos} margin={{ top: 5, right: 10, bottom: 5, left: -15 }}>
        <CartesianGrid stroke="currentColor" className="text-[var(--borde)]" vertical={false} />
        <XAxis dataKey="tramo" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="goles" name="Goles" fill="currentColor" className="text-[var(--derrota)]" />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
