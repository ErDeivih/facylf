import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { ENLACE } from '@/componentes/estadisticas/controles';
import { rutaDeActa } from '@/lib/acta';
import { insigniaForma } from '@/lib/forma-equipo';
import { familiaDeRol, etiquetaFamilia } from '@/lib/oficiales';
import { estiloForma } from '@/lib/pantalla-competicion';

/**
 * Piezas pequeñas que comparten las tres fichas de oficiales.
 *
 * Todas cumplen las reglas del sistema de diseño que se rompen sin querer en una lista densa:
 * el resultado se lee con letra **y** color (nunca sólo color), los números que se comparan en vertical
 * llevan `tabular-nums`, un marcador ausente es un guion y no un 0-0, y el enlace al acta sólo existe
 * cuando el acta está publicada.
 */

/** Texto de una lista vacía: dice que no hay datos, no pinta una lista en blanco. */
export function TextoVacio({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
      {children}
    </p>
  );
}

/** El marcador desde el punto de vista del equipo de la persona. `null` = sin resultado publicado. */
export function Marcador({ propios, rival }: { propios: number | null; rival: number | null }) {
  if (propios === null || rival === null) {
    return <span className="text-[var(--texto-suave)]">sin resultado</span>;
  }
  return <span className="font-semibold tabular-nums text-[var(--texto)]">{propios} - {rival}</span>;
}

/** Enlace al acta del partido, sólo si el acta está publicada. */
export function EnlaceActa({ matchId }: { matchId: number }) {
  return (
    <Link href={rutaDeActa(matchId) as Route} className={ENLACE} aria-label={`Ver el acta del partido ${matchId}`}>
      Acta
    </Link>
  );
}

/**
 * Una insignia de resultado en **V-E-D** (Victoria/Empate/Derrota), decisión de David del 04/11/2026.
 * La letra visible sale de `lib/forma-equipo.ts` y la palabra va en el nombre accesible: no depende del
 * color. Un partido sin resultado no lleva insignia.
 */
export function InsigniaResultado({ resultado }: { resultado: string | null | undefined }) {
  if (resultado === null || resultado === undefined || resultado === 'sin_resultado') return null;
  const signo = resultado === 'ganado' ? 'G' : resultado === 'perdido' ? 'P' : 'E';
  const { letra, etiqueta } = insigniaForma(signo);
  return (
    <span role="img" aria-label={etiqueta} title={etiqueta}
      className="flex size-5 flex-none items-center justify-center rounded-[5px] text-etiqueta font-bold"
      style={estiloForma(signo)}>
      {letra}
    </span>
  );
}

/** Una racha de resultados en V-E-D, del más antiguo al más reciente, con la palabra accesible. */
export function InsigniasRacha({ signos }: { signos: ReadonlyArray<'G' | 'E' | 'P'> }) {
  if (signos.length === 0) {
    return <span className="text-nota text-[var(--texto-suave)]">Sin resultados</span>;
  }
  return (
    <span className="flex gap-[3px]">
      {signos.map((signo, i) => {
        const { letra, etiqueta } = insigniaForma(signo);
        return (
          <span key={`${letra}-${i}`} role="img" aria-label={etiqueta} title={etiqueta}
            className="flex size-5 items-center justify-center rounded-[5px] text-etiqueta font-bold"
            style={estiloForma(signo)}>
            {letra}
          </span>
        );
      })}
    </span>
  );
}

/** El rol del acta en palabras de la interfaz («DEL. Equipo» → «Delegado de equipo»). */
export function EtiquetaRol({ rol }: { rol: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--fondo-sutil)] px-2 py-0.5 text-etiqueta font-semibold text-[var(--texto-suave)]">
      {etiquetaFamilia(familiaDeRol(rol))}
    </span>
  );
}

/**
 * Chip de tarjeta: cuadrado de color, **letra** y número. La letra y la cifra van en el color de texto
 * del sistema (no sobre el color de la tarjeta) para que el contraste no dependa del amarillo ni del
 * rojo; el color es la señal de refuerzo, nunca la única.
 */
export function ChipTarjeta({ letra, cuantos, nombre }: { letra: 'A' | 'R' | 'P'; cuantos: number; nombre: string }) {
  const color = letra === 'A' ? 'var(--amarilla)' : letra === 'R' ? 'var(--roja)' : 'var(--texto-suave)';
  return (
    <span className="inline-flex items-center gap-1 text-nota text-[var(--texto-suave)]">
      <span aria-hidden="true" className="inline-block size-3 flex-none rounded-[3px]" style={{ backgroundColor: color }} />
      <span className="text-etiqueta font-semibold text-[var(--texto)]">{letra}</span>
      <span className="tabular-nums font-semibold text-[var(--texto)]">{cuantos}</span>
      <span className="sr-only">{nombre}</span>
    </span>
  );
}
