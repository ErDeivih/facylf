import Link from 'next/link';
import { notFound } from 'next/navigation';
import { datosFederacion, jugadorLocal } from '@/lib/repositorio-local';
import { Bloque } from '@/componentes/Bloque';
import { TrayectoriaJugador } from '@/componentes/TrayectoriaJugador';

export const revalidate = 60;

export default async function Jugador({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const j = jugadorLocal(codigo);
  if (!j) notFound();
  const minutos = j.contextos.reduce((n, c) => n + c.minutosEstimados, 0);
  const golesPor90 = minutos >= 90 ? (j.goles * 90 / minutos).toFixed(2) : '—';
  return <>
    <div className="mb-5 text-xs text-[#5C646C]">
      <Link href={`/jugadores?federacion=${j.federacion}`} className="hover:text-club hover:underline">Jugadores</Link>
      <span className="mx-2">/</span><span>{j.nombre}</span>
    </div>
    <div className="flex flex-wrap gap-2"><span className="insignia insignia-verde">{datosFederacion(j.federacion).nombre}</span>
      <span className="insignia">Código federativo {j.codigo}</span></div>
    <h2 className="mt-1 font-display text-3xl uppercase">{j.nombre}</h2>
    {j.alias.length > 1 && <p className="mt-2 text-xs text-[#5C646C]">También aparece como: {j.alias.slice(1).join(' · ')}</p>}

    <div className="my-6 grid grid-cols-2 gap-px border border-[#D6D6D4] bg-[#D6D6D4] sm:grid-cols-4 lg:grid-cols-8">
      {([['Conv.', j.convocatorias], ['PJ', j.partidos], ['Tit.', j.titularidades],
        ['Min. est.', minutos], ['Goles', j.goles], ['G/90 est.', golesPor90],
        ['Amarillas', j.amarillas + j.doblesAmarillas], ['Rojas', j.rojas]] as const)
        .map(([k, v]) => <div key={k} className="bg-white p-3">
          <p className="font-display text-2xl">{v}</p><p className="text-[10px] uppercase tracking-wider text-[#5C646C]">{k}</p>
        </div>)}
    </div>

    <div className="mb-6 border-l-4 border-club bg-white px-4 py-3 text-sm leading-6 text-[#5C646C]">
      Una convocatoria no equivale a jugar. Los suplentes sólo suman un partido cuando el acta registra
      su entrada o existe un gol que confirma su participación. Los minutos son estimados a partir de
      titularidades y sustituciones.
    </div>

    <Bloque titulo="Evolución por temporada" pie="Cada temporada suma todos sus equipos, que se detallan debajo.">
      <TrayectoriaJugador temporadas={j.porTemporada} />
      <div className="overflow-x-auto border-t border-[#EDF0ED]"><table className="w-full text-sm tabular-nums">
        <thead><tr className="border-b border-[#D6D6D4] text-xs uppercase text-[#5C646C]">
          <th className="p-2 text-left">Temporada</th><th className="p-2 text-right">Equipos</th>
          <th className="p-2 text-right">Conv.</th><th className="p-2 text-right">PJ</th>
          <th className="p-2 text-right">Tit.</th><th className="p-2 text-right">Min.</th>
          <th className="p-2 text-right">Goles</th><th className="p-2 text-right">TA</th><th className="p-2 text-right">TR</th>
        </tr></thead>
        <tbody>{j.porTemporada.map((t) => <tr key={t.temporadaCodigo} className="border-b border-[#EDF0ED]">
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
        <thead><tr className="border-b border-[#D6D6D4] text-xs uppercase text-[#5C646C]">
          <th className="p-2 text-left">Temporada y equipo</th><th className="p-2 text-left">Competición</th>
          <th className="p-2 text-right">Conv.</th><th className="p-2 text-right">PJ</th>
          <th className="p-2 text-right">Tit.</th><th className="p-2 text-right">Min.</th>
          <th className="p-2 text-right">G</th><th className="p-2 text-right">TA</th><th className="p-2 text-right">TR</th>
        </tr></thead>
        <tbody>{j.contextos.map((c) => <tr key={c.clave} className="border-b border-[#EDF0ED] align-top">
          <td className="p-2"><span className="block text-xs text-[#5C646C]">{c.temporada} · {c.categoria}</span>
            {c.equipoSlug ? <Link href={`/equipo/${c.equipoSlug}`} className="font-medium hover:text-club hover:underline">{c.equipo}</Link> : c.equipo}</td>
          <td className="p-2"><Link href={`/competicion/${c.grupoSlug}`} className="hover:text-club hover:underline">{c.competicion}</Link>
            <span className="block text-xs text-[#5C646C]">{c.grupo}</span></td>
          <td className="p-2 text-right">{c.convocatorias}</td><td className="p-2 text-right">{c.partidos}</td>
          <td className="p-2 text-right">{c.titularidades}</td><td className="p-2 text-right">{c.minutosEstimados}</td>
          <td className="p-2 text-right font-semibold">{c.goles}{c.golesPenalti ? <span className="block text-[10px] text-[#5C646C]">{c.golesPenalti} pen.</span> : null}</td>
          <td className="p-2 text-right">{c.amarillas + c.doblesAmarillas}</td><td className="p-2 text-right">{c.rojas}</td>
        </tr>)}</tbody>
      </table></div>
    </Bloque>

    <Bloque titulo="Partidos y actas recientes" pie="Resultado desde el punto de vista del jugador.">
      <ul>{j.actuaciones.slice(0, 40).map((a) => <li key={a.actaSlug}
        className="grid gap-2 border-t border-[#EDF0ED] px-4 py-3 text-sm first:border-t-0 sm:grid-cols-[5rem_1fr_auto]">
        <div><span className={`insignia ${a.resultado === 'G' ? 'insignia-verde' : a.resultado === 'P' ? 'insignia-roja' : ''}`}>{a.resultado ?? '—'}</span>
          <span className="mt-1 block text-xs text-[#5C646C]">J{a.jornada}</span></div>
        <div><p className="font-medium">{a.equipo ?? 'Equipo no enlazado'} · vs. {a.rival ?? 'rival no enlazado'}</p>
          <p className="text-xs text-[#5C646C]">{a.temporada} · {a.competicion} · {a.condicion === 'titulares' ? 'Titular' : a.condicion === 'convocados' ? 'Convocado · condición no publicada' : a.jugado ? `Entró ${a.minutoEntrada ?? '—'}′` : 'Suplente no utilizado'}</p></div>
        <div className="text-left text-xs sm:text-right"><p>{a.goles ? `${a.goles} gol${a.goles === 1 ? '' : 'es'}` : `${a.minutosEstimados} min. est.`}</p>
          <Link className="text-club hover:underline" href={`/acta/${a.actaSlug}`}>Ver acta</Link></div>
      </li>)}</ul>
    </Bloque>
  </>;
}
