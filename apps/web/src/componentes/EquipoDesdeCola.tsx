import Link from 'next/link';
import { notFound } from 'next/navigation';
import { datosFederacion, equipoLocal, slugActa, slugClub, slugJugador } from '@/lib/repositorio-local';
import { Bloque } from '@/componentes/Bloque';
import { Puntos } from '@/componentes/Puntos';
import { Racha } from '@/componentes/Racha';
import { Evolucion } from '@/componentes/Evolucion';
import type { Signo } from '@facylf/dominio';

/**
 * Ficha de equipo leída **de las colas SQLite**, el camino antiguo.
 *
 * Se conserva tal cual, sin tocar, como puente mientras la migración al canónico avanza. Dos motivos:
 *
 * 1. **Los enlaces que ya existen apuntan aquí.** Las páginas que todavía no se han migrado
 *    (`/equipos`, `/competicion/…`, `/jugador/…`) construyen rutas con el slug antiguo, que codifica
 *    federación, temporada, competición, grupo y código de equipo. Si esta ruta dejara de resolverlo,
 *    media web se quedaría con enlaces muertos de un día para otro.
 * 2. **Hoy trae más datos que el canónico.** Calcula la plantilla, los puntos, la racha y las medias a
 *    partir de las actas de la cola, y el canónico **todavía no** puede: `analytics` está vacía y no hay
 *    código que la llene. Sustituirlo ahora sería enseñar menos, no más.
 *
 * Pero este camino **no es el objetivo y no debe crecer**: leer las colas dentro de una petición de
 * usuario es justo lo que prohíbe [ARQUITECTURA.md](../../docs/plataforma-web/ARQUITECTURA.md) §7 («cero
 * consultas a archivos federativos desde una petición de usuario»). Se retira cuando las páginas que
 * enlazan aquí estén migradas y el agregado por jugador exista.
 *
 * Lo único que cambió el rediseño es la presentación: los grises y el ámbar a mano pasan a tokens y a
 * las piezas compartidas de `globals.css`. Los números y el orden de lectura son los mismos.
 */
