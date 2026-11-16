/**
 * Barra 1-X-2 reutilizable: tres tramos con sus porcentajes dentro. Sin gráficos ni JavaScript.
 * El ancho de cada tramo es el porcentaje; el texto se oculta si el tramo es demasiado estrecho.
 */
export function Barra1X2({ local, empate, visitante, etiqueta }: {
  local: number | string;
  empate: number | string;
  visitante: number | string;
  etiqueta?: string;
}) {
  // PostgreSQL devuelve numeric como string; se normaliza aquí para que la barra no reciba texto.
  const l = Number(local) || 0;
  const x = Number(empate) || 0;
  const v = Number(visitante) || 0;
  const total = Math.max(0.01, l + x + v);
  const p1 = (l / total) * 100;
  const px = (x / total) * 100;
  const p2 = (v / total) * 100;
  const tramo = (ancho: number, texto: string, clase: string) => (
    <span className={`flex min-w-0 items-center justify-center overflow-hidden text-[10px] font-semibold tabular-nums ${clase}`}
      style={{ width: `${ancho}%` }}>
      {ancho >= 18 ? texto : ''}
    </span>
  );
  return (
    <div>
      <div role="img" aria-label={etiqueta ?? `1 ${l.toFixed(1)} %, X ${x.toFixed(1)} %, 2 ${v.toFixed(1)} %`}
        className="flex h-6 w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--borde)]">
        {tramo(p1, `1 ${l.toFixed(1)} %`, 'bg-[var(--accion)] text-[var(--texto-inverso)]')}
        {tramo(px, `X ${x.toFixed(1)} %`, 'bg-[var(--fondo-sutil)] text-[var(--texto)]')}
        {tramo(p2, `2 ${v.toFixed(1)} %`, 'bg-[var(--fondo-fuerte)] text-[var(--texto-fuerte)]')}
      </div>
    </div>
  );
}
