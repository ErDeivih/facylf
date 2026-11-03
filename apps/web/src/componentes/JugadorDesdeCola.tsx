import Link from 'next/link';
import { notFound } from 'next/navigation';
import { datosFederacion, jugadorLocal } from '@/lib/repositorio-local';
import { Bloque } from '@/componentes/Bloque';
import { TrayectoriaJugador } from '@/componentes/TrayectoriaJugador';

/**
 * Ficha de jugador leída **de las colas SQLite**, el camino antiguo. Puente, igual que
 * `EquipoDesdeCola`: se conserva porque los enlaces que ya existen llevan el código federativo, y
 * porque hoy trae más datos que el canónico (calcula convocatorias, minutos y goles desde las actas,
 * y `analytics` sigue vacía). No crece y se retira cuando la migración termine.
 *
 * El rediseño sólo cambia la presentación: tokens en lugar de grises a mano, encabezados de tabla con
 * `scope` y `caption`, y el aviso convertido en la pieza compartida `.aviso`.
 */
export async function JugadorDesdeCola({ codigo }: { codigo: string }) {
  const j = jugadorLocal(codigo);
  if (!j) notFound();
  const minutos = j.contextos.reduce((n, c) => n + c.minutosEstimados, 0);
  const golesPor90 = minutos >= 90 ? (j.goles * 90 / minutos).toFixed(2) : '—';
  return <>
    <nav aria-label="Ruta" className="meta mb-5 flex flex-wrap items-center gap-2">
      <Link href={`/jugadores?federacion=${j.federacion}`} className="hover:text-[var(--accion)] hover:underline">Jugadores</Link>
      <span aria-hidden>/</span><span aria-current="page">{j.nombre}</span>
    </nav>
    <div className="flex flex-wrap gap-2"><span className="insignia insignia-verde">{datosFederacion(j.federacion).nombre}</span>
      <span className="insignia">Código federativo {j.codigo}</span></div>
    <h2 className="mt-1 font-display text-3xl uppercase">{j.nombre}</h2>
    {j.alias.length > 1 && <p className="meta mt-2">También aparece como: {j.alias.slice(1).join(' · ')}</p>}

    <div className="rejilla-datos my-6 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
      {([['Conv.', j.convocatorias], ['PJ', j.partidos], ['Tit.', j.titularidades],
        ['Min. est.', minutos], ['Goles', j.goles], ['G/90 est.', golesPor90],
        ['Amarillas', j.amarillas + j.doblesAmarillas], ['Rojas', j.rojas]] as const)
        .map(([k, v]) => <div key={k}>
          <span className="dato-valor">{v}</span><span className="dato-etiqueta">{k}</span>
        </div>)}
    </div>

    <p className="aviso mb-6">
      Una convocatoria no equivale a jugar. Los suplentes sólo suman un partido cuando el acta registra
      su entrada o existe un gol que confirma su participación. Los minutos son estimados a partir de
      titularidades y sustituciones.
    </p>

    <Bloque titulo="Evolución por temporada" pie="Cada temporada suma todos sus equipos, que se detallan debajo.">
      <TrayectoriaJugador temporadas={j.porTemporada} />
      <div className="overflow-x-auto border-t border-[var(--borde)]"><table className="w-full text-sm tabular-nums">
        <caption className="sr-only">Totales de {j.nombre} por temporada</caption>
        <thead><tr className="cabecera-tabla">
          <th scope="col" className="p-2 text-left">Temporada</th><th scope="col" className="p-2 text-right">Equipos</th>
          <th scope="col" className="p-2 text-right">Conv.</th><th scope="col" className="p-2 text-right">PJ</th>
          <th scope="col" className="p-2 text-right">Tit.</th><th scope="col" className="p-2 text-right">Min.</th>
          <th scope="col" className="p-2 text-right">Goles</th><th scope="col" className="p-2 text-right">TA</th>
          <th scope="col" className="p-2 text-right">TR</th>
        </tr></thead>
        <tbody>{j.porTemporada.map((t) => <tr key={t.temporadaCodigo} className="border-b border-[var(--borde)]">
          <td className="p-2 font-medium">{t.temporada}</td><td className="p-2 text-right">{t.equipos}</td>
          <td className="p-2 text-right">{t.convocatorias}</td><td className="p-2 text-right">{t.partidos}</td>
          <td className="p-2 text-right">{t.titularidades}</td><td className="p-2 text-right">{t.minutosEstimados}</td>
          <td className="p-2 text-right font-semibold">{t.goles}</td><td className="p-2 text-right">{t.amarillas + t.doblesAmarillas}</td>
          <td className="p-2 text-right">{t.rojas}</td>
        </tr>)}</tbody>
      </table></div>
    </Bloque>

    <Bloque titulo="Desglose por temporada, equipo y competición"
      pie="Si un jugador participa con dos categorías o equipos en el mismo año, aparece en filas distintas.">
      <div className="overflow-x-auto"><table className="w-full text-sm tabular-nums">
        <caption className="sr-only">Actuaciones de {j.nombre} por temporada, equipo y competición</caption>
        <thead><tr className="cabecera-tabla">
          <th scope="col" className="p-2 text-left">Temporada y equipo</th><th scope="col" className="p-2 text-left">Competición</th>
          <th scope="col" className="p-2 text-right">Conv.</th><th scope="col" className="p-2 text-right">PJ</th>
          <th scope="col" className="p-2 text-right">Tit.</th><th scope="col" className="p-2 text-right">Min.</th>
          <th scope="col" className="p-2 text-right">G</th><th scope="col" className="p-2 text-right">TA</th><th scope="col" className="p-2 text-right">TR</th>
        </tr></thead>
        <tbody>{j.contextos.map((c) => <tr key={c.clave} className="border-b border-[var(--borde)] align-top">
          <td className="p-2"><span className="block text-xs text-[var(--texto-suave)]">{c.temporada} · {c.categoria}</span>
            {c.equipoSlug ? <Link href={`/equipo/${c.equipoSlug}`} className="font-medium hover:text-[var(--accion)] hover:underline">{c.equipo}</Link> : c.equipo}</td>
          <td className="p-2"><Link href={`/competicion/${c.grupoSlug}`} className="hover:text-[var(--accion)] hover:underline">{c.competicion}</Link>
            <span className="block text-xs text-[var(--texto-suave)]">{c.grupo}</span></td>
          <td className="p-2 text-right">{c.convocatorias}</td><td className="p-2 text-right">{c.partidos}</td>
          <td className="p-2 text-right">{c.titularidades}</td><td className="p-2 text-right">{c.minutosEstimados}</td>
          <td className="p-2 text-right font-semibold">{c.goles}{c.golesPenalti ? <span className="block text-xs text-[var(--texto-suave)]">{c.golesPenalti} pen.</span> : null}</td>
          <td className="p-2 text-right">{c.amarillas + c.doblesAmarillas}</td><td className="p-2 text-right">{c.rojas}</td>
        </tr>)}</tbody>
      </table></div>
    </Bloque>

    <Bloque titulo="Partidos y actas recientes" pie="Resultado desde el punto de vista del jugador.">
      <ul>{j.actuaciones.slice(0, 40).map((a) => <li key={a.actaSlug}
        className="grid gap-2 border-t border-[var(--borde)] px-4 py-3 text-sm first:border-t-0 sm:grid-cols-[5rem_1fr_auto]">
        <div><span className={`insignia ${a.resultado === 'G' ? 'insignia-verde' : a.resultado === 'P' ? 'insignia-roja' : ''}`}>{a.resultado ?? '—'}</span>
          <span className="meta mt-1 block">J{a.jornada}</span></div>
        <div><p className="font-medium">{a.equipo ?? 'Equipo no enlazado'} · vs. {a.rival ?? 'rival no enlazado'}</p>
          <p className="meta">{a.temporada} · {a.competicion} · {a.condicion === 'titulares' ? 'Titular' : a.condicion === 'convocados' ? 'Convocado · condición no publicada' : a.jugado ? `Entró ${a.minutoEntrada ?? '—'}′` : 'Suplente no utilizado'}</p></div>
        <div className="text-left text-xs sm:text-right"><p>{a.goles ? `${a.goles} gol${a.goles === 1 ? '' : 'es'}` : `${a.minutosEstimados} min. est.`}</p>
          <Link className="text-[var(--accion)] hover:underline" href={`/acta/${a.actaSlug}`}>Ver acta</Link></div>
      </li>)}</ul>
    </Bloque>
  </>;
}
