import Link from 'next/link';
import type { Route } from 'next';
import { Bloque } from '@/componentes/Bloque';
import { SinCanonico } from '@/componentes/SinCanonico';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { FEDERACIONES_DEL_CANONICO, LISTADO_DE_GRUPOS, PARAMETROS_CATALOGO, RECUENTOS_DEL_CANONICO } from '@/consultas/catalogo';
import type { FilaCatalogoGrupo, FilaFederacionCanonica, FilaRecuentos } from '@/consultas/catalogo';
import { etiqueta, fechaHora, numero, porcentaje } from '@/lib/presentacion-canonico';

export const dynamic = 'force-dynamic';

/**
 * Portada: el resumen del archivo, leído del canónico.
 *
 * Antes esta página recorría las dieciocho colas SQLite y, dentro del contenedor de la web —donde esas
 * carpetas no están montadas—, decía «18 federaciones · 0 competiciones · 0 partidos · 0 actas» con
 * 9 000 partidos ya importados. Esa es exactamente la clase de cero que el proyecto no admite: no
 * significaba «no hay nada», significaba «no se ha leído donde está».
 *
 * Ahora todo sale de PostgreSQL con el rol de sólo lectura:
 * - los recuentos, de `ops.coverage_checkpoint` (lo que el importador mide) y de `core.matchday`
 *   (jornadas con calendario importado). No se cuentan tablas de hechos: un `count(*)` sobre
 *   `core.match` en cada visita sería el recorrido caro que vive en la página de diagnóstico;
 * - la lista de federaciones y sus portales, de `core.federation`;
 * - la lista de grupos, del catálogo, con la cobertura de cada uno y **su fecha de medición**.
 *
 * Lo que no está medido no se convierte en cero: sale `—` o se dice con palabras.
 */

const GRUPOS_EN_LA_PORTADA = 12;

function Contador({ titulo, valor, destino, detalle }: {
  titulo: string; valor: number | null; destino?: Route; detalle?: string;
}) {
  const contenido = <>
    <p className="font-display text-xl tabular-nums">{numero(valor)}</p>
    <p className="text-[10px] uppercase tracking-wider text-[#5C646C]">{titulo}</p>
    {detalle && <p className="mt-0.5 text-[10px] text-[#8A8E91]">{detalle}</p>}
  </>;
  return destino
    ? <Link href={destino} className="bg-white p-3 hover:bg-[#FAFBFA]">{contenido}</Link>
    : <div className="bg-white p-3">{contenido}</div>;
}

