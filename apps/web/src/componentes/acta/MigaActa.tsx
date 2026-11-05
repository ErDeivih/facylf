import Link from 'next/link';
import type { Route } from 'next';
import type { FilaActaCanonica } from '@/consultas/partidos';
import { etiquetaCategoria, etiquetaDivision } from '@/lib/vocabulario-pantalla';

/**
 * Miga de la pantalla del acta: federación › categoría › competición/grupo › jornada › acta.
 *
 * Cada tramo enlaza a una pantalla que ya existe; el acta es el tramo actual y va sin enlace, marcada
 * con `aria-current="page"`. La jornada se enlaza a su detalle, que es de donde se llega al acta.
 */
export function MigaActa({ acta }: { acta: FilaCanonicaParaMiga }) {
  const division = acta.division !== 'desconocida' ? etiquetaDivision(acta.division) : acta.edicion;
  return (
    <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
      <Link className="hover:underline" href={`/federaciones?federacion=${acta.federacion}` as Route}>
        {acta.federacion_nombre}
      </Link>
      <span aria-hidden="true">›</span>
      <span>{etiquetaCategoria(acta.categoria)}</span>
      <span aria-hidden="true">›</span>
      <span>{division}</span>
      <span aria-hidden="true">›</span>
      <Link className="hover:underline" href={`/explorar/competicion/${acta.grupo_id}` as Route}>
        {acta.grupo}
      </Link>
      <span aria-hidden="true">›</span>
      <Link className="hover:underline"
        href={`/explorar/competicion/${acta.grupo_id}/jornada/${acta.jornada}` as Route}>
        Jornada {acta.jornada}
      </Link>
      <span aria-hidden="true">›</span>
      <span className="text-[var(--texto)]" aria-current="page">Acta</span>
    </nav>
  );
}

/** Lo que la miga necesita del acta; así no arrastra el tipo entero de la consulta. */
export type FilaCanonicaParaMiga = Pick<
  FilaActaCanonica,
  'federacion' | 'federacion_nombre' | 'categoria' | 'division' | 'edicion' | 'grupo' | 'grupo_id' | 'jornada'
>;
