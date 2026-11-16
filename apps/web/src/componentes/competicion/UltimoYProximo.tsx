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

/** ¿La fecha publicada del partido es hoy o posterior? */
function esFechaFutura(p: FilaPartidoCanonico, hoy = new Date()): boolean {
  const texto = p.fecha_prevista ?? p.fecha;
  if (!texto) return false;
  const fecha = new Date(`${texto}T23:59:59`);
  return !Number.isNaN(fecha.getTime()) && fecha.getTime() >= hoy.getTime();
}

/** El último partido con resultado y el primero sin resultado. `esFuturo` dice si ese pendiente es
 *  realmente el próximo (fecha de hoy en adelante) o un aplazado viejo que no se debe anunciar como tal. */
export function ultimoYProximo(partidos: readonly FilaPartidoCanonico[]): {
  ultimo: FilaPartidoCanonico | null; proximo: FilaPartidoCanonico | null; esFuturo: boolean;
} {
  const conResultado = partidos.filter((p) => p.goles_local !== null && p.goles_visitante !== null)
    .sort((a, b) => (a.jornada - b.jornada));
  const sinResultado = partidos.filter((p) => p.goles_local === null || p.goles_visitante === null)
    .sort((a, b) => (a.jornada - b.jornada));
  const ultimo = conResultado.at(-1) ?? null;
  // «Próximo» es el primer partido sin resultado DESPUÉS de la última jornada jugada; si no hay, el primero
  // con fecha de hoy en adelante. Si tampoco, se enseña el aplazado más antiguo, pero etiquetado como
  // «Partido pendiente»: un 04/10 no es el próximo partido de nadie.
  const candidato = (ultimo === null ? null : sinResultado.find((p) => p.jornada >= ultimo.jornada))
    ?? sinResultado.find((p) => esFechaFutura(p))
    ?? sinResultado[0] ?? null;
  return { ultimo, proximo: candidato, esFuturo: candidato !== null && esFechaFutura(candidato) };
}

export function UltimoYProximo({ partidos }: { partidos: readonly FilaPartidoCanonico[] }) {
  const { ultimo, proximo, esFuturo } = ultimoYProximo(partidos);
  if (!ultimo && !proximo) return null;
  const tarjeta = (p: FilaPartidoCanonico, titulo: string) => {
    const acta = tieneActa(p.calidad_acta) ? rutaDeActa(p.match_id) : null;
    const contenido = (
      <>
        <span className="block text-nota font-semibold text-[var(--texto-suave)]">{titulo}</span>
        <span className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="min-w-0 break-words text-tabla text-[var(--texto)]">{p.local} – {p.visitante}</span>
          <span className="flex-none text-cuerpo font-bold text-[var(--texto)]">
            {p.goles_local !== null && p.goles_visitante !== null ? `${p.goles_local}-${p.goles_visitante}` : '—'}
          </span>
        </span>
        <span className="mt-0.5 block text-nota text-[var(--texto-suave)]">
          {fecha(p) ?? 'fecha sin publicar'} · J{p.jornada}
        </span>
      </>
    );
    const clase = 'block rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-3 py-2 transition-colors duration-150';
    return acta
      ? <Link href={acta as Route} className={`${clase} hover:bg-[var(--fondo-sutil)]`}>{contenido}</Link>
      : <div className={clase}>{contenido}</div>;
  };
  return (
    <div className="flex basis-full flex-wrap gap-2">
      {ultimo && <div className="min-w-0 flex-[1_1_200px]">{tarjeta(ultimo, 'Último resultado')}</div>}
      {proximo && <div className="min-w-0 flex-[1_1_200px]">{tarjeta(proximo, esFuturo ? 'Próximo partido' : 'Partido pendiente')}</div>}
    </div>
  );
}
