import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata, Route } from 'next';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { OPCIONES_DE_ESTADISTICAS, type FilaOpcionesEstadisticas } from '@/consultas/estadisticas';
import { OJEO_JUGADORES, type FilaOjeo } from '@/consultas/ojeo';
import { CATEGORIAS_DEL_OJEO, type FilaCategoriaOjeo } from '@/consultas/rankings';
import { SinCanonico } from '@/componentes/SinCanonico';
import { FiltrosOjeo } from '@/componentes/ojeo/FiltrosOjeo';
import { TablaOjeo } from '@/componentes/ojeo/TablaOjeo';
import { EsqueletoTabla, SinResultados } from '@/componentes/listados/Estados';
import { TARJETA } from '@/componentes/listados/controles';
import { NOMBRE_PRODUCTO } from '@/componentes/marca/marca';
import { numero } from '@/lib/estadisticas';
import {
  FEDERACION_POR_DEFECTO, LIMITE_OJEO, RUTA_OJEO, avisoDeFiltro, etiquetasDeEdad,
  leeFiltrosOjeo, parametrosDeOjeo, temporadaPorDefecto, type FiltrosOjeo as FiltrosOjeoTipo,
} from '@/lib/rankings';

/**
 * Ojeo (WALL, pantallas restantes): perfiles de jugadores con datos reales del canónico.
 *
 * Por defecto Castilla y León, la temporada más reciente, sub-19 y al menos 270 minutos (el caso del
 * prototipo). Los filtros —federación, temporada, categoría, edad, minutos y posición— viven en la URL.
 * La tabla enlaza a la ficha del jugador y a su historial, y la competición de la fila.
 *
 * Reglas que se ven en pantalla:
 *  · **los nombres de menores se publican** (decisión del 05/11/2026): la pantalla pide los nombres a
 *    la consulta y no oculta a nadie;
 *  · los minutos no exactos se enseñan como cota inferior («≥») y lo ausente como «—»;
 *  · el buscador devuelve un máximo de 40 perfiles y el total está acotado: se dice, no se finge una
 *    lista infinita.
 */
export const metadata: Metadata = { title: `Ojeo — ${NOMBRE_PRODUCTO}` };
export const dynamic = 'force-dynamic';

type Parametros = Record<string, string | string[] | undefined>;

