import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata, Route } from 'next';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import {
  OPCIONES_DEL_CALENDARIO, PARTIDOS_DEL_CALENDARIO,
  type FilaCalendarioGlobal, type FilaOpcionesCalendario,
} from '@/consultas/calendario';
import { SinCanonico } from '@/componentes/SinCanonico';
import { CalendarioGlobal } from '@/componentes/calendario/CalendarioGlobal';
import { EsqueletoCalendario, SinPartidos } from '@/componentes/calendario/EstadosCalendario';
import { FiltrosCalendarioGlobal } from '@/componentes/calendario/FiltrosCalendarioGlobal';
import {
  RUTA_CALENDARIO_GLOBAL, TAMANO_PAGINA_CALENDARIO, TITULO_DE_CALENDARIO, leeFiltrosCalendarioGlobal,
  rutaDeActaDePartido, tieneFiltrosGlobales, urlDeCalendarioGlobal,
} from '@/lib/calendario';
import type { FiltrosCalendarioGlobal as FiltrosGlobales } from '@/lib/calendario';

/**
 * Calendario global: los partidos de todas las competiciones, agrupados por fecha.
 *
 * El estado vive en la URL (`fed`, `temp`, `j`, `desde`, `hasta`, `q`, `p`), así que un calendario
 * filtrado se puede compartir y recargar. La temporada va puesta por defecto (la más reciente
 * publicada): sin temporada el conjunto de partidos crece demasiado y el plan de la consulta deja de
 * estar acotado.
 *
 * La lista se pagina de 60 en 60 y **no se promete un total**: se traen 61 filas (una más que la
 * página) para saber si hay más y no se cuenta el conjunto entero, que es lo que la regla de rapidez
 * prohíbe. Si el filtro no devuelve nada, se dice; no se pinta una lista vacía.
 */
export const metadata: Metadata = { title: TITULO_DE_CALENDARIO };

export default async function PantallaCalendarioGlobal({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filtros = leeFiltrosCalendarioGlobal(await searchParams);

  let opciones: FilaOpcionesCalendario = { federaciones: null, temporadas: null };
  try {
    const [fila] = await consulta<FilaOpcionesCalendario>(OPCIONES_DEL_CALENDARIO.sql, [], {
      presupuestoMs: OPCIONES_DEL_CALENDARIO.presupuestoMs,
    });
    opciones = fila ?? opciones;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Calendario" motivo={error.message} />;
    }
    throw error;
  }

  const temporadaPorDefecto = opciones.temporadas?.[0]?.etiqueta ?? null;
  const temporada = filtros.temporada ?? temporadaPorDefecto;

  return (
    <div className="flex flex-col gap-[18px]">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
        <Link className="hover:underline" href={'/' as Route}>Inicio</Link>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--texto)]" aria-current="page">Calendario</span>
      </nav>
      <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Calendario</h1>
      <FiltrosCalendarioGlobal
        filtros={{ ...filtros, temporada }}
        opciones={opciones}
        temporada={temporada}
        temporadaPorDefecto={temporadaPorDefecto}
      />
      {temporada === null
        ? <SinPartidos>No hay temporadas publicadas.</SinPartidos>
        : (
          <Suspense fallback={<EsqueletoCalendario filas={8} />}>
            <Contenido filtros={{ ...filtros, temporada }} />
          </Suspense>
        )}
    </div>
  );
}

/** La lista. Una sola consulta: 61 filas como mucho, aunque el canónico tenga millones de partidos. */
async function Contenido({ filtros }: { filtros: FiltrosGlobales }) {
  let filas: FilaCalendarioGlobal[] = [];
  try {
    filas = await consulta<FilaCalendarioGlobal>(PARTIDOS_DEL_CALENDARIO.sql, [
      filtros.federacion,
      filtros.temporada,
      filtros.jornada,
      filtros.desde,
      filtros.hasta,
      filtros.texto,
      TAMANO_PAGINA_CALENDARIO + 1,
      filtros.desplazamiento,
    ], { presupuestoMs: PARTIDOS_DEL_CALENDARIO.presupuestoMs });
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Calendario" motivo={error.message} />;
    }
    throw error;
  }

  const hayMas = filas.length > TAMANO_PAGINA_CALENDARIO;
  const visibles = filas.slice(0, TAMANO_PAGINA_CALENDARIO);
  if (visibles.length === 0) {
    return (
      <SinPartidos>
        {tieneFiltrosGlobales(filtros)
          ? (
            <>
              No hay partidos con estos filtros.{' '}
              <Link href={RUTA_CALENDARIO_GLOBAL as Route} className="font-semibold text-[var(--accion)] hover:underline">
                Quitar los filtros
              </Link>
            </>
          )
          : 'No hay partidos publicados.'}
      </SinPartidos>
    );
  }

  const desde = filtros.desplazamiento + 1;
  const hasta = filtros.desplazamiento + visibles.length;
  return (
    <CalendarioGlobal
      partidos={visibles}
      desde={desde}
      hasta={hasta}
      hayMas={hayMas}
      urlAnterior={filtros.desplazamiento > 0
        ? urlDeCalendarioGlobal(filtros, { desplazamiento: Math.max(0, filtros.desplazamiento - TAMANO_PAGINA_CALENDARIO) })
        : null}
      urlSiguiente={hayMas
        ? urlDeCalendarioGlobal(filtros, { desplazamiento: filtros.desplazamiento + TAMANO_PAGINA_CALENDARIO })
        : null}
      hrefCompeticion={(p) => (p.grupo_id ? `/explorar/competicion/${p.grupo_id}` : null)}
      hrefJornada={(p) => (p.grupo_id && p.jornada !== null ? `/explorar/competicion/${p.grupo_id}/jornada/${p.jornada}` : null)}
      hrefActa={(p) => (p.calidad_acta !== null ? rutaDeActaDePartido(p.partido_id) : null)}
    />
  );
}
