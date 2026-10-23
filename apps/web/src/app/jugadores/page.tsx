import Link from 'next/link';
import type { Route } from 'next';
import { SinCanonico } from '@/componentes/SinCanonico';
import { Chip, TablaDatos, Vacio } from '@/componentes/base';
import type { ColumnaTabla } from '@/componentes/base';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { FACETAS_DEL_CATALOGO, FEDERACIONES_DEL_CANONICO, PARAMETROS_CATALOGO } from '@/consultas/catalogo';
import type { FilaFederacionCanonica, FilaFaceta } from '@/consultas/catalogo';
import { BUSQUEDA_POR_NOMBRE } from '@/consultas/entidades';
import type { FilaBusqueda } from '@/consultas/entidades';
import { agrupaFacetas, numero, texto } from '@/lib/presentacion-canonico';

export const dynamic = 'force-dynamic';

/**
 * Directorio de jugadores del canónico, buscados por nombre.
 *
 * Sustituye a la versión que recorría las colas SQLite (`listarJugadoresLocal`).
 *
 * **Por qué se entra por el nombre y no hay una lista completa, y por qué eso es lo correcto y no una
 * limitación de esta página.** Un listado alfabético de jugadores necesita, para cada uno, cuántos
 * partidos ha jugado —si no, es una lista de nombres sin nada que ordenar ni comparar—. Esas cifras
 * viven en `analytics.player_team_season_summary`, que **está vacía y ningún proceso del repositorio
 * escribe**. La alternativa sería agregar `core.appearance` en cada visita: una tabla de hechos con
 * cientos de miles de filas, recorrida entera para pintar una lista. Eso es exactamente lo que la capa
 * `analytics` existe para evitar, y hacerlo aquí sería resolver un problema de datos desde la interfaz.
 *
 * Así que esta página hace lo que el canónico sí puede sostener hoy: buscar por nombre con índice de
 * trigramas y filtrar por federación y temporada. Lo que falta está dicho en pantalla, no escondido.
 */
export default async function Jugadores({ searchParams }: {
  searchParams: Promise<{ q?: string; fed?: string; temp?: string }>;
}) {
  const p = await searchParams;
  const q = (p.q ?? '').trim();
  const fed = (p.fed ?? '').trim();
  const temp = (p.temp ?? '').trim();

  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico titulo="Jugadores" motivo={motivo} />;

  const url = (cambios: { fed?: string; temp?: string }) => {
    const u = new URLSearchParams();
    if (q) u.set('q', q);
    const f = cambios.fed ?? fed;
    const t = cambios.temp ?? temp;
    if (f) u.set('fed', f);
    if (t) u.set('temp', t);
    return `/jugadores?${u.toString()}` as Route;
  };

  let federaciones: FilaFederacionCanonica[] = [];
  let temporadas: Array<{ valor: string; etiqueta: string }> = [];
  let filas: FilaBusqueda[] = [];
  try {
    federaciones = await consulta<FilaFederacionCanonica>(
      FEDERACIONES_DEL_CANONICO.sql, PARAMETROS_CATALOGO[FEDERACIONES_DEL_CANONICO.nombre]);
    const facetas = await consulta<FilaFaceta>(
      FACETAS_DEL_CATALOGO.sql, PARAMETROS_CATALOGO[FACETAS_DEL_CATALOGO.nombre]);
    temporadas = agrupaFacetas(facetas).temporadas;
    if (q.length >= 2) {
      filas = await consulta<FilaBusqueda>(BUSQUEDA_POR_NOMBRE.sql,
        [q, fed || null, 'jugador', temp || null, 60]);
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Jugadores" motivo={error.message} />;
    throw error;
  }

  const conDatos = federaciones.filter((f) => f.ediciones > 0);
  const total = filas[0]?.total ?? 0;

  const columnas: ColumnaTabla<FilaBusqueda>[] = [
    { clave: 'nombre', titulo: 'Jugador' },
    { clave: 'federacion_nombre', titulo: 'Federación', render: (f) => texto(f.federacion_nombre) },
    { clave: 'contexto', titulo: 'Último equipo del que hay acta', render: (f) => texto(f.contexto) },
    {
      clave: null, titulo: 'Identidad',
      render: (f) => (f.identidad_nominal
        ? <span className="text-[var(--revision)]" title="identidad nominal: asignada sin código federativo">nominal</span>
        : '—'),
    },
  ];

  return <>
    <h2 className="font-display text-3xl uppercase">Jugadores</h2>
    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--texto-suave)]">
      {conDatos.length} federaciones con datos · se entra por el nombre
    </p>

    <form action="/jugadores" className="mt-5 grid gap-3 border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4 sm:grid-cols-[1fr_12rem_10rem_auto]">
      <label>
        <span className="etiqueta-filtro">Nombre</span>
        <input name="q" defaultValue={q} className="control-filtro" placeholder="Apellido o nombre…" />
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
      <div className="flex items-end"><button className="boton-primario w-full">Buscar</button></div>
    </form>

    {(fed || temp) && (
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[var(--texto-suave)]">Filtros activos:</span>
        {fed && <Chip nombre="federación" quitar={url({ fed: '' })}>
          {conDatos.find((f) => f.codigo === fed)?.nombre ?? fed}</Chip>}
        {temp && <Chip nombre="temporada" quitar={url({ temp: '' })}>
          Temporada {temporadas.find((t) => t.valor === temp)?.etiqueta ?? temp}</Chip>}
      </p>
    )}

    {q.length < 2 ? (
      <div className="mt-6">
        <Vacio
          titulo="Escribe al menos dos letras"
          motivo="La búsqueda va sobre el nombre normalizado del canónico: no hacen falta las tildes, y la clave interna no sustituye al nombre que se enseña."
          nota="No hay lista alfabética completa a propósito: ordenar jugadores exige sus partidos jugados, y esas cifras están en analytics.player_team_season_summary, que hoy está vacía y ningún proceso escribe. Agregar core.appearance en cada visita sería recorrer una tabla de hechos entera para pintar una lista, que es justo lo que esa capa existe para evitar."
        />
      </div>
    ) : (
      <>
        <p className="mt-5 text-xs text-[var(--texto-suave)]">
          {total === 0 ? 'Ningún jugador' : `${numero(total)} ${total === 1 ? 'jugador' : 'jugadores'}`}
          {total > filas.length && ` · se muestran los ${filas.length} más parecidos`}
          {' · '}buscando «{q}»
        </p>
        <div className="mt-3">
          <TablaDatos
            filas={filas}
            columnas={columnas}
            caption={`Jugadores del canónico cuyo nombre coincide con «${q}», con su federación y su último equipo con acta.`}
            clave={(f) => f.entidad_id}
            enlaceFila={(f) => `/jugador/${f.entidad_id}`}
            columnaPrincipal={0}
            vacio={<Vacio
              titulo="Sin resultados"
              motivo={`Ningún jugador del canónico coincide con «${q}». Puede que no esté importado todavía: no es que no exista.`}
              accion={fed || temp ? { texto: 'Quitar los filtros', href: `/jugadores?q=${encodeURIComponent(q)}` } : undefined}
            />}
          />
        </div>
        <p className="mt-2 text-[0.6875rem] leading-5 text-[var(--texto-tenue)]">
          «nominal» marca una identidad asignada <b>sin código federativo</b>: ese enlace entre
          temporadas no está confirmado, y un nombre igual no une a dos personas. El equipo y la
          federación salen de las actas de esa persona, no de una coincidencia de nombres.
        </p>
      </>
    )}
  </>;
}
