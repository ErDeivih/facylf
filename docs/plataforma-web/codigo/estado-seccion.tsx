/**
 * TARJETA DE ESTADO de una sección (0044, ESTADOS-VACIOS.md). Va a apps/web/src/components/EstadoSeccion.tsx.
 *
 * Uso en la página de competición (componente de servidor):
 *   const estados = porSeccion(await consultaCacheada(ESTADO_SECCIONES, [edicion, grupo]));
 *   <Seccion titulo="Clasificación" estado={estados.clasificacion} acciones={{ federacion }}>
 *     <TablaClasificacion … />          ← sólo se pide y se pinta si el estado es 'ok'
 *   </Seccion>
 * Se cachea con la etiqueta `grupo:<id>` / `edicion:<id>` (cache.ts): cambia cuando el proyector toca el grupo.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { FilaEstadoSeccion } from '@/consultas/federaciones';

export const porSeccion = (filas: FilaEstadoSeccion[]) =>
  Object.fromEntries(filas.map((f) => [f.seccion, f])) as Record<string, FilaEstadoSeccion | undefined>;

const ETIQUETA: Record<Exclude<FilaEstadoSeccion['estado'], 'ok'>, (f: FilaEstadoSeccion) => string> = {
  sin_datos: () => 'Sin calendario',
  pronto: (f) => (f.fecha ? `Empieza el ${f.fecha.slice(8, 10)}/${f.fecha.slice(5, 7)}` : 'Próximamente'),
  pendiente: () => 'Pendiente',
  no_publica: () => 'No publicado',
};

export function Seccion({ titulo, estado, acciones, children }: {
  titulo: string; estado: FilaEstadoSeccion | undefined;
  acciones?: { federacion?: string; avisame?: () => Promise<void> };
  children: ReactNode;
}) {
  // Sin fila (sección que la base no conoce) o 'ok': se pinta el contenido.
  if (!estado || estado.estado === 'ok') return <section aria-label={titulo}><h2>{titulo}</h2>{children}</section>;
  return (
    <section aria-label={titulo} className="seccion seccion--estado">
      <h2>{titulo}</h2>
      <div role="status" className="estado-seccion">
        <span className={`chip chip--${estado.estado}`}>{ETIQUETA[estado.estado](estado)}</span>
        <p>{estado.mensaje}</p>
        {estado.estado === 'no_publica' && acciones?.federacion && (
          <Link href={`/federacion/${acciones.federacion}#datos`}>Qué datos hay en esta federación</Link>
        )}
        {estado.estado === 'pronto' && acciones?.avisame && (
          <form action={acciones.avisame}><button type="submit">Avísame cuando empiece</button></form>
        )}
      </div>
    </section>
  );
}

/* CSS (globals.css) — tokens de GRAFICOS.md; el chip no usa verde/rojo/ámbar (reservados a resultados):
.estado-seccion { border: 1px dashed var(--borde); border-radius: 8px; padding: 16px; color: var(--texto-tenue); }
.estado-seccion p { margin: 8px 0 0; max-width: 60ch; }
.chip { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--superficie-2); color: var(--texto); }
.chip--no_publica { background: transparent; border: 1px solid var(--borde); }
*/
