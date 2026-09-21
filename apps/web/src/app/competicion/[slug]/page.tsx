import Link from 'next/link';
import { notFound } from 'next/navigation';
import { calculaClasificacion, type FilaClasificacion } from '@facylf/dominio';
import { competicionLocal, datosFederacion, slugEquipo, slugJugador, variantesGrupoLocal } from '@/lib/repositorio-local';
import { grupoEnCanonico } from '@/lib/canonico-grupos';
import { Bloque } from '@/componentes/Bloque';
import { Tabla } from '@/componentes/Tabla';
import { MapaCalor } from '@/componentes/MapaCalor';
import { DistribucionGoles, RendimientoEquipos } from '@/componentes/GraficasCompeticion';
import { NavegacionCompeticion } from '@/componentes/NavegacionCompeticion';

export const revalidate = 60;

export default async function Competicion({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = competicionLocal(slug);
  if (!c) notFound();
  // ¿Está este grupo ya importado en el canónico? Si lo está, se dice y se enlaza: el visitante tiene
  // que poder saber que esos datos están verificados, sin que la página falle cuando el canónico no
  // responde (devuelve null y no se pinta nada).
  const canonico = await grupoEnCanonico(c.federacion, c.grupoCodigo);
  const tablaCalculada = calculaClasificacion(c.partidosLista);
  const clave = (texto: string) => texto.toLocaleLowerCase('es').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
  const calculadaPorEquipo = new Map(tablaCalculada.map((fila) => [clave(fila.equipo), fila]));
  const tabla: FilaClasificacion[] = c.clasificacionOficial.length
    ? c.clasificacionOficial.map((oficial) => {
      const calculada = calculadaPorEquipo.get(clave(oficial.equipo));
      return {
        posicion: oficial.posicion, equipo: oficial.equipo,
        jugados: oficial.jugados, ganados: oficial.ganados,
        empatados: oficial.empatados, perdidos: oficial.perdidos,
        golesFavor: calculada?.golesFavor ?? 0, golesContra: calculada?.golesContra ?? 0,
        diferencia: calculada?.diferencia ?? 0, puntos: oficial.puntos,
        racha: oficial.ultimos as FilaClasificacion['racha'],
        casa: calculada?.casa ?? { jugados: 0, ganados: 0, empatados: 0, perdidos: 0, golesFavor: 0, golesContra: 0, puntos: 0 },
        fuera: calculada?.fuera ?? { jugados: 0, ganados: 0, empatados: 0, perdidos: 0, golesFavor: 0, golesContra: 0, puntos: 0 },
        sancion: Math.abs(oficial.sancion), desempatePor: null, sorteoPendiente: false,
      };
    }) : tablaCalculada;
  const diferenciasOficiales = c.clasificacionOficial.filter((oficial) => {
    const calculada = calculadaPorEquipo.get(clave(oficial.equipo));
    return !calculada || calculada.puntos !== oficial.puntos || calculada.posicion !== oficial.posicion;
  }).length;
  const jornadas = Array.from({ length: c.jornadas }, (_, i) => i + 1);
  const goles = c.partidosLista.reduce((n, p) => n + (p.golesLocal ?? 0) + (p.golesVisitante ?? 0), 0);
  const variantes = variantesGrupoLocal(c).sort((a, b) => Number(b.temporadaCodigo) - Number(a.temporadaCodigo));
  const enlacesEquipo = Object.fromEntries(c.partidosLista.flatMap((p) => [
    [p.local, p.codLocal ? `/equipo/${slugEquipo(c.temporadaCodigo, p.codLocal, c.competicionCodigo, c.grupoCodigo, c.federacion)}` : ''],
    [p.visitante, p.codVisitante ? `/equipo/${slugEquipo(c.temporadaCodigo, p.codVisitante, c.competicionCodigo, c.grupoCodigo, c.federacion)}` : ''],
  ]));
  for (const oficial of c.clasificacionOficial) {
    if (oficial.equipoCodigo) enlacesEquipo[oficial.equipo] =
      `/equipo/${slugEquipo(c.temporadaCodigo, oficial.equipoCodigo, c.competicionCodigo, c.grupoCodigo, c.federacion)}`;
  }
  return (
    <>
      <div className="mb-5 text-xs text-[#5C646C]">
        <Link className="hover:text-club hover:underline" href={`/competiciones?federacion=${c.federacion}`}>Competiciones</Link>
        <span className="mx-2">/</span><span>{c.categoria}</span><span className="mx-2">/</span><span>{c.temporada}</span>
      </div>
      <div className="mb-5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span className="insignia">{c.temporada}</span><span className="insignia">{c.categoria}</span>
          <span className="insignia">{c.ambito}</span>
          <span className="insignia insignia-verde">{datosFederacion(c.federacion).nombre}</span>
          {c.provincias.map((x) => <span key={x} className="insignia insignia-roja">{x}</span>)}
        </div>
        <h2 className="font-display text-3xl uppercase tracking-wide">{c.nombre}</h2>
        <p className="mt-1 text-sm text-[#5C646C]">{c.grupo} · {c.modalidad} · {c.genero}</p>
      </div>
      <NavegacionCompeticion slug={slug} />

      {canonico && <div className="mb-6 border-l-4 border-club bg-white p-3 text-[12px] leading-5">
        <b>Este grupo está importado en el canónico</b>
        {canonico.visibility_state === 'completa'
          ? <>: sus {canonico.partidos_conocidos ?? 0} partidos están completos y verificados</>
          : <>: {canonico.partidos_conocidos ?? 0} partidos, completo hasta la jornada {canonico.complete_through_matchday ?? '—'}</>}
        {canonico.complete_through_matchday !== null && canonico.visibility_state !== 'completa'
          ? ' (la temporada sigue en juego: lo que falta no es un cero, es que aún no se ha jugado)' : ''}.
        {' '}<Link className="text-club hover:underline" href={`/canonico/${c.federacion}/${c.grupoCodigo}`}>
          Ver la ficha del canónico: resultados, actas, goleadores y clasificación →
        </Link>
      </div>}

      {variantes.length > 0 && <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="mr-1 font-display text-xs uppercase text-[#5C646C]">Otras temporadas:</span>
        {variantes.map((v) => <Link key={v.slug} href={`/competicion/${v.slug}`}
          className="boton-secundario !min-h-0 !px-2.5 !py-1.5">{v.temporada}</Link>)}
      </div>}

      <div className="mb-6 grid grid-cols-2 gap-px border border-[#D6D6D4] bg-[#D6D6D4] sm:grid-cols-4">
        {([['Jornadas', c.jornadas], ['Partidos', c.partidos], ['Resultados', c.resultados], ['Goles', goles]] as const).map(([k, v]) => (
          <div key={k} className="bg-white p-3"><p className="font-display text-2xl">{v}</p><p className="text-[11px] uppercase tracking-wider text-[#5C646C]">{k}</p></div>
        ))}
      </div>

      <Bloque titulo={c.cobertura.completa ? 'Datos disponibles completos' : `Cobertura de datos · ${c.cobertura.porcentaje}%`}
        pie={c.cobertura.completa
          ? (c.cobertura.actasDisponibles ? 'Todas las jornadas y actas disponibles están analizadas.'
            : 'Calendario, resultados y clasificación completos; esta fuente no se consulta a nivel de acta individual.')
          : `${c.cobertura.trabajosPendientes} trabajos pendientes`}>
        <div className="p-4">
          <div className="mb-4 h-3 overflow-hidden rounded bg-[#EDF0ED]">
            <div className={`h-full ${c.cobertura.completa ? 'bg-[#1F7A46]' : 'bg-club'}`}
              style={{ width: `${c.cobertura.porcentaje}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <p><span className="block text-xs text-[#5C646C]">Jornadas</span>{c.cobertura.jornadasGuardadas}/{c.cobertura.jornadasEsperadas}</p>
            <p><span className="block text-xs text-[#5C646C]">Actas</span>{c.cobertura.actasDisponibles
              ? `${c.cobertura.actasProcesadas}/${c.cobertura.actasLocalizadas}` : 'No incluidas por la fuente'}</p>
            <p><span className="block text-xs text-[#5C646C]">Calendario</span>{c.cobertura.calendarioListo ? 'Disponible' : 'Pendiente'}</p>
            <p><span className="block text-xs text-[#5C646C]">Clasificación</span>{c.cobertura.clasificacionLista ? 'Disponible' : 'Pendiente'}</p>
          </div>
        </div>
      </Bloque>

      {tabla.length > 0 && <section id="clasificacion" className="scroll-mt-4">
        <Bloque titulo="Clasificación actual" pie={c.clasificacionOficial.length
          ? `Tabla oficial guardada por la federación${diferenciasOficiales ? ` · ${diferenciasOficiales} diferencias frente al cálculo desde resultados` : ' · coincide con los resultados recogidos'}.`
          : 'Reconstruida con los resultados disponibles; la tabla oficial todavía no está estructurada.'}>
          <Tabla filas={tabla} enlacesEquipo={enlacesEquipo} />
        </Bloque>
      </section>}

      <section id="jornadas" className="scroll-mt-4">
        <Bloque titulo="Recorrido por jornadas" pie="Cada jornada incluye sus partidos, la clasificación de ese momento y acceso a las actas disponibles.">
          <div className="grid grid-cols-4 gap-px bg-[#EDF0ED] sm:grid-cols-7 lg:grid-cols-10">
            {jornadas.map((j) => {
              const partidos = c.partidosLista.filter((p) => p.jornada === j);
              const jugados = partidos.filter((p) => p.golesLocal != null).length;
              return <Link key={j} href={`/competicion/${c.slug}/jornada/${j}`}
                className="bg-white p-3 text-center hover:bg-club-claro hover:text-club-oscuro">
                <span className="block font-display text-lg">{j}</span>
                <span className="block text-[10px] text-[#5C646C]">{jugados}/{partidos.length || '—'}</span>
              </Link>;
            })}
          </div>
          {jornadas.length === 0 && <p className="p-5 text-sm text-[#5C646C]">Las jornadas aún no están estructuradas.</p>}
          <div className="border-t border-[#EDF0ED] p-3 text-right">
            <Link href={`/competicion/${c.slug}/calendario`} className="boton-secundario">Ver calendario completo →</Link>
          </div>
        </Bloque>
      </section>

      <section id="estadisticas" className="scroll-mt-4">
        {tabla.length > 1 && <Bloque titulo="Evolución de puntos por jornada" pie="El color representa los puntos acumulados de cada equipo."><MapaCalor partidos={c.partidosLista} /></Bloque>}
        {tabla.length > 1 && <Bloque titulo="Ataque y defensa por equipo" pie="Comparación de goles a favor y en contra."><RendimientoEquipos filas={tabla} /></Bloque>}
        <Bloque titulo="Distribución temporal de los goles" pie="Calculada desde los minutos registrados en las actas."><DistribucionGoles tramos={c.golesPorTramo} /></Bloque>
      </section>

      <section id="jugadores" className="scroll-mt-4">
        {c.jugadores.length > 0 && <Bloque titulo="Rendimiento de jugadores" pie="Cada jugador queda vinculado al equipo concreto de este grupo; los minutos son estimados.">
          <div className="overflow-x-auto"><table className="w-full text-sm tabular-nums">
            <thead><tr className="border-b border-[#D6D6D4] text-xs uppercase text-[#5C646C]">
              <th className="p-2 text-left">Jugador</th><th className="p-2 text-left">Equipo</th>
              <th className="p-2 text-right">Conv.</th><th className="p-2 text-right">PJ</th><th className="p-2 text-right">Tit.</th>
              <th className="p-2 text-right">Min.</th><th className="p-2 text-right">Goles</th><th className="p-2 text-right">Tarjetas</th>
            </tr></thead>
            <tbody>{c.jugadores.slice(0, 20).map((j) => <tr key={`${j.codigo ?? j.nombre}-${j.equipoCodigo ?? j.equipo}`} className="border-b border-[#EDF0ED]">
              <td className="p-2">{j.codigo ? <Link className="hover:underline" href={`/jugador/${slugJugador(j.codigo, c.federacion)}`}>{j.nombre}</Link> : j.nombre}</td>
              <td className="p-2 text-[#5C646C]">{j.equipoCodigo
                ? <Link className="hover:text-club hover:underline" href={`/equipo/${slugEquipo(c.temporadaCodigo, j.equipoCodigo, c.competicionCodigo, c.grupoCodigo, c.federacion)}`}>{j.equipo}</Link>
                : j.equipo}</td>
              <td className="p-2 text-right">{j.convocatorias}</td><td className="p-2 text-right">{j.partidos}</td><td className="p-2 text-right">{j.titularidades}</td>
              <td className="p-2 text-right">{j.minutosEstimados}</td><td className="p-2 text-right font-semibold">{j.goles}</td>
              <td className="p-2 text-right">{j.tarjetas}</td>
            </tr>)}</tbody>
          </table></div>
          <div className="border-t border-[#EDF0ED] p-3 text-right"><Link className="boton-secundario" href={`/competicion/${c.slug}/jugadores`}>Ver todos y ordenar →</Link></div>
        </Bloque>}
        {c.jugadores.length === 0 && <Bloque titulo="Jugadores pendientes">
          <p className="p-5 text-sm leading-6 text-[#5C646C]">La competición está localizada, pero todavía no hay actas analizadas suficientes para formar sus plantillas.</p>
        </Bloque>}
      </section>
    </>
  );
}
