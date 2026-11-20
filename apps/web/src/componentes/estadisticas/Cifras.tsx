import { TARJETA } from './controles';

/** Una cifra de cabecera con su etiqueta y, si hace falta, una nota de contexto. */
export type Cifra = { etiqueta: string; valor: string; nota?: string };

/**
 * Fila de cifras de un ámbito. El valor va grande y con `tabular-nums`; lo que no se sabe llega como
 * «—» desde la página, no como un cero.
 */
export function Cifras({ cifras }: { cifras: readonly Cifra[] }) {
  return (
    <section aria-label="Cifras" className={`${TARJETA} grid grid-cols-2 gap-2 px-4 py-3.5 lg:grid-cols-4`}>
      {cifras.map((cifra) => (
        <div key={cifra.etiqueta} className="rounded-[var(--radius-lg)] bg-[var(--fondo-sutil)] px-3 py-2.5">
          <p className="m-0 text-etiqueta text-[var(--texto-suave)]">{cifra.etiqueta}</p>
          <p className="m-0 mt-0.5 text-titulo font-extrabold tabular-nums text-[var(--texto)]">{cifra.valor}</p>
          {cifra.nota !== undefined && <p className="m-0 text-nota text-[var(--texto-suave)]">{cifra.nota}</p>}
        </div>
      ))}
    </section>
  );
}