/** Una barra de avance. Sin medida, lo dice: nunca un 0 %. */
function Avance({ etiqueta: titulo, parte, total }: { etiqueta: string; parte: number | null; total: number | null }) {
  const pct = porcentaje(parte, total);
  return (
    <div>
      <div className="flex justify-between text-xs text-[#5C646C]">
        <span>{titulo}</span>
        <b className="tabular-nums">
          {pct === null ? 'sin medir' : `${numero(parte)}/${numero(total)} · ${pct}%`}
        </b>
      </div>
      <div className="mt-1 h-2 bg-[#EDF0ED]">
        <div className="h-full bg-club" style={{ width: `${pct === null ? 0 : Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export default async function Inicio() {
  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico titulo="Observatorio de fútbol" motivo={motivo} volver={false} />;

  let recuentos: FilaRecuentos | null = null;
  let federaciones: FilaFederacionCanonica[] = [];
  let grupos: FilaCatalogoGrupo[] = [];
  try {
    recuentos = (await consulta<FilaRecuentos>(
      RECUENTOS_DEL_CANONICO.sql, PARAMETROS_CATALOGO[RECUENTOS_DEL_CANONICO.nombre]))[0] ?? null;
    federaciones = await consulta<FilaFederacionCanonica>(
      FEDERACIONES_DEL_CANONICO.sql, PARAMETROS_CATALOGO[FEDERACIONES_DEL_CANONICO.nombre]);
    // `conDatos` = tiene partidos conocidos en su punto de control. Un grupo sin punto de control no
    // entra aquí, y eso es una decisión, no un descarte: no se sabe si tiene partidos.
    grupos = await consulta<FilaCatalogoGrupo>(LISTADO_DE_GRUPOS.sql, [
      null, null, null, null, null, null, null, null, null, '', true, GRUPOS_EN_LA_PORTADA, 0,
    ]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Observatorio de fútbol" motivo={error.message} volver={false} />;
    throw error;
  }

  const conDatos = federaciones.filter((f) => f.ediciones > 0);
  const medido = fechaHora(recuentos?.calculado_en ?? null);

  const contadores: Array<{ titulo: string; valor: number | null; destino?: Route; detalle?: string }> = [
    { titulo: 'Federaciones', valor: recuentos?.federaciones ?? null, destino: '/federaciones', detalle: `${numero(recuentos?.federaciones_con_datos ?? null)} con datos` },
    { titulo: 'Ediciones', valor: recuentos?.ediciones ?? null, destino: '/competiciones' },
    { titulo: 'Grupos', valor: recuentos?.grupos ?? null, destino: '/competiciones' },
    { titulo: 'Partidos conocidos', valor: recuentos?.partidos_conocidos ?? null, destino: '/canonico' },
    { titulo: 'Jornadas con calendario', valor: recuentos?.jornadas_publicadas ?? null, destino: '/canonico' },
    { titulo: 'Actas analizadas', valor: recuentos?.actas_parseadas ?? null, destino: '/canonico' },
  ];

  return <>
    <section className="border border-[#D6D6D4] bg-white p-5">
      <h2 className="font-display text-2xl uppercase">Buscar en el archivo</h2>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#5C646C]">
        {numero(recuentos?.federaciones ?? null)} federaciones · {numero(recuentos?.ediciones ?? null)} ediciones ·{' '}
        {numero(recuentos?.partidos_conocidos ?? null)} partidos conocidos ·{' '}
        {numero(recuentos?.actas_parseadas ?? null)} actas analizadas
      </p>
      <form action="/buscar" className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input name="q" autoFocus className="control-filtro sm:flex-1" placeholder="Equipo, jugador, competición, técnico, árbitro…" />
        <select name="federacion" className="control-filtro sm:w-56" defaultValue="todas">
          <option value="todas">Todas las federaciones</option>
          {conDatos.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombre}</option>)}
        </select>
        <button className="boton-primario sm:w-40">Buscar</button>
      </form>
      <p className="mt-2 text-[11px] text-[#8A8E91]">
        La búsqueda por nombre la resuelven todavía las colas locales, no el canónico: puede no encontrar
        todo lo que se resume aquí. Los enlaces de esta portada sí leen el canónico.
      </p>
    </section>

    <div className="my-5 grid grid-cols-2 gap-px border border-[#D6D6D4] bg-[#D6D6D4] sm:grid-cols-3 lg:grid-cols-6">
      {contadores.map((c) => <Contador key={c.titulo} {...c} />)}
    </div>

    <section className="mb-5 grid gap-4 border-l-4 border-club bg-white p-4 sm:grid-cols-2">
      <Avance etiqueta="Jornadas con calendario importado / previstas" parte={recuentos?.jornadas_publicadas ?? null} total={recuentos?.jornadas_esperadas ?? null} />
      <Avance etiqueta="Partidos con resultado / conocidos" parte={recuentos?.partidos_con_resultado ?? null} total={recuentos?.partidos_conocidos ?? null} />
      <Avance etiqueta="Actas analizadas / disponibles" parte={recuentos?.actas_parseadas ?? null} total={recuentos?.actas_disponibles ?? null} />
      <Avance etiqueta="Grupos completos / con punto de control" parte={recuentos?.grupos_completos ?? null} total={recuentos?.grupos_medidos ?? null} />
      <p className="text-[12px] leading-5 text-[#5C646C] sm:col-span-2">
        Un catálogo completo no significa contenido completo: cada ficha indica su cobertura. Todas las
        cifras salen de PostgreSQL, leídas con el rol de sólo lectura: las de catálogo (federaciones,
        ediciones, grupos, jornadas con calendario) son filas de <code className="bg-[#F4F5F3] px-1">core.*</code>;
        las de cobertura (partidos, actas, grupos completos) las mide el importador en{' '}
        <code className="bg-[#F4F5F3] px-1">ops.coverage_checkpoint</code>, y la fecha de la última
        medición es el <b>{medido}</b>. Lo que no está medido se enseña como «—», nunca como cero. La
        prioridad de análisis sigue siendo Castilla y León y Salamanca. Fuente: portales federativos
        oficiales.
      </p>
    </section>

    <Bloque titulo={`Grupos con cobertura medida · ${numero(recuentos?.grupos_medidos ?? null)} en total`}
      pie={`Se enseñan los ${grupos.length} primeros del catálogo (por federación, temporada y grupo)`}>
      <div className="overflow-x-auto"><table className="w-full text-sm tabular-nums">
        <thead><tr className="border-b border-[#D6D6D4] text-left text-xs uppercase text-[#5C646C]">
          <th className="p-2">Grupo</th><th className="p-2">Federación · temporada</th>
          <th className="p-2 text-right">Jornadas</th><th className="p-2 text-right">Resultados</th>
          <th className="p-2 text-right">Actas</th><th className="p-2">Cobertura</th>
        </tr></thead>
        <tbody>{grupos.map((g) => (
          <tr key={`${g.federacion}-${g.grupo_codigo}`} className="border-b border-[#EDF0ED] hover:bg-[#FAFBFA]">
            <td className="p-2">
              <Link href={`/canonico/${g.federacion}/${g.grupo_codigo}` as Route}
                className="font-medium hover:text-club hover:underline">{g.edicion}</Link>
              <span className="block text-[10px] text-[#8A8E91]">{g.grupo} · {etiqueta('categoria', g.categoria)}</span>
            </td>
            <td className="p-2 text-[12px] text-[#5C646C]">{g.federacion_nombre}<span className="block text-[10px] text-[#8A8E91]">{g.temporada}</span></td>
            <td className="p-2 text-right">{numero(g.jornadas_previstas)}</td>
            <td className="p-2 text-right font-semibold">{numero(g.partidos_con_resultado)}/{numero(g.partidos_conocidos)}</td>
            <td className="p-2 text-right">{numero(g.actas_parseadas)}/{numero(g.actas_disponibles)}</td>
            <td className="p-2 text-[12px] text-[#5C646C]">
              {g.complete_through_matchday === null ? 'sin punto de control' : `completo hasta J${g.complete_through_matchday}`}
            </td>
          </tr>
        ))}</tbody>
      </table></div>
      {!grupos.length && <p className="p-5 text-sm text-[#5C646C]">
        El canónico está creado pero todavía no tiene ningún grupo con partidos medidos. No es un cero: es
        que no hay nada importado. Los grupos aparecen aquí en cuanto el importador los mide; su estado se
        puede seguir en <Link className="text-club hover:underline" href={'/canonico' as Route}>el estado del canónico</Link>.
      </p>}
      <p className="border-t border-[#EDF0ED] p-3 text-[11px] text-[#8A8E91]">
        Antes este bloque listaba los grupos de Salamanca: esa lista salía del repositorio local y el
        contenedor de la web no lo tiene montado. El canónico todavía no rellena la provincia de ninguna
        edición importada, así que en su lugar se listan los grupos con cobertura medida, que es lo que sí
        está comprobado.
      </p>
    </Bloque>

    <div className="mt-5 grid gap-3 sm:grid-cols-4">
      {[['/federaciones', 'Federaciones', 'Cobertura por territorio, del canónico'],
        ['/competiciones', 'Competiciones', 'Por temporada, categoría y grupo'],
        ['/canonico', 'Estado del canónico', 'Qué hay importado y hasta dónde llega'],
        ['/equipos', 'Equipos', 'Partidos y continuidad (colas locales)']].map(([href, titulo, pie]) => (
        <Link key={href} href={href as Route} className="border border-[#D6D6D4] bg-white p-3 hover:border-club">
          <h3 className="font-display uppercase">{titulo}</h3><p className="mt-1 text-[11px] text-[#5C646C]">{pie}</p>
        </Link>
      ))}
    </div>
  </>;
}
