/**
 * Barra 1-X-2 reutilizable: tres tramos con sus porcentajes dentro. Sin gráficos ni JavaScript.
 * El ancho de cada tramo es el porcentaje; el texto se oculta si el tramo es demasiado estrecho.
 */
export function Barra1X2({ local, empate, visitante, etiqueta }: {
  local: number;
  empate: number;
  visitante: number;
  etiqueta?: string;
}) {
  const total = Math.max(0.01, local + empate + visitante);
  const p1 = (local / total) * 100;
  const px = (empate / total) * 100;
  const p2 = (visitante / total) * 100;
  const tramo = (ancho: number, texto: string, clase: string) => (
    <span className={`flex min-w-0 items-center justify-center overflow-hidden text-[10px] font-semibold tabular-nums ${clase}`}
      style={{ width: `${ancho}%` }}>
      {ancho >= 18 ? texto : ''}
    </span>
  );
  return (
    <div>
      <div role="img" aria-label={etiqueta ?? `1 ${local.toFixed(1)} %, X ${empate.toFixed(1)} %, 2 ${visitante.toFixed(1)} %`}
        className="flex h-6 w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--borde)]">
        {tramo(p1, `1 ${local.toFixed(1)} %`, 'bg-[var(--accion)] text-[var(--texto-inverso)]')}
        {tramo(px, `X ${empate.toFixed(1)} %`, 'bg-[var(--fondo-sutil)] text-[var(--texto)]')}
        {tramo(p2, `2 ${visitante.toFixed(1)} %`, 'bg-[var(--fondo-fuerte)] text-[var(--texto-fuerte)]')}
      </div>
      {/* Los tres porcentajes siempre legibles, aunque un tramo sea demasiado estrecho para su etiqueta. */}
      <div className="mt-0.5 flex justify-between gap-2 text-[10px] tabular-nums text-[var(--texto-suave)]">
        <span>1 {local.toFixed(1).replace('.', ',')} %</span>
        <span>X {empate.toFixed(1).replace('.', ',')} %</span>
        <span>2 {visitante.toFixed(1).replace('.', ',')} %</span>
      </div>
    </div>
  );
}
