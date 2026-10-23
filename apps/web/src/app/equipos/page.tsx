import Link from 'next/link';
import type { Route } from 'next';
import { SinCanonico } from '@/componentes/SinCanonico';
import { Chip, InsigniaCobertura, Paginador, TablaDatos, Vacio } from '@/componentes/base';
import type { ColumnaTabla, EstadoCobertura } from '@/componentes/base';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { FACETAS_DEL_CATALOGO, FEDERACIONES_DEL_CANONICO, PARAMETROS_CATALOGO } from '@/consultas/catalogo';
import type { FilaFederacionCanonica, FilaFaceta } from '@/consultas/catalogo';
import { EQUIPOS_POR_FEDERACION, PARAMETROS_ENTIDADES } from '@/consultas/entidades';
import type { FilaEquipoListado } from '@/consultas/entidades';
import { agrupaFacetas, etiqueta, fechaCorta, numero } from '@/lib/presentacion-canonico';

export const dynamic = 'force-dynamic';

/**
 * Listado de equipos inscritos, leído del canónico.
 *
 * Sustituye a la versión que recorría las colas SQLite (`listarEquiposLocal`), por el mismo motivo que
 * el resto de la migración: leer archivos federativos dentro de una petición de usuario es lo que
 * prohíbe `ARQUITECTURA.md` §7.
 *
 * **Cada fila es una inscripción, no un club.** Es la consecuencia de la medición de `team_season`
 * (`FRONT-PROPUESTA.md` §2): «Ciudad Rodrigo C.F.» aparece dos veces en 2025-26 —juvenil y sénior—
 * porque son dos equipos con el mismo nombre publicado. Un listado por club los habría fundido en uno.
 *
 * Los filtros ofrecen sólo lo que existe: las federaciones con datos y las temporadas y categorías del
 * canónico. Una opción sin resultados es una promesa falsa, y una federación sin nada importado no se
 * ofrece como si fuera a devolver algo.
 */

const POR_PAGINA = 80;

function coberturaDe(f: FilaEquipoListado): { estado: EstadoCobertura; hasta: number | null } {
  switch (f.visibility_state) {
    case 'completa': return { estado: 'completa', hasta: null };
    case 'verificada_hasta_jornada': return { estado: 'hasta_jornada', hasta: null };
    case 'parcial_privada': return { estado: 'parcial', hasta: null };
    case 'oculta': return { estado: 'no_publicada', hasta: null };
    default: return { estado: 'sin_medir', hasta: null };
  }
}

