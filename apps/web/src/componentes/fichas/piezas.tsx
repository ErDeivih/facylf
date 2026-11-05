import Link from 'next/link';
import type { Route } from 'next';

/**
 * Piezas compartidas por las tres fichas.
 *
 * `Migas` repite la ruta del prototipo («Club › Equipo») con enlaces sólo a pantallas que existen: el
 * último tramo es el actual y no enlaza, porque un enlace a la página en la que ya estás promete algo
 * que no pasa. `AvisoSinArchivo` es el estado en que no se puede leer el archivo: dice qué pasa sin
 * contar cómo está hecha la web (DOCTRINA-CALIDAD §8).
 */

export function Migas({ tramos }: { tramos: readonly { texto: string; href?: string }[] }) {
  return (
    <nav aria-label="Ruta" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-tabla text-[var(--texto-suave)]">
      {tramos.map((tramo, i) => (
        <span key={`${tramo.texto}-${i}`} className="flex items-center gap-x-2">
          {i > 0 && <span aria-hidden="true" className="text-[var(--texto-suave)]">›</span>}
          {tramo.href
            ? <Link href={tramo.href as Route} className="hover:text-[var(--accion)] hover:underline">{tramo.texto}</Link>
            : <span aria-current="page" className="text-[var(--texto)]">{tramo.texto}</span>}
        </span>
      ))}
    </nav>
  );
}

/** No se puede leer el archivo ahora mismo. Sin nombres de tablas, rutas ni comandos. */
export function AvisoSinArchivo({ titulo }: { titulo: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">{titulo}</h1>
      <div className="border-l-4 border-[var(--amarilla)] bg-[var(--fondo-elevado)] p-4 text-tabla text-[var(--texto)]">
        <b className="block">Ahora mismo no se pueden cargar estos datos.</b>
        <p className="mt-1 text-[var(--texto-suave)]">
          Vuelve a intentarlo dentro de un momento. Mientras tanto no se enseñan cifras: un hueco se lee
          mejor que un cero que parece un dato.
        </p>
        <p className="mt-3">
          <Link href={'/explorar/competicion/3769' as Route} className="boton-secundario">Volver a la competición</Link>
        </p>
      </div>
    </div>
  );
}
