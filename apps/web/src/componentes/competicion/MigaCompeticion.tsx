import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPortadaGrupo } from '@/consultas/competiciones';
import { etiquetaCategoria, etiquetaDivision } from '@/lib/vocabulario-pantalla';

/**
 * Miga de pan de la competición, con un tramo extra para la pantalla que la usa.
 *
 * Reproduce la miga de la pantalla 2 (federación › categoría › división › grupo) y añade los tramos de
 * jornadas. Vive en su propio componente porque ahora la usan tres pantallas; la pantalla de competición
 * todavía la lleva escrita dentro de la página y se unificará cuando se toque esa pantalla.
 *
 * El último tramo sin enlace es la página actual y se marca con `aria-current="page"`: un enlace a la
 * página en la que ya estás promete que pasa algo al pulsarlo.
 */
export function MigaCompeticion({ grupo, tramos }: {
  grupo: FilaPortadaGrupo;
  tramos: readonly { texto: string; href?: string }[];
}) {
  return (
    <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
      <Link className="hover:underline" href={`/explorar/federacion/${grupo.federacion}` as Route}>
        {grupo.federacion_corta ?? grupo.federacion_nombre}
      </Link>
      <span aria-hidden="true">›</span>
      <span>{etiquetaCategoria(grupo.categoria)}</span>
      <span aria-hidden="true">›</span>
      <span>{grupo.division !== 'desconocida' ? etiquetaDivision(grupo.division) : grupo.edicion}</span>
      <span aria-hidden="true">›</span>
      <Link className="hover:underline" href={`/explorar/competicion/${grupo.grupo_id}` as Route}>
        {grupo.grupo}
      </Link>
      {tramos.map((tramo, i) => (
        <span key={`${tramo.texto}-${i}`} className="flex gap-2">
          <span aria-hidden="true">›</span>
          {tramo.href
            ? <Link className="hover:underline" href={tramo.href as Route}>{tramo.texto}</Link>
            : <span className="text-[var(--texto)]" aria-current="page">{tramo.texto}</span>}
        </span>
      ))}
    </nav>
  );
}
