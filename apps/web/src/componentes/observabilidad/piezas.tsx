import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { TARJETA } from '@/componentes/estadisticas/controles';
/**
 * Piezas compartidas de las pantallas «Datos», «Salud» y «Estados».
 *
 * Tres reglas del sistema de diseño que se aplican aquí:
 *  · el estado se lee con **palabra** además de color (`Grave`, `Aviso`, `Info`, `Ok`);
 *  · la jerarquía se hace con borde y fondo, no con sombra;
 *  · un estado vacío dice qué pasa y qué hacer, y no se rellena con texto de presentación.
 */

/** Cabecera de una pantalla de plataforma: título, qué es y un dato de contexto. */
export function CabeceraPantalla({ titulo, entradilla, meta }: {
  titulo: string;
  entradilla?: string;
  /** Línea corta con la fecha de la última comprobación, el recuento de casos… */
  meta?: string;
}) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">{titulo}</h1>
        {entradilla && <p className="m-0 mt-1 max-w-[70ch] text-tabla text-[var(--texto-suave)]">{entradilla}</p>}
      </div>
      {meta && <p className="m-0 text-nota text-[var(--texto-suave)]">{meta}</p>}
    </header>
  );
}

const ESTILO_SEVERIDAD: Record<string, { palabra: string; punto: string; caja: string }> = {
  grave: { palabra: 'Grave', punto: 'var(--roja)', caja: 'bg-[var(--fondo-elevado)]' },
  aviso: { palabra: 'Aviso', punto: 'var(--amarilla)', caja: 'bg-[var(--fondo-elevado)]' },
  info: { palabra: 'Info', punto: 'var(--texto-tenue)', caja: 'bg-[var(--fondo-sutil)]' },
  ok: { palabra: 'Ok', punto: 'var(--victoria)', caja: 'bg-[var(--fondo-elevado)]' },
};

/**
 * Chip de estado. Lleva **palabra** («Grave», «Aviso»…) y un punto de color: el color refuerza, no
 * informa por sí solo. Lo desconocido se lee como «Info», nunca se disfraza de correcto.
 */
export function ChipSeveridad({ estado }: { estado: string }) {
  const clave = estado === 'fallo' ? 'grave' : estado === 'aviso' ? 'aviso' : estado === 'ok' ? 'ok' : 'info';
  const estilo = ESTILO_SEVERIDAD[clave]!;
  return (
    <span className={`inline-flex flex-none items-center gap-1.5 rounded-full border border-[var(--borde)] px-2 py-0.5 text-etiqueta font-semibold text-[var(--texto)] ${estilo.caja}`}>
      <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ backgroundColor: estilo.punto }} />
      {estilo.palabra}
    </span>
  );
}

/** Sección con título y borde: la misma caja en las tres pantallas. */
export function Seccion({ id, titulo, entradilla, children, acciones }: {
  id: string;
  titulo: string;
  entradilla?: string;
  children: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={TARJETA}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3.5">
        <div className="min-w-0">
          <h2 id={id} className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
          {entradilla && <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">{entradilla}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}

/**
 * Tarjeta de un estado vacío: el mismo aspecto que el estado vacío real de la aplicación (borde
 * discontinuo, frase y una acción), con un chip que dice en qué caso aparece.
 */
export function TarjetaDeEstado({ chip, titulo, motivo, href, textoEnlace }: {
  chip: string;
  titulo: string;
  motivo: string;
  href?: string;
  textoEnlace?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4">
      <h3 className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h3>
      <div role="status" className="flex flex-col gap-2 border border-dashed border-[var(--borde-fuerte)] p-3.5">
        <span className="self-start rounded-full bg-[var(--fondo-sutil)] px-2.5 py-0.5 text-etiqueta font-semibold text-[var(--texto)]">
          {chip}
        </span>
        <p className="m-0 text-tabla leading-relaxed text-[var(--texto)]">{motivo}</p>
        {href && (
          <Link href={href as Route} className="self-start text-tabla font-semibold text-[var(--accion)] hover:underline">
            {textoEnlace ?? 'Ver el ejemplo real'}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Una columna de la tabla de plataforma: siempre con su `render`, que es quien decide el contenido. */
export type ColumnaDeTabla<F> = {
  titulo: string;
  /** `numero` alinea a la derecha y aplica `tabular-nums`. */
  tipo?: 'texto' | 'numero';
  render: (fila: F) => ReactNode;
};

/**
 * Tabla con scroll dentro de su caja y **región enfocable**.
 *
 * A 360 px una tabla de seis columnas no cabe y se desplaza dentro de su contenedor (DESIGN.md: el
 * documento no se desplaza, la tabla sí). Ese contenedor tiene que poder recibir el foco por teclado, o
 * quien navega con teclado no puede llegar a las columnas de la derecha: axe lo marca como grave
 * (`scrollable-region-focusable`). Por eso lleva `tabIndex={0}`, `role="region"` y un nombre accesible.
 * La primera columna queda fija, que es la identidad de la fila.
 */
export function TablaResponsiva<F>({ filas, columnas, caption, clave }: {
  filas: readonly F[];
  columnas: readonly ColumnaDeTabla<F>[];
  caption: string;
  clave: (fila: F) => string | number;
}) {
  const fija = 'sticky left-0 z-[var(--capa-pegajoso)] bg-[var(--fondo-elevado)]';
  return (
    <div tabIndex={0} role="region" aria-label={caption}
      className="relative overflow-x-auto focus-visible:[outline-offset:-2px]">
      <table className="w-full min-w-[620px] border-separate border-spacing-0 text-tabla">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-right text-etiqueta uppercase tracking-[0.05em] text-[var(--texto-suave)]">
            {columnas.map((columna, indice) => (
              <th key={columna.titulo} scope="col"
                className={[
                  'whitespace-nowrap px-2 py-2 font-semibold',
                  indice === 0 ? `${fija} text-left` : '',
                  columna.tipo === 'numero' ? 'text-right' : 'text-left',
                ].join(' ')}>
                {columna.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={clave(fila)} className="text-right">
              {columnas.map((columna, indice) => (
                <td key={columna.titulo}
                  className={[
                    'border-t border-[var(--fondo-sutil)] px-2 py-2',
                    indice === 0 ? `${fija} text-left` : '',
                    columna.tipo === 'numero' ? 'text-right tabular-nums' : 'text-left',
                  ].join(' ')}>
                  {columna.render(fila)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
