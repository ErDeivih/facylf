import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata, Route } from 'next';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import {
  GRUPOS_DEL_SELECTOR, OPCIONES_DEL_SELECTOR,
  type FilaGrupoSelector, type FilaOpcionSelector,
} from '@/consultas/catalogo-selector';
import { SinCanonico } from '@/componentes/SinCanonico';
import { FiltrosSelector } from '@/componentes/catalogo/FiltrosSelector';
import { ListaGrupos } from '@/componentes/catalogo/ListaGrupos';
import { EsqueletoLista, SinGrupos, SinMasGrupos } from '@/componentes/catalogo/EstadosSelector';
import { Paginacion } from '@/componentes/catalogo/Paginacion';
import { Button } from '@/componentes/ui';
import { NOMBRE_PRODUCTO } from '@/componentes/marca/marca';
import {
  TAMANO_PAGINA_SELECTOR, chipsDeFiltros, leeFiltrosSelector, opcionesDeSelector,
  type EstadoSelector, type OpcionesSelector, urlDeSelector,
} from '@/lib/selector-competiciones';

/**
 * Selector de temporada y competición (WALL objetivo 4).
 *
 * Se puede pedir una competición por su nombre, su grupo o su temporada —también una temporada
 * histórica— y se obtiene el grupo real con su cobertura y el enlace a su ficha. Ejemplo: «Segunda
 * Juvenil 2017, Burgos» encuentra la «2ª División Provincial de Juveniles · Primera - Burgos» de
 * Castilla y León en 2016-17.
 *
 * Lo que la pantalla **no** hace:
 *  · no inventa una competición ni una temporada que el catálogo no tenga: si no está, se dice y se
 *    ofrecen las temporadas que sí tienen datos;
 *  · no convierte lo no medido en cero: la cobertura de un grupo sin medir se lee «Cobertura sin
 *    medir»;
 *  · no explica cómo se calcula nada. El estado vive en la URL (`fed`, `temp`, `cat`, `mod`, `gen`,
 *    `prov`, `nivel`, `q`, `offset`) y los filtros son un formulario GET normal.
 */
export const metadata: Metadata = { title: `Competiciones — ${NOMBRE_PRODUCTO}` };
export const dynamic = 'force-dynamic';

type Parametros = Record<string, string | string[] | undefined>;

export default async function PantallaSelectorCompeticiones({ searchParams }: {
  searchParams: Promise<Parametros>;
}) {
  const parametros = await searchParams;

  let opciones: OpcionesSelector = opcionesDeSelector([]);
  try {
    const filas = await consulta<FilaOpcionSelector>(
      OPCIONES_DEL_SELECTOR.sql, [], { presupuestoMs: OPCIONES_DEL_SELECTOR.presupuestoMs });
    opciones = opcionesDeSelector(filas);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Competiciones" motivo={error.message} />;
    }
    throw error;
  }

  const estado = leeFiltrosSelector(parametros, opciones.temporadas.map((t) => t.valor));
  const chips = chipsDeFiltros(estado, opciones);

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
        <Link className="hover:underline" href={'/' as Route}>Inicio</Link>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--texto)]" aria-current="page">Competiciones</span>
      </nav>

      <h1 className="m-0 text-titulo font-bold tracking-[-0.02em] text-[var(--texto)]">Competiciones</h1>

      <FiltrosSelector estado={estado} opciones={opciones} />

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtros activos">
          {chips.map((chip) => (
            <Button key={chip.clave} asChild variant="secondary" size="sm">
              <Link href={chip.url as Route} aria-label={chip.aria}>
                {chip.texto} <span aria-hidden="true">×</span>
              </Link>
            </Button>
          ))}
        </div>
      )}

      <Suspense fallback={<EsqueletoLista filas={6} />}>
        <Contenido estado={estado} opciones={opciones} />
      </Suspense>
    </div>
  );
}

/** La lista de grupos. Una sola consulta: como mucho una página, aunque el catálogo tenga 40.000 grupos. */
async function Contenido({ estado, opciones }: { estado: EstadoSelector; opciones: OpcionesSelector }) {
  let filas: FilaGrupoSelector[] = [];
  try {
    filas = await consulta<FilaGrupoSelector>(GRUPOS_DEL_SELECTOR.sql, [
      estado.filtros.federacion,
      estado.filtros.temporada,
      estado.filtros.categoria,
      estado.filtros.modalidad,
      estado.filtros.genero,
      estado.filtros.provincias,
      estado.filtros.nivel,
      estado.interpretacion.tokens,
      TAMANO_PAGINA_SELECTOR,
      estado.filtros.desplazamiento,
    ], { presupuestoMs: GRUPOS_DEL_SELECTOR.presupuestoMs });
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Competiciones" motivo={error.message} />;
    }
    throw error;
  }

  if (filas.length === 0) {
    return estado.filtros.desplazamiento > 0
      ? <SinMasGrupos estado={estado} />
      : <SinGrupos estado={estado} opciones={opciones} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <ListaGrupos filas={filas} />
      <Paginacion estado={estado} total={filas[0]?.total ?? 0} />
    </div>
  );
}
