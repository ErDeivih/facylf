import Link from 'next/link';
import type { Route } from 'next';
import { SinCanonico } from '@/componentes/SinCanonico';
import { Chip, Marcador, Paginador, TablaDatos, Vacio } from '@/componentes/base';
import type { ColumnaTabla } from '@/componentes/base';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { FACETAS_DEL_CATALOGO, FEDERACIONES_DEL_CANONICO, PARAMETROS_CATALOGO } from '@/consultas/catalogo';
import type { FilaFederacionCanonica, FilaFaceta } from '@/consultas/catalogo';
import { PARTIDOS_DEL_CANONICO } from '@/consultas/entidades';
import type { FilaPartidoListado } from '@/consultas/entidades';
import { agrupaFacetas, numero } from '@/lib/presentacion-canonico';
import { BOTON_PRIMARIO, CONTROL_FILTRO, ETIQUETA_FILTRO } from '@/componentes/ui/legado';

export const dynamic = 'force-dynamic';

/**
 * Listado de partidos, leído del canónico.
 *
 * Sustituye a la versión que recorría las colas SQLite (`listarPartidosLocal`, 150 partidos de una
 * federación tomada por defecto), por el mismo motivo que el resto de la migración.
 *
 * **La temporada va puesta por defecto, y es una decisión medida, no una comodidad.** El plan de la
 * consulta se midió con federación y temporada —`Index Scan` sobre `core.match`, el partido se alcanza
 * por índice a partir de los grupos de esa edición— y sin temporada el conjunto de grupos crece hasta
 * todas las ediciones de la federación, con lo que el camino barato deja de estar garantizado. Por eso
 * lo primero que hace esta página es resolver la temporada más reciente del canónico y usarla.
 *
 * El marcador se pinta con el componente `Marcador` del inventario, no a mano: la regla de que un
 * resultado sin publicar **no es 0-0** vive en un solo sitio.
 */

const POR_PAGINA = 80;

