import Link from 'next/link';
import { notFound } from 'next/navigation';
import { datosFederacion, jugadorLocal } from '@/lib/repositorio-local';
import { insigniaForma } from '@/lib/forma-equipo';
import { Bloque } from '@/componentes/Bloque';
import { TrayectoriaJugador } from '@/componentes/TrayectoriaJugador';
import { INSIGNIA, INSIGNIA_ROJA, INSIGNIA_VERDE } from '@/componentes/ui/legado';

/**
 * El resultado de una actuación, como insignia: **V-E-D** (Victoria/Empate/Derrota) y color, nunca
 * sólo color (DESIGN.md §Color). El `resultado` que llega del repositorio es el `Signo` `G/E/P` del
 * dato; la letra visible la traduce `lib/forma-equipo.ts`. Sin resultado no se inventa una letra.
 */
function InsigniaResultado({ signo }: { signo: 'G' | 'E' | 'P' | null }) {
  if (signo === null) return <span className={`${INSIGNIA}`}>—</span>;
  const { letra, etiqueta } = insigniaForma(signo);
  const color = signo === 'G' ? INSIGNIA_VERDE : signo === 'P' ? INSIGNIA_ROJA : '';
  return <span className={`insignia ${color}`} title={etiqueta}>{letra}</span>;
}

/**
 * Ficha de jugador leída **de las colas SQLite**, el camino antiguo. Puente, igual que
 * `EquipoDesdeCola`: se conserva porque los enlaces que ya existen llevan el código federativo, y
 * porque hoy trae más datos que el canónico (calcula convocatorias, minutos y goles desde las actas,
 * y `analytics` sigue vacía). No crece y se retira cuando la migración termine.
 *
 * El cuerpo es el de siempre; sólo cambia la firma para poder despachar desde la ruta.
 */
