import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Route } from 'next';

import { GRUPO_POR_ID, SIN_ACTA_DEL_GRUPO } from '@/consultas/competiciones';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';

/** Los partidos del grupo con resultado pero sin acta enlazada, con la regla de elegibilidad a la vista. */
const grupoDe = cache(async (id: string) => consulta(GRUPO_POR_ID.sql, [Number(id)]));

export default async function PantallaSinActa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) notFound();

  try {
    const [grupo, filas] = await Promise.all([
      grupoDe(id),
      consulta(SIN_ACTA_DEL_GRUPO.sql, [numero], { presupuestoMs: SIN_ACTA_DEL_GRUPO.presupuestoMs }),
    ]);
    const g = grupo[0];
    if (!g) notFound();

    return (
      <div className="flex flex-col gap-[18px]">
        <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
          <Link className="hover:underline" href={'/' as Route}>Inicio</Link>
          <span aria-hidden="true">›</span>
          <Link className="hover:underline" href={`/explorar/competicion/${numero}` as Route}>{g.edicion} · {g.grupo}</Link>
          <span aria-hidden="true">›</span>
          <span className="text-[var(--texto)]" aria-current="page">Partidos sin acta</span>
        </nav>

        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Partidos sin acta</h1>

        <section aria-label="Regla de elegibilidad"
          className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3">
          <h2 className="m-0 text-etiqueta font-semibold text-[var(--texto-suave)]">Regla de elegibilidad</h2>
          <p className="m-0 mt-1 text-nota text-[var(--texto)]">
            Se cuenta como pendiente un partido <strong>con resultado publicado</strong> cuyo <strong>acta aún no está
            enlazada</strong>. Un partido sin resultado no es un pendiente de acta: es un partido que todavía no se ha
            jugado (o no se ha publicado su marcador) y no se le busca acta.
          </p>
        </section>

        <section aria-label="Lista de partidos sin acta"
          className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">Pendientes</h2>
            <span className="text-nota text-[var(--texto-suave)]">{filas.length} partido(s)</span>
          </div>
          <div data-tabla-scroll tabIndex={0} role="region" aria-label="Partidos sin acta: desplázate en horizontal"
            className="relative overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-tabla">
              <thead>
                <tr className="text-right text-etiqueta text-[var(--texto-suave)]">
                  <th scope="col" className="py-2 pl-4 pr-1.5 text-left font-semibold">J</th>
                  <th scope="col" className="px-1.5 py-2 text-left font-semibold">Partido</th>
                  <th scope="col" className="px-1.5 py-2 font-semibold">Marcador</th>
                  <th scope="col" className="py-2 pl-1.5 pr-4 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.match_id} className="text-right">
                    <td className="border-t border-[var(--fondo-sutil)] py-1.5 pl-4 pr-1.5 text-left text-[var(--texto-suave)]">{f.jornada}</td>
                    <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-left text-[var(--texto)]">{f.local} – {f.visitante}</td>
                    <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-[var(--texto)]">{f.goles_local}-{f.goles_visitante}</td>
                    <td className="border-t border-[var(--fondo-sutil)] py-1.5 pl-1.5 pr-4 text-[var(--texto-suave)]">{f.fecha ?? 'sin fecha'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filas.length === 0 && <p className="m-0 px-4 pb-4 text-cuerpo text-[var(--texto-suave)]">No hay partidos con resultado sin acta en este grupo.</p>}
        </section>
      </div>
    );
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <p className="p-4 text-cuerpo text-[var(--texto)]">El canónico no está disponible ahora mismo.</p>;
    }
    throw error;
  }
}
