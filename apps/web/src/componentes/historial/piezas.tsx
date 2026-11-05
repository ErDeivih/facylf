import Link from 'next/link';
import type { Route } from 'next';
import type { Signo } from '@facylf/dominio';
import { insigniaForma } from '@/lib/forma-equipo';
import { estiloForma } from '@/lib/pantalla-competicion';
import type { EstadoDeTemporada, Puesto } from '@/lib/historial-equipos';

/**
 * Piezas compartidas por los dos historiales (equipo y club).
 *
 * La racha se pinta en V-E-D (la traducción vive en `lib/forma-equipo`), con la letra **y** la palabra:
 * el color no es la única señal. Las etiquetas de estado y de movimiento usan los tokens semánticos del
 * sistema de diseño; ninguna escribe un color literal.
 */

/** Tira de resultados: V/E/D con su palabra en el `title` y en el nombre accesible. */
export function RachaDeSignos({ racha, vacio = 'Sin datos' }: { racha: readonly Signo[]; vacio?: string }) {
  if (racha.length === 0) {
    return <span className="text-nota text-[var(--texto-suave)]">{vacio}</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {racha.map((signo, indice) => {
        const { letra, etiqueta } = insigniaForma(signo);
        return (
          <span key={`${signo}-${indice}`} role="img" aria-label={etiqueta} title={etiqueta}
            className="flex size-6 items-center justify-center rounded-[6px] text-[11px] font-bold"
            style={estiloForma(signo)}>
            {letra}
          </span>
        );
      })}
    </span>
  );
}

const TONO = {
  neutro: 'bg-[var(--fondo-sutil)] text-[var(--texto-suave)]',
  enJuego: 'bg-[var(--accion-suave)] text-[var(--texto)]',
  final: 'bg-[var(--fondo-sutil)] text-[var(--texto-suave)]',
} as const;

/** Etiqueta corta de estado o de contexto. Nunca sólo color: siempre lleva texto. */
export function Etiqueta({ children, tono = 'neutro' }: { children: React.ReactNode; tono?: keyof typeof TONO }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-etiqueta font-semibold uppercase tracking-[0.04em] ${TONO[tono]}`}>
      {children}
    </span>
  );
}

/** La etiqueta del estado de una temporada. */
export function EtiquetaDeTemporada({ estado }: { estado: EstadoDeTemporada }) {
  if (estado === 'en-juego') return <Etiqueta tono="enJuego">En juego</Etiqueta>;
  if (estado === 'final') return <Etiqueta tono="final">Final</Etiqueta>;
  return <Etiqueta>Sin datos</Etiqueta>;
}

/**
 * El puesto, sin adornos: número y, si se calculó con los resultados, una daga con su explicación en
 * el `title`. El «de N equipos» lo pone cada pantalla donde cabe.
 */
export function PuestoTexto({ puesto }: { puesto: Puesto | null }) {
  if (puesto === null) return <span className="text-nota text-[var(--texto-suave)]">Sin datos</span>;
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-dato font-extrabold tabular-nums text-[var(--texto)]">{puesto.posicion}.º</span>
      {puesto.origen === 'calculada' && (
        <span title="Puesto calculado con los resultados publicados" className="text-nota text-[var(--texto-suave)]">†</span>
      )}
    </span>
  );
}

/** Un enlace de acción al pie de una tarjeta. */
export function EnlaceDeTarjeta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href as Route} className="font-semibold text-[var(--accion)] hover:underline">
      {children}
    </Link>
  );
}

/** Un dato con su etiqueta, para las rejillas de la tarjeta de temporada. */
export function Dato({ etiqueta, children, nota }: { etiqueta: string; children: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-etiqueta font-semibold uppercase tracking-[0.05em] text-[var(--texto-suave)]">{etiqueta}</dt>
      <dd className="m-0 flex min-w-0 flex-col gap-0.5">{children}</dd>
      {nota !== undefined && <dd className="m-0 text-nota leading-5 text-[var(--texto-suave)]">{nota}</dd>}
    </div>
  );
}
