import type { FilaPartidoCanonico } from '@/consultas/partidos';

type Serie = { id: number; nombre: string; puntos: { j: number; elo: number }[]; elo: number };

const COLORES = ['var(--accion)', 'var(--victoria)', 'var(--derrota)', 'var(--amarilla)', '#8b5cf6'];

/**
 * Ranking y progresión Elo del grupo, calculado con los resultados ya jugados.
 *
 * No se guarda en la base: son 90 partidos por grupo y se reconstruye en la petición. Elo inicial
 * 1500, K=20 y 60 puntos de ventaja local; cada jornada actualiza a los dos equipos. La línea de cada
 * equipo se dibuja en gris y las cinco primeras del ranking actual en color, con su tabla debajo.
 */
export function EloDelGrupo({ partidos }: { partidos: readonly FilaPartidoCanonico[] }) {
  const jugados = partidos
    .filter((p) => p.goles_local !== null && p.goles_visitante !== null)
    .slice()
    .sort((a, b) => (a.jornada ?? 0) - (b.jornada ?? 0) || (a.orden ?? 0) - (b.orden ?? 0));
  if (jugados.length === 0) {
    return (
      <section className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-4">
        <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">Ranking Elo</h2>
        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">Sin partidos jugados: la progresión aparecerá con el primer resultado.</p>
      </section>
    );
  }
  const elo = new Map<number, number>();
  const nombre = new Map<number, string>();
  const series = new Map<number, Serie>();
  const ultimaJornada = Math.max(...jugados.map((p) => p.jornada ?? 1));
  for (const p of jugados) {
    const local = p.local_id;
    const visitante = p.visitante_id;
    nombre.set(local, p.local_nombre_corto ?? p.local);
    nombre.set(visitante, p.visitante_nombre_corto ?? p.visitante);
    const a = elo.get(local) ?? 1500;
    const b = elo.get(visitante) ?? 1500;
    const esperado = 1 / (1 + 10 ** (-((a + 60) - b) / 400));
    const real = p.goles_local! > p.goles_visitante! ? 1 : p.goles_local === p.goles_visitante ? 0.5 : 0;
    const cambio = 20 * (real - esperado);
    elo.set(local, a + cambio);
    elo.set(visitante, b - cambio);
    for (const [id, valor] of [[local, a + cambio], [visitante, b - cambio]] as const) {
      if (!series.has(id)) series.set(id, { id, nombre: nombre.get(id) ?? String(id), puntos: [], elo: valor });
      series.get(id)!.puntos.push({ j: p.jornada ?? 1, elo: valor });
      series.get(id)!.elo = valor;
    }
  }
  const ranking = [...series.values()].sort((a, b) => b.elo - a.elo);
  const top = ranking.slice(0, 5);
  const todos = [...series.values()];
  const min = Math.min(...todos.flatMap((s) => s.puntos.map((p) => p.elo))) - 10;
  const max = Math.max(...todos.flatMap((s) => s.puntos.map((p) => p.elo))) + 10;
  const x = (j: number) => ((j - 1) / Math.max(1, ultimaJornada - 1)) * 100;
  const y = (v: number) => 100 - ((v - min) / Math.max(1, max - min)) * 100;
  const linea = (s: Serie) => s.puntos.map((p) => `${x(p.j).toFixed(2)},${y(p.elo).toFixed(2)}`).join(' ');

  return (
    <section aria-labelledby="elo" className="flex flex-col gap-2 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="elo" className="m-0 text-bloque font-bold text-[var(--texto)]">Ranking Elo</h2>
        <p className="m-0 text-etiqueta text-[var(--texto-suave)]">Progresión jornada a jornada · {jugados.length} partidos</p>
      </div>
      <div className="h-44 w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={`Progresión Elo de ${todos.length} equipos`}>
          {[25, 50, 75].map((v) => <line key={v} x1="0" y1={v} x2="100" y2={v} stroke="currentColor" strokeOpacity="0.08" vectorEffect="non-scaling-stroke" />)}
          {todos.map((s) => <polyline key={s.id} points={linea(s)} fill="none" stroke="currentColor" strokeOpacity="0.13" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          {top.map((s, i) => (
            <polyline key={s.id} points={linea(s)} fill="none" stroke={COLORES[i]} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <div className="flex justify-between text-etiqueta tabular-nums text-[var(--texto-suave)]"><span>J1</span><span>J{ultimaJornada}</span></div>
      <ol className="m-0 grid list-none grid-cols-1 gap-1 p-0 sm:grid-cols-2">
        {top.map((s, i) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-etiqueta">
            <span className="inline-flex min-w-0 items-center gap-1.5"><i className="h-2 w-2 flex-none rounded-full" style={{ background: COLORES[i] }} /><span className="truncate text-[var(--texto)]">{s.nombre}</span></span>
            <span className="flex-none tabular-nums font-semibold text-[var(--texto)]">{Math.round(s.elo)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