export default async function Partidos({ searchParams }: {
  searchParams: Promise<{ fed?: string; temp?: string; j?: string; p?: string }>;
}) {
  const p = await searchParams;
  const fed = (p.fed ?? '').trim();
  const tempPedida = (p.temp ?? '').trim();
  const jornada = (p.j ?? '').trim();
  const desplazamiento = Math.max(0, Math.trunc(Number(p.p ?? 0)) || 0);

  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico titulo="Partidos" motivo={motivo} />;

  let federaciones: FilaFederacionCanonica[] = [];
  let temporadas: Array<{ valor: string; etiqueta: string }> = [];
  let filas: FilaPartidoListado[] = [];
  try {
    federaciones = await consulta<FilaFederacionCanonica>(
      FEDERACIONES_DEL_CANONICO.sql, PARAMETROS_CATALOGO[FEDERACIONES_DEL_CANONICO.nombre]);
    const facetas = await consulta<FilaFaceta>(
      FACETAS_DEL_CATALOGO.sql, PARAMETROS_CATALOGO[FACETAS_DEL_CATALOGO.nombre]);
    temporadas = agrupaFacetas(facetas).temporadas;
    // La temporada que se usa si no se pide otra: la más reciente del canónico. `''` se convierte en
    // `null` en la consulta, pero no se llega ahí salvo que el canónico no tenga ninguna edición.
    const temp = tempPedida || temporadas[0]?.valor || '';
    const jornadaNumero = /^\d+$/.test(jornada) ? Number(jornada) : null;
    filas = await consulta<FilaPartidoListado>(PARTIDOS_DEL_CANONICO.sql, [
      fed || null, temp || null, jornadaNumero, POR_PAGINA, desplazamiento,
    ]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Partidos" motivo={error.message} />;
    throw error;
  }

  const conDatos = federaciones.filter((f) => f.ediciones > 0);
  const total = filas[0]?.total ?? 0;
  const temporada = tempPedida || temporadas[0]?.valor || '';
  const hayFiltros = Boolean(fed || tempPedida || jornada);

  const url = (cambios: { fed?: string; temp?: string; j?: string; p?: number }) => {
    const u = new URLSearchParams();
    const v = (k: 'fed' | 'temp' | 'j') => cambios[k] ?? { fed, temp: tempPedida, j: jornada }[k];
    if (v('fed')) u.set('fed', v('fed'));
    if (v('temp')) u.set('temp', v('temp'));
    if (v('j')) u.set('j', v('j'));
    const pagina = cambios.p ?? desplazamiento;
    if (pagina > 0) u.set('p', String(pagina));
    return `/partidos?${u.toString()}` as Route;
  };

  const columnas: ColumnaTabla<FilaPartidoListado>[] = [
    { clave: 'jornada_numero', titulo: 'Jornada', tipo: 'numero', abreviatura: 'J', render: (f) => numero(f.jornada_numero) },
    {
      clave: 'fecha_prevista', titulo: 'Fecha',
      render: (f) => (f.fecha_prevista ? String(f.fecha_prevista).slice(0, 10) : '—'),
    },
    { clave: 'local', titulo: 'Local' },
    {
      clave: null, titulo: 'Marcador',
      render: (f) => <Marcador local={f.goles_local} visitante={f.goles_visitante} />,
    },
    {
      clave: 'visitante', titulo: 'Visitante',
      render: (f) => <Link href={`/equipo/${f.visitante_id}` as Route} className="hover:text-[var(--accion)] hover:underline">{f.visitante}</Link>,
    },
    {
      clave: 'edicion', titulo: 'Competición y grupo',
      render: (f) => <span>{f.edicion}<span className="block text-etiqueta text-[var(--texto-suave)]">{f.grupo}</span></span>,
    },
    {
      clave: 'calidad_acta', titulo: 'Acta',
      render: (f) => {
        if (!f.calidad_acta) return <span className="text-[var(--texto-tenue)]">sin acta analizada</span>;
        const etiquetas: Record<string, string> = {
          correct: 'correcta', administrative: 'administrativa', review: 'a revisar',
          partial: 'parcial', unavailable: 'no disponible',
        };
        return etiquetas[f.calidad_acta] ?? f.calidad_acta;
      },
    },
  ];

  return <>
    <h2 className="font-display text-3xl uppercase">Partidos</h2>
    <p className="mt-1 text-xs text-[var(--texto-suave)]">
      {conDatos.length} federaciones con datos · temporada {temporada}
    </p>

    <form action="/partidos" className="mt-5 grid gap-3 border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4 sm:grid-cols-[12rem_10rem_8rem_auto]">
      <label>
        <span className={`${ETIQUETA_FILTRO}`}>Federación</span>
        <select name="fed" defaultValue={fed} className={`${CONTROL_FILTRO}`}>
          <option value="">Todas</option>
          {conDatos.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombre}</option>)}
        </select>
      </label>
      <label>
        <span className={`${ETIQUETA_FILTRO}`}>Temporada</span>
        <select name="temp" defaultValue={temporada} className={`${CONTROL_FILTRO}`}>
          {temporadas.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
        </select>
      </label>
      <label>
        <span className={`${ETIQUETA_FILTRO}`}>Jornada</span>
        <input name="j" defaultValue={jornada} className={`${CONTROL_FILTRO}`} placeholder="Todas" inputMode="numeric" />
      </label>
      <div className="flex items-end"><button className={`${BOTON_PRIMARIO} w-full`}>Filtrar</button></div>
    </form>

    {hayFiltros && (
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[var(--texto-suave)]">Filtros activos:</span>
        {fed && <Chip nombre="federación" quitar={url({ fed: '' })}>
          {conDatos.find((f) => f.codigo === fed)?.nombre ?? fed}</Chip>}
        {tempPedida && <Chip nombre="temporada" quitar={url({ temp: '' })}>Temporada {tempPedida}</Chip>}
        {jornada && <Chip nombre="jornada" quitar={url({ j: '' })}>Jornada {jornada}</Chip>}
      </p>
    )}

    <p className="mt-5 text-xs text-[var(--texto-suave)]">
      {total === 0 ? 'Ningún partido' : `${numero(total)} ${total === 1 ? 'partido' : 'partidos'}`}
      {total > filas.length && ` · se muestran ${filas.length}`}
      {' · '}temporada <b>{temporada}</b>
    </p>

    <div className="mt-3">
      <TablaDatos
        filas={filas}
        columnas={columnas}
        caption={`Partidos del canónico de la temporada ${temporada}, con su jornada, los dos equipos, el marcador y la calidad del acta.`}
        clave={(f) => f.partido_id}
        enlaceFila={(f) => `/equipo/${f.local_id}`}
        columnaPrincipal={2}
        vacio={<Vacio
          titulo="Ningún partido con esos filtros"
          motivo={`El canónico no tiene ningún partido de la temporada ${temporada} que cumpla eso. Puede que esa competición no se haya importado todavía: no es que no se haya jugado.`}
          accion={hayFiltros ? { texto: 'Quitar los filtros', href: '/partidos' } : undefined}
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

    <p className="mt-3 text-etiqueta leading-5 text-[var(--texto-tenue)]">
      El marcador se enseña desde el punto de vista del local, y «sin resultado publicado» <b>no</b> es
      un 0-0: son cosas distintas y aquí no se confunden. Los equipos de cada fila llevan a su ficha,
      que es una inscripción concreta y no un club.
    </p>
  </>;
}