export default async function PantallaOjeo({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;

  let opciones: FilaOpcionesEstadisticas = { federaciones: null, temporadas: null };
  try {
    const [fila] = await consulta<FilaOpcionesEstadisticas>(OPCIONES_DE_ESTADISTICAS.sql, [],
      { presupuestoMs: OPCIONES_DE_ESTADISTICAS.presupuestoMs });
    opciones = fila ?? opciones;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Ojeo" motivo={error.message} />;
    }
    throw error;
  }

  const federaciones = opciones.federaciones ?? [];
  const temporadas = (opciones.temporadas ?? []).map((t) => t.etiqueta);
  const pedidos = leeFiltrosOjeo(parametros);
  const aviso = avisoDeFiltro(pedidos.federacion, pedidos.temporada, federaciones.map((f) => f.codigo), temporadas);

  const federacionDefecto = federaciones.some((f) => f.codigo === FEDERACION_POR_DEFECTO)
    ? FEDERACION_POR_DEFECTO
    : (federaciones[0]?.codigo ?? null);
  const temporadaDefecto = temporadaPorDefecto(temporadas, null);
  const federacion = pedidos.federacion !== null && federaciones.some((f) => f.codigo === pedidos.federacion)
    ? pedidos.federacion
    : federacionDefecto;
  const temporada = temporadaPorDefecto(temporadas, pedidos.temporada);

  let categorias: string[] = [];
  if (temporada !== null) {
    try {
      const filas = await consulta<FilaCategoriaOjeo>(CATEGORIAS_DEL_OJEO.sql, [temporada],
        { presupuestoMs: CATEGORIAS_DEL_OJEO.presupuestoMs });
      categorias = filas.map((f) => f.categoria);
    } catch (error) {
      if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Ojeo" motivo={error.message} />;
      throw error;
    }
  }
  const categoria = pedidos.categoria !== null && categorias.includes(pedidos.categoria)
    ? pedidos.categoria
    : null;
  const avisoCategoria = pedidos.categoria !== null && categoria === null
    ? `La categoría «${pedidos.categoria}» no tiene datos de ojeo en esa temporada.`
    : null;

  const filtros: FiltrosOjeoTipo = { ...pedidos, federacion, temporada, categoria };
  const porDefecto: FiltrosOjeoTipo = {
    federacion: federacionDefecto, temporada: temporadaDefecto, categoria: null,
    edad: 19, minutos: 270, posicion: 'cualquiera',
  };
  const federacionNombre = federaciones.find((f) => f.codigo === federacion)?.nombre_corto
    ?? federaciones.find((f) => f.codigo === federacion)?.nombre
    ?? federacion;
  const edadEtiqueta = etiquetasDeEdad(temporada).find((e) => e.valor === String(filtros.edad))?.etiqueta;
  const contexto = [federacionNombre, temporada, edadEtiqueta, filtros.minutos > 0 ? `mínimo ${filtros.minutos} minutos` : null]
    .filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-[18px]">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
        <Link className="hover:underline" href={'/' as Route}>Inicio</Link>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--texto)]" aria-current="page">Ojeo</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Ojeo</h1>
        <p className="m-0 text-tabla text-[var(--texto-suave)]">{contexto}</p>
      </div>

      <FiltrosOjeo filtros={filtros} opciones={opciones} categorias={categorias} porDefecto={porDefecto} />

      {aviso && <p role="status" className="m-0 text-nota text-[var(--texto-suave)]">{aviso}</p>}
      {avisoCategoria && <p role="status" className="m-0 text-nota text-[var(--texto-suave)]">{avisoCategoria}</p>}

      <Suspense fallback={<EsqueletoTabla filas={8} />}>
        <Contenido filtros={filtros} />
      </Suspense>
    </div>
  );
}

/** Los perfiles. Una sola consulta acotada: como mucho 40 filas. */
async function Contenido({ filtros }: { filtros: FiltrosOjeoTipo }) {
  let filas: FilaOjeo[] = [];
  try {
    filas = await consulta<FilaOjeo>(OJEO_JUGADORES.sql, parametrosDeOjeo(filtros, LIMITE_OJEO),
      { presupuestoMs: OJEO_JUGADORES.presupuestoMs });
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Ojeo" motivo={error.message} />;
    throw error;
  }

  if (filas.length === 0) {
    return (
      <SinResultados titulo="Sin perfiles" quitarHref={RUTA_OJEO}>
        {filtros.posicion !== 'cualquiera'
          ? 'La posición de campo sólo se publica en algunas federaciones, y con este filtro no hay jugadores. Prueba «Cualquiera» o «Portero».'
          : `No hay jugadores con estos filtros.${filtros.minutos > 0 ? ' Prueba a bajar los minutos mínimos.' : ''}`}
      </SinResultados>
    );
  }

  const total = Number(filas[0]?.total ?? 0);
  // La pantalla no es un listado infinito: 20 perfiles y los filtros para afinar.
  const visibles = filas.slice(0, 20);
  const resumen = total > 1_000
    ? `Mostrando ${visibles.length} de más de 1.000 perfiles`
    : (visibles.length < total ? `Mostrando ${visibles.length} de ${numero(total)} perfiles` : `${numero(total)} perfiles`);

  return (
    <section className={TARJETA} aria-label="Perfiles de jugadores">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
        <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">Perfiles</h2>
        <p className="m-0 text-nota text-[var(--texto-suave)]">{resumen}</p>
      </div>
      <TablaOjeo filas={visibles} />
    </section>
  );
}