export default async function Equipos({ searchParams }: {
  searchParams: Promise<{ fed?: string; temp?: string; categoria?: string; q?: string; p?: string }>;
}) {
  const p = await searchParams;
  const fed = (p.fed ?? '').trim();
  const temp = (p.temp ?? '').trim();
  const categoria = (p.categoria ?? '').trim();
  const q = (p.q ?? '').trim();
  const desplazamiento = Math.max(0, Math.trunc(Number(p.p ?? 0)) || 0);

  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico titulo="Equipos" motivo={motivo} />;

  const url = (cambios: { fed?: string; temp?: string; categoria?: string; q?: string; p?: number }) => {
    const u = new URLSearchParams();
    const v = (k: 'fed' | 'temp' | 'categoria' | 'q') => cambios[k] ?? { fed, temp, categoria, q }[k];
    if (v('fed')) u.set('fed', v('fed'));
    if (v('temp')) u.set('temp', v('temp'));
    if (v('categoria')) u.set('categoria', v('categoria'));
    if (v('q')) u.set('q', v('q'));
    const pagina = cambios.p ?? desplazamiento;
    if (pagina > 0) u.set('p', String(pagina));
    return `/equipos?${u.toString()}` as Route;
  };

  let federaciones: FilaFederacionCanonica[] = [];
  let temporadas: Array<{ valor: string; etiqueta: string }> = [];
  let categorias: Array<{ valor: string; etiqueta: string }> = [];
  let filas: FilaEquipoListado[] = [];
  try {
    federaciones = await consulta<FilaFederacionCanonica>(
      FEDERACIONES_DEL_CANONICO.sql, PARAMETROS_CATALOGO[FEDERACIONES_DEL_CANONICO.nombre]);
    const facetas = await consulta<FilaFaceta>(
      FACETAS_DEL_CATALOGO.sql, PARAMETROS_CATALOGO[FACETAS_DEL_CATALOGO.nombre]);
    const agrupadas = agrupaFacetas(facetas);
    temporadas = agrupadas.temporadas;
    categorias = agrupadas.categorias;
    filas = await consulta<FilaEquipoListado>(EQUIPOS_POR_FEDERACION.sql, [
      fed || null, temp || null, categoria || null, q,
      POR_PAGINA, desplazamiento,
    ]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Equipos" motivo={error.message} />;
    throw error;
  }

  const conDatos = federaciones.filter((f) => f.ediciones > 0);
  const total = filas[0]?.total ?? 0;
  const hayFiltros = Boolean(fed || temp || categoria || q);

  const columnas: ColumnaTabla<FilaEquipoListado>[] = [
    { clave: 'nombre_en_fuente', titulo: 'Equipo' },
    { clave: 'club', titulo: 'Club' },
    { clave: 'edicion', titulo: 'Competición' },
    { clave: 'grupo', titulo: 'Grupo' },
    { clave: 'edicion_categoria', titulo: 'Categoría', render: (f) => etiqueta('categoria', f.edicion_categoria) },
    { clave: 'temporada', titulo: 'Temporada' },
    {
      clave: 'partidos_conocidos', titulo: 'Partidos conocidos del grupo', tipo: 'numero',
      abreviatura: 'PJ', render: (f) => numero(f.partidos_conocidos),
    },
    {
      clave: null, titulo: 'Cobertura del grupo',
      render: (f) => {
        const { estado, hasta } = coberturaDe(f);
        return <InsigniaCobertura estado={estado} hastaJornada={hasta} />;
      },
    },
  ];

  return <>
    <h2 className="font-display text-3xl uppercase">Equipos</h2>
    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--texto-suave)]">
      {conDatos.length} federaciones con datos · cada fila es una inscripción, no un club
    </p>

    <form action="/equipos" className="mt-5 grid gap-3 border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4 sm:grid-cols-[1fr_11rem_10rem_10rem_auto]">
      <label>
        <span className="etiqueta-filtro">Nombre del equipo</span>
        <input name="q" defaultValue={q} className="control-filtro" placeholder="Parte del nombre…" />
      </label>
      <label>
        <span className="etiqueta-filtro">Federación</span>
        <select name="fed" defaultValue={fed} className="control-filtro">
          <option value="">Todas</option>
          {conDatos.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombre}</option>)}
        </select>
      </label>
      <label>
        <span className="etiqueta-filtro">Temporada</span>
        <select name="temp" defaultValue={temp} className="control-filtro">
          <option value="">Todas</option>
          {temporadas.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
        </select>
      </label>
      <label>
        <span className="etiqueta-filtro">Categoría</span>
        <select name="categoria" defaultValue={categoria} className="control-filtro">
          <option value="">Todas</option>
          {categorias.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
        </select>
      </label>
      <div className="flex items-end"><button className="boton-primario w-full">Filtrar</button></div>
    </form>

    {hayFiltros && (
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[var(--texto-suave)]">Filtros activos:</span>
        {fed && <Chip nombre="federación" quitar={url({ fed: '' })}>
          {conDatos.find((f) => f.codigo === fed)?.nombre ?? fed}</Chip>}
        {temp && <Chip nombre="temporada" quitar={url({ temp: '' })}>
          Temporada {temporadas.find((t) => t.valor === temp)?.etiqueta ?? temp}</Chip>}
        {categoria && <Chip nombre="categoría" quitar={url({ categoria: '' })}>
          {etiqueta('categoria', categoria)}</Chip>}
        {q && <Chip nombre="nombre" quitar={url({ q: '' })}>Nombre: {q}</Chip>}
      </p>
    )}

    <p className="mt-5 text-xs text-[var(--texto-suave)]">
      {total === 0 ? 'Ningún equipo' : `${numero(total)} ${total === 1 ? 'inscripción' : 'inscripciones'}`}
      {total > filas.length && ` · se muestran ${filas.length}`}
    </p>

    <div className="mt-3">
      <TablaDatos
        filas={filas}
        columnas={columnas}
        caption="Equipos inscritos del canónico, con su club, su competición, su grupo y la cobertura medida de ese grupo."
        clave={(f) => f.equipo_id}
        enlaceFila={(f) => `/equipo/${f.equipo_id}`}
        columnaPrincipal={0}
        vacio={<Vacio
          titulo="Ningún equipo con esos filtros"
          motivo={hayFiltros
            ? 'Ninguna inscripción del canónico cumple esa combinación. Puede que esos equipos no se hayan importado todavía: no es que no existan.'
            : 'El canónico no tiene ninguna inscripción importada. Todo está por importar, no vacío.'}
          accion={hayFiltros ? { texto: 'Quitar los filtros', href: '/equipos' } : undefined}
        />}
      />
    </div>

    <Paginador
      anterior={desplazamiento > 0 ? url({ p: Math.max(0, desplazamiento - POR_PAGINA) }) : null}
      siguiente={desplazamiento + filas.length < total ? url({ p: desplazamiento + POR_PAGINA }) : null}
      desde={filas.length === 0 ? 0 : desplazamiento + 1}
      hasta={desplazamiento + filas.length}
      total={total}
    />

    <p className="mt-3 text-[0.6875rem] leading-5 text-[var(--texto-tenue)]">
      Cada fila lleva su competición y su grupo a propósito: un club puede tener dos equipos con el
      mismo nombre publicado en la misma temporada —el juvenil y el sénior—, y sin ese contexto
      parecerían el mismo. La categoría es la de la <b>competición</b>, que es la fiable.
      {' '}Medición de la cobertura: {fechaCorta(filas[0]?.calculado_en ?? null)}.
    </p>
  </>;
}
