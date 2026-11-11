/**
 * Último resultado y próximo partido del grupo, arriba de la ficha.
 *
 * El criterio FP-I1 pide que a 390×844 se vean los dos partidos sin desplazar: por eso este bloque va antes que el
 * panel de calidad y la tabla, y cada tarjeta es compacta (una línea de marcador y otra de fecha/equipos).
 */
import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPartidoCanonico } from '@/consultas/partidos';
import { rutaDeActa, tieneActa } from '@/lib/acta';

const fecha = (p: FilaPartidoCanonico) => {
  const jugado = p.fecha ? new Date(p.fecha) : null;
  const prevista = p.fecha_prevista ?? null;
  if (jugado && !Number.isNaN(jugado.getTime())) {
    return `${String(jugado.getDate()).padStart(2, '0')}/${String(jugado.getMonth() + 1).padStart(2, '0')}`;
  }
  if (prevista) {
    const d = new Date(prevista);
    if (!Number.isNaN(d.getTime())) return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return null;
};

/** El último partido con resultado y el primero sin resultado (el próximo), del grupo. */
export function ultimoYProximo(partidos: readonly FilaPartidoCanonico[]): {
  ultimo: FilaPartidoCanonico | null; proximo: FilaPartidoCanonico | null;
} {
  const conResultado = partidos.filter((p) => p.goles_local !== null && p.goles_visitante !== null)
    .sort((a, b) => (a.jornada - b.jornada));
  const sinResultado = partidos.filter((p) => p.goles_local === null || p.goles_visitante === null)
    .sort((a, b) => (a.jornada - b.jornada));
  const ultimo = conResultado.at(-1) ?? null;
  // «Próximo» es el primer partido sin resultado DESPUÉS de la última jornada jugada; si no hay, el primero de
  // todos (un aplazado viejo), para no enseñar como próximo un partido de una jornada ya pasada.
  const proximo = (ultimo === null ? null : sinResultado.find((p) => p.jornada >= ultimo.jornada))
    ?? sinResultado[0] ?? null;
  return { ultimo, proximo };
}

export function UltimoYProximo({ partidos }: { partidos: readonly FilaPartidoCanonico[] }) {
  const { ultimo, proximo } = ultimoYProximo(partidos);
  if (!ultimo && !proximo) return null;
  const tarjeta = (p: FilaPartidoCanonico, titulo: string) => {
    const acta = tieneActa(p.calidad_acta) ? rutaDeActa(p.match_id) : null;
    const contenido = (
      <>
        <span className="block text-etiqueta font-semibold uppercase tracking-[0.05em] text-[var(--texto-suave)]">{titulo}</span>
        <span className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-tabla text-[var(--texto)]">{p.local} – {p.visitante}</span>
          <span className="flex-none text-cuerpo font-extrabold text-[var(--texto)]">
            {p.goles_local !== null && p.goles_visitante !== null ? `${p.goles_local}-${p.goles_visitante}` : '—'}
          </span>
        </span>
        <span className="mt-0.5 block text-nota text-[var(--texto-suave)]">
          {fecha(p) ?? 'fecha sin publicar'} · J{p.jornada}
        </span>
      </>
    );
    const clase = 'block rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-3 py-2';
    return acta
      ? <Link href={acta as Route} className={`${clase} hover:bg-[var(--fondo-sutil)]`}>{contenido}</Link>
      : <div className={clase}>{contenido}</div>;
  };
  return (
    <div className="flex basis-full flex-wrap gap-2">
      {ultimo && <div className="min-w-0 flex-[1_1_200px]">{tarjeta(ultimo, 'Último resultado')}</div>}
      {proximo && <div className="min-w-0 flex-[1_1_200px]">{tarjeta(proximo, 'Próximo partido')}</div>}
    </div>
  );
}