export async function JugadorDesdeCola({ codigo }: { codigo: string }) {
  const j = jugadorLocal(codigo);
  if (!j) notFound();
  const minutos = j.contextos.reduce((n, c) => n + c.minutosEstimados, 0);
  const golesPor90 = minutos >= 90 ? (j.goles * 90 / minutos).toFixed(2) : '—';
  return <>
    <div className="mb-5 text-xs text-[var(--texto-suave)]">
      <Link href={`/jugadores?federacion=${j.federacion}`} className="hover:text-club hover:underline">Jugadores</Link>
      <span className="mx-2">/</span><span>{j.nombre}</span>
    </div>
    <div className="flex flex-wrap gap-2"><span className={`insignia ${INSIGNIA_VERDE}`}>{datosFederacion(j.federacion).nombre}</span>
      <span className={`${INSIGNIA}`}>Código federativo {j.codigo}</span></div>
    <h2 className="mt-1 font-display text-3xl uppercase">{j.nombre}</h2>
    {j.alias.length > 1 && <p className="mt-2 text-xs text-[var(--texto-suave)]">También aparece como: {j.alias.slice(1).join(' · ')}</p>}

    <div className="my-6 grid grid-cols-2 gap-px border border-[var(--borde-fuerte)] bg-[var(--borde-fuerte)] sm:grid-cols-4 lg:grid-cols-8">
      {([['Conv.', j.convocatorias], ['PJ', j.partidos], ['Tit.', j.titularidades],
        ['Min. est.', minutos], ['Goles', j.goles], ['G/90 est.', golesPor90],
        ['Amarillas', j.amarillas + j.doblesAmarillas], ['Rojas', j.rojas]] as const)
        .map(([k, v]) => <div key={k} className="bg-[var(--fondo-elevado)] p-3">
          <p className="font-display text-2xl">{v}</p><p className="text-etiqueta tracking-wider text-[var(--texto-suave)]">{k}</p>
        </div>)}
    </div>

    <div className="mb-6 border-l-4 border-club bg-[var(--fondo-elevado)] px-4 py-3 text-sm leading-6 text-[var(--texto-suave)]">
      Una convocatoria no equivale a jugar. Los suplentes sólo suman un partido cuando el acta registra
      su entrada o existe un gol que confirma su participación. Los minutos son estimados a partir de
      titularidades y sustituciones.
    </div>

    <Bloque titulo="Evolución por temporada" pie="Cada temporada suma todos sus equipos, que se detallan debajo.">
      <TrayectoriaJugador temporadas={j.porTemporada} />
      <div className="overflow-x-auto border-t border-[var(--fondo-sutil)]"><table className="w-full text-sm tabular-nums">
        <thead><tr className="border-b border-[var(--borde-fuerte)] text-xs text-[var(--texto-suave)]">
          <th className="p-2 text-left">Temporada</th><th className="p-2 text-right">Equipos</th>
          <th className="p-2 text-right">Conv.</th><th className="p-2 text-right">PJ</th>
          <th className="p-2 text-right">Tit.</th><th className="p-2 text-right">Min.</th>
          <th className="p-2 text-right">Goles</th><th className="p-2 text-right">TA</th><th className="p-2 text-right">TR</th>
        </tr></thead>
        <tbody>{j.porTemporada.map((t) => <tr key={t.temporadaCodigo} className="border-b border-[var(--fondo-sutil)]">
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
        <thead><tr className="border-b border-[var(--borde-fuerte)] text-xs text-[var(--texto-suave)]">
          <th className="p-2 text-left">Temporada y equipo</th><th className="p-2 text-left">Competición</th>
          <th className="p-2 text-right">Conv.</th><th className="p-2 text-right">PJ</th>
          <th className="p-2 text-right">Tit.</th><th className="p-2 text-right">Min.</th>
          <th className="p-2 text-right">G</th><th className="p-2 text-right">TA</th><th className="p-2 text-right">TR</th>
        </tr></thead>
        <tbody>{j.contextos.map((c) => <tr key={c.clave} className="border-b border-[var(--fondo-sutil)] align-top">
          <td className="p-2"><span className="block text-xs text-[var(--texto-suave)]">{c.temporada} · {c.categoria}</span>
            {c.equipoSlug ? <Link href={`/equipo/${c.equipoSlug}`} className="font-medium hover:text-club hover:underline">{c.equipo}</Link> : c.equipo}</td>
          <td className="p-2"><Link href={`/competicion/${c.grupoSlug}`} className="hover:text-club hover:underline">{c.competicion}</Link>
            <span className="block text-xs text-[var(--texto-suave)]">{c.grupo}</span></td>
          <td className="p-2 text-right">{c.convocatorias}</td><td className="p-2 text-right">{c.partidos}</td>
          <td className="p-2 text-right">{c.titularidades}</td><td className="p-2 text-right">{c.minutosEstimados}</td>
          <td className="p-2 text-right font-semibold">{c.goles}{c.golesPenalti ? <span className="block text-etiqueta text-[var(--texto-suave)]">{c.golesPenalti} pen.</span> : null}</td>
          <td className="p-2 text-right">{c.amarillas + c.doblesAmarillas}</td><td className="p-2 text-right">{c.rojas}</td>
        </tr>)}</tbody>
      </table></div>
    </Bloque>

    <Bloque titulo="Partidos y actas recientes" pie="Resultado desde el punto de vista del jugador.">
      <ul>{j.actuaciones.slice(0, 40).map((a) => <li key={a.actaSlug}
        className="grid gap-2 border-t border-[var(--fondo-sutil)] px-4 py-3 text-sm first:border-t-0 sm:grid-cols-[5rem_1fr_auto]">
        <div><InsigniaResultado signo={a.resultado} />
          <span className="mt-1 block text-xs text-[var(--texto-suave)]">J{a.jornada}</span></div>
        <div><p className="font-medium">{a.equipo ?? 'Equipo no enlazado'} · vs. {a.rival ?? 'rival no enlazado'}</p>
          <p className="text-xs text-[var(--texto-suave)]">{a.temporada} · {a.competicion} · {a.condicion === 'titulares' ? 'Titular' : a.condicion === 'convocados' ? 'Convocado · condición no publicada' : a.jugado ? `Entró ${a.minutoEntrada ?? '—'}′` : 'Suplente no utilizado'}</p></div>
        <div className="text-left text-xs sm:text-right"><p>{a.goles ? `${a.goles} gol${a.goles === 1 ? '' : 'es'}` : `${a.minutosEstimados} min. est.`}</p>
          <Link className="text-club hover:underline" href={`/acta/${a.actaSlug}`}>Ver acta</Link></div>
      </li>)}</ul>
    </Bloque>
  </>;
}
