import Link from 'next/link';
import type { Route } from 'next';

export interface DatoBarra { etiqueta: string; valor: number; detalle?: string; href?: string }

export function Barras({ datos, unidad = '' }: { datos: DatoBarra[]; unidad?: string }) {
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  if (datos.length === 0) return <p className="p-5 text-sm text-[var(--texto-suave)]">Aún no hay datos suficientes.</p>;
  return <ol className="space-y-3 p-4">{datos.map((dato, indice) => (
    <li key={`${dato.etiqueta}-${indice}`}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">
          <span className="mr-2 font-display text-xs text-[var(--texto-suave)]">{indice + 1}</span>
          {dato.href ? <Link className="hover:underline" href={dato.href as Route}>{dato.etiqueta}</Link> : dato.etiqueta}
        </span>
        <span className="shrink-0 font-display">{dato.valor.toLocaleString('es-ES')}{unidad}</span>
      </div>
      <div className="h-2 overflow-hidden bg-[var(--fondo-sutil)]"><div className="h-full bg-club" style={{ width: `${Math.max(3, dato.valor / maximo * 100)}%` }} /></div>
      {dato.detalle && <p className="mt-1 text-etiqueta text-[var(--texto-suave)]">{dato.detalle}</p>}
    </li>
  ))}</ol>;
}