export async function EquipoDesdeCola({ slug }: { slug: string }) {
  const e = equipoLocal(slug);
  if (!e) notFound();
  const jugados = e.partidosLista.filter((p) => p.golesLocal != null);
  const victorias = jugados.filter((p) => p.codLocal === e.codigo
    ? (p.golesLocal ?? 0) > (p.golesVisitante ?? 0)
    : (p.golesVisitante ?? 0) > (p.golesLocal ?? 0)).length;
  const empates = jugados.filter((p) => p.golesLocal === p.golesVisitante).length;
  const derrotas = jugados.length - victorias - empates;
  const porteriasCero = jugados.filter((p) => p.codLocal === e.codigo ? p.golesVisitante === 0 : p.golesLocal === 0).length;
  const sinMarcar = jugados.filter((p) => p.codLocal === e.codigo ? p.golesLocal === 0 : p.golesVisitante === 0).length;
  const ambosMarcan = jugados.filter((p) => (p.golesLocal ?? 0) > 0 && (p.golesVisitante ?? 0) > 0).length;
  const puntos = victorias * 3 + empates;
  const balanceSede = (local: boolean) => {
    const lista = jugados.filter((p) => (p.codLocal === e.codigo) === local);
    const v = lista.filter((p) => local ? (p.golesLocal ?? 0) > (p.golesVisitante ?? 0)
      : (p.golesVisitante ?? 0) > (p.golesLocal ?? 0)).length;
    const emp = lista.filter((p) => p.golesLocal === p.golesVisitante).length;
    return { partidos: lista.length, puntos: v * 3 + emp };
  };
  const casa = balanceSede(true), fuera = balanceSede(false);
  const racha: Signo[] = jugados.map((p) => {
    if (p.golesLocal === p.golesVisitante) return 'E';
    const gana = p.codLocal === e.codigo
      ? (p.golesLocal ?? 0) > (p.golesVisitante ?? 0)
      : (p.golesVisitante ?? 0) > (p.golesLocal ?? 0);
    return gana ? 'G' : 'P';
  });
  const continuidad = e.otrosContextos.filter((x) => x.categoria === e.categoria &&
    x.provincias.join('|') === e.provincias.join('|'));
  const otrasCategorias = e.otrosContextos.filter((x) => !continuidad.some((c) => c.slug === x.slug));
  return (
    <>
      <nav aria-label="Ruta" className="meta mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/equipos?federacion=${e.federacion}`} className="hover:text-[var(--accion)] hover:underline">Equipos</Link>
        <span aria-hidden>/</span>
        <Link href={`/competicion/${e.grupoSlug}`} className="hover:text-[var(--accion)] hover:underline">{e.competicion}</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{e.nombre}</span>
      </nav>
      <header className="mb-6">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <span className="insignia">{e.temporada}</span><span className="insignia">{e.categoria}</span>
          <span className="insignia insignia-verde">{datosFederacion(e.federacion).nombre}</span>
          {e.provincias.map((x) => <span key={x} className="insignia insignia-roja">{x}</span>)}
        </div>
        <h2 className="font-display text-3xl uppercase">{e.nombre}</h2>
        <p className="mt-1 text-sm text-[var(--texto-suave)]">
          <Link className="hover:text-[var(--accion)] hover:underline" href={`/competicion/${e.grupoSlug}`}>{e.competicion} · {e.grupo}</Link>
          <span className="mx-2" aria-hidden>·</span>
          <Link className="font-medium text-[var(--accion)] hover:underline" href={`/club/${slugClub(e.temporadaCodigo, e.codigo, e.federacion)}`}>Ficha del club en {e.temporada}</Link>
        </p>
      </header>

      <p className="aviso mb-6">
        Esta ficha corresponde únicamente a este equipo, grupo y temporada. Otros equipos del mismo club
        en categorías distintas permanecen separados.
      </p>

      <div className="rejilla-datos mb-6 grid-cols-2 sm:grid-cols-4">
        {([['Jugados', jugados.length], ['Victorias', victorias], ['Balance', `${victorias}G · ${empates}E · ${derrotas}P`], ['Goles', `${e.golesFavor}-${e.golesContra}`]] as const).map(([k, v]) => (
          <div key={k}><span className="dato-valor">{v}</span><span className="dato-etiqueta">{k}</span></div>
        ))}
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <Bloque titulo="Puntos acumulados"><Puntos partidos={e.partidosLista} equipo={e.nombre} /></Bloque>
        <Bloque titulo="Posición jornada a jornada"><Evolucion partidos={e.partidosLista} equipo={e.nombre} /></Bloque>
        <Bloque titulo="Rendimiento">
          <div className="space-y-4 p-4"><Racha racha={racha} /><div className="grid grid-cols-2 gap-3 text-sm">
            <p><span className="text-[var(--texto-suave)]">Porterías a cero:</span> {porteriasCero}</p>
            <p><span className="text-[var(--texto-suave)]">Diferencia:</span> {e.golesFavor - e.golesContra > 0 ? '+' : ''}{e.golesFavor - e.golesContra}</p>
            <p><span className="text-[var(--texto-suave)]">Media a favor:</span> {jugados.length ? (e.golesFavor / jugados.length).toFixed(2) : '—'}</p>
            <p><span className="text-[var(--texto-suave)]">Media en contra:</span> {jugados.length ? (e.golesContra / jugados.length).toFixed(2) : '—'}</p>
          </div></div>
        </Bloque>
        <Bloque titulo="Radiografía para preparar el rival" pie="Indicadores descriptivos del grupo y temporada seleccionados.">
          <div className="rejilla-datos grid-cols-2 text-sm sm:grid-cols-3">
            {[
              ['Puntos/partido', jugados.length ? (puntos / jugados.length).toFixed(2) : '—'],
              ['% victorias', jugados.length ? `${Math.round(victorias / jugados.length * 100)}%` : '—'],
              ['% porterías a cero', jugados.length ? `${Math.round(porteriasCero / jugados.length * 100)}%` : '—'],
              ['% sin marcar', jugados.length ? `${Math.round(sinMarcar / jugados.length * 100)}%` : '—'],
              ['Ambos marcan', jugados.length ? `${Math.round(ambosMarcan / jugados.length * 100)}%` : '—'],
              ['Casa / fuera', `${casa.puntos}/${fuera.puntos} pts`],
            ].map(([titulo, valor]) => <div key={titulo}>
              <span className="dato-valor text-xl">{valor}</span><span className="dato-etiqueta">{titulo}</span>
            </div>)}
          </div>
        </Bloque>
      </div>

      <Bloque titulo={`Plantilla · ${e.plantilla.length} jugadores`}
        pie="Se forma sólo con las actas de este equipo dentro de esta competición y grupo.">
        {e.plantilla.length > 0
          ? <div className="overflow-x-auto"><table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Plantilla de {e.nombre} en {e.competicion}, {e.grupo}, temporada {e.temporada}</caption>
              <thead><tr className="cabecera-tabla">
                <th scope="col" className="p-2 text-left">Jugador</th><th scope="col" className="p-2 text-right">Conv.</th>
                <th scope="col" className="p-2 text-right">PJ</th><th scope="col" className="p-2 text-right">Tit.</th>
                <th scope="col" className="p-2 text-right">Min.</th><th scope="col" className="p-2 text-right">Goles</th>
                <th scope="col" className="p-2 text-right">Tarjetas</th>
              </tr></thead>
              <tbody>{e.plantilla.map((j) => <tr key={j.codigo ?? j.nombre} className="border-b border-[var(--borde)]">
                <td className="p-2">{j.codigo ? <Link href={`/jugador/${slugJugador(j.codigo, e.federacion)}`} className="hover:text-[var(--accion)] hover:underline">{j.nombre}</Link> : j.nombre}</td>
                <td className="p-2 text-right">{j.convocatorias}</td><td className="p-2 text-right">{j.partidos}</td>
                <td className="p-2 text-right">{j.titularidades}</td><td className="p-2 text-right">{j.minutosEstimados}</td>
                <td className="p-2 text-right font-semibold">{j.goles}</td><td className="p-2 text-right">{j.tarjetas}</td>
              </tr>)}</tbody>
            </table></div>
          : <p className="p-5 text-sm leading-6 text-[var(--texto-suave)]">Todavía no hay actas analizadas suficientes para formar esta plantilla.</p>}
      </Bloque>

      <Bloque titulo="Calendario y resultados">
        <ul>{e.partidosLista.map((p) => <li key={`${p.jornada}-${p.orden}`}
          className="grid items-center gap-2 border-t border-[var(--borde)] px-4 py-3 text-sm first:border-t-0 sm:grid-cols-[3rem_1fr_auto_1fr_5rem]">
          <Link href={`/competicion/${e.grupoSlug}/jornada/${p.jornada}`} className="font-display text-xs text-[var(--accion)] hover:underline">J{p.jornada}</Link>
          <span className="text-left sm:text-right">{p.local}</span>
          <span className="text-center font-display">{p.golesLocal == null ? '–' : `${p.golesLocal}-${p.golesVisitante}`}</span>
          <span>{p.visitante}</span>
          <span className="text-right text-xs">{p.codActa && p.actaLista
            ? <Link className="text-[var(--accion)] hover:underline" href={`/acta/${slugActa(e.temporadaCodigo, e.competicionCodigo, e.grupoCodigo, p.jornada, p.codActa, e.federacion)}`}>Acta</Link> : ''}</span>
        </li>)}</ul>
      </Bloque>

      {continuidad.length > 0 && <Bloque titulo="Trayectoria en otras temporadas"
        pie="Mismo nombre, categoría y ámbito territorial; cada temporada mantiene su plantilla independiente.">
        <div className="grid gap-px bg-[var(--borde)] sm:grid-cols-2">
          {continuidad.slice(0, 20).map((x) => <Link key={x.slug}
            className="bg-[var(--fondo-elevado)] p-3 text-sm hover:text-[var(--accion)]" href={`/equipo/${x.slug}`}>
            <span className="font-medium">{x.temporada} · {x.categoria}</span>
            <span className="mt-1 block text-xs text-[var(--texto-suave)]">{x.competicion} · {x.grupo}</span>
          </Link>)}
        </div>
      </Bloque>}
      {otrasCategorias.length > 0 && <Bloque titulo="Otros equipos del club"
        pie="Comparten nombre de club, pero son categorías o grupos diferentes: sus jugadores no son compañeros de esta plantilla.">
        <div className="grid gap-px bg-[var(--borde)] sm:grid-cols-2">
          {otrasCategorias.slice(0, 30).map((x) => <Link key={x.slug}
            className="bg-[var(--fondo-elevado)] p-3 text-sm hover:text-[var(--accion)]" href={`/equipo/${x.slug}`}>
            <span className="font-medium">{x.temporada} · {x.categoria}</span>
            <span className="mt-1 block text-xs text-[var(--texto-suave)]">{x.competicion} · {x.grupo}</span>
          </Link>)}
        </div>
      </Bloque>}
    </>
  );
}
