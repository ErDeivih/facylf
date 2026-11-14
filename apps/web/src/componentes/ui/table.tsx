import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Tabla (shadcn) con la regla del proyecto: **el documento no se desplaza en horizontal**,
 * se desplaza su contenedor, que recibe el foco para poder recorrerse con el teclado y un
 * nombre accesible. La primera columna se puede fijar (`columnaFija`) para no perder el
 * nombre de la fila al desplazar las cifras.
 *
 * Se mantiene `data-tabla-scroll`: el QA y las pruebas comprueban que la tabla ancha está
 * dentro de un contenedor desplazable y no rompe el ancho de la página.
 */
export function Table({
  className,
  classNameContenedor,
  etiquetaDesplazamiento = 'Tabla: desplázate en horizontal para ver todas las columnas',
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & {
  etiquetaDesplazamiento?: string;
  /** Clases del contenedor desplazable (p. ej. `max-h-[70dvh]` para una tabla larga con cabecera fija). */
  classNameContenedor?: string;
}) {
  return (
    <div
      data-tabla-scroll=""
      tabIndex={0}
      role="region"
      aria-label={etiquetaDesplazamiento}
      className={cn(
        'relative w-full overflow-x-auto rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foco)] focus-visible:ring-inset',
        classNameContenedor,
      )}
    >
      <table className={cn('w-full caption-bottom border-separate border-spacing-0 text-tabla', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-[var(--borde)]', className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableFooter({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={cn('border-t border-[var(--borde)] bg-[var(--fondo-sutil)] font-semibold', className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-[var(--fondo-sutil)] transition-colors duration-100 hover:bg-[var(--fondo-sutil)] data-[estado=ko]:bg-[var(--fondo-sutil)]',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Cabecera de columna. `pegajosa` la deja fija arriba al desplazar la tabla en vertical
 * (panel de calidad). `fija` la pega a la izquierda para que el nombre no se vaya.
 */
export function TableHead({
  className,
  pegajosa = false,
  fija = false,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { pegajosa?: boolean; fija?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-2 py-2.5 text-left align-middle text-etiqueta font-semibold text-[var(--texto-suave)]',
        pegajosa && 'sticky top-0 z-[var(--capa-pegajoso)] bg-[var(--fondo-elevado)] shadow-[inset_0_-1px_0_var(--borde)]',
        fija && 'left-0 z-[calc(var(--capa-pegajoso)+1)] bg-[var(--fondo-elevado)]',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  fija = false,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { fija?: boolean }) {
  return (
    <td
      className={cn(
        'px-2 py-2.5 align-middle',
        fija && 'sticky left-0 z-[var(--capa-pegajoso)] bg-[var(--fondo-elevado)]',
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={cn('sr-only', className)} {...props} />;
}
