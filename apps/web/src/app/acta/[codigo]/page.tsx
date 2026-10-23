import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { actaLocal, slugEquipo, slugJugador } from '@/lib/repositorio-local';
import { Bloque } from '@/componentes/Bloque';

export const revalidate = 60;

const etiquetaEvento: Record<string, string> = {
  gol: 'Gol', amarilla: 'Tarjeta amarilla', roja: 'Tarjeta roja',
  'doble-amarilla': 'Doble amarilla', entra: 'Entra', sale: 'Sale',
};

const etiquetaDesarrollo = (tipo: string, subtipo: string | null) => {
  if (tipo !== 'gol') return etiquetaEvento[tipo] ?? tipo;
  if (subtipo === 'penalti') return 'Gol de penalti';
  if (subtipo === 'propia-puerta') return 'Gol en propia puerta';
  return 'Gol';
};

const explicaIncidencia = (valor: string) => {
  if (valor === 'sin_arbitro') return 'La ficha federativa no muestra árbitro';
  if (valor.startsWith('titulares_atipicos:')) return `Alineación visible incompleta o atípica (${valor.split(':')[1]?.replace(';esperados:', '; esperados ')})`;
  /*
   * Y el caso de «faltan titulares», que hasta el 24/09/2026 compartía nombre con el anterior y por eso los
   * porcentajes no se podían interpretar: aquel juntaba «un equipo con 12 titulares en fútbol 11» —imposible,
   * anomalía de verdad— con «la ficha publica 10 donde se esperan 11» —una alineación incompleta—. Ahora se
   * dicen por separado, con esta frase.
   */
  if (valor.startsWith('titulares_incompletos:')) return `La ficha publica menos titulares de los esperados (${valor.split(':')[1]?.replace(';esperados:', '; esperados ')})`;
  if (valor.startsWith('descuadre_goles:')) return `El marcador y el desglose público de goles no coinciden (${valor.split(':')[1]})`;
  if (valor.startsWith('fuente_no_distingue_titulares_suplentes:')) return 'La federación publica los convocados de este equipo sin distinguir titulares y suplentes';
  if (valor === 'sin_cuerpo_tecnico') return 'La ficha no muestra cuerpo técnico';
  return valor.replaceAll('_', ' ');
};

export default async function Acta({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const a = actaLocal(codigo);
  if (!a) notFound();
  const p = a.partido;
  const nombreParticipante = (x: { nombre: string; dorsal: number | null }) =>
    x.nombre || `Dorsal ${x.dorsal ?? '—'}`;
  const hrefEquipo = (equipoCodigo: string | null) => equipoCodigo
    ? `/equipo/${slugEquipo(a.temporadaCodigo, equipoCodigo, a.competicionCodigo, a.grupoCodigo, a.federacion)}`
    : null;
  return (
    <>
      <div className="mb-5 text-xs text-[#5C646C]">
        <Link href="/competiciones" className="hover:text-club hover:underline">Competiciones</Link><span className="mx-2">/</span>
        <Link href={`/competicion/${a.grupoSlug}`} className="hover:text-club hover:underline">{a.competicion}</Link><span className="mx-2">/</span>
        <Link href={`/competicion/${a.grupoSlug}/jornada/${a.jornada}`} className="hover:text-club hover:underline">Jornada {a.jornada}</Link><span className="mx-2">/</span>
        <span>Acta</span>
      </div>
      <div className="mb-6 border border-[#D6D6D4] bg-white">
        <div className="border-b border-[#EDF0ED] px-4 py-3">
          <p className="font-display text-xs uppercase tracking-[0.15em] text-club">Acta {a.codigo} · {a.temporada}</p>
          <p className="mt-1 text-xs text-[#5C646C]">{a.competicion} · {a.grupo} · Jornada {a.jornada}</p>
        </div>
        {p ? <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-8">
          {hrefEquipo(p.codLocal) ? <Link href={hrefEquipo(p.codLocal)! as Route} className="text-right text-lg font-semibold hover:text-club hover:underline">{p.local}</Link> : <span className="text-right text-lg font-semibold">{p.local}</span>}
          <strong className="font-display text-4xl">{p.golesLocal == null ? '–' : `${p.golesLocal} – ${p.golesVisitante}`}</strong>
          {hrefEquipo(p.codVisitante) ? <Link href={hrefEquipo(p.codVisitante)! as Route} className="text-lg font-semibold hover:text-club hover:underline">{p.visitante}</Link> : <span className="text-lg font-semibold">{p.visitante}</span>}
        </div> : <p className="p-6 text-center text-sm text-[#5C646C]">Partido no enlazado todavía.</p>}
        {p && <p className="border-t border-[#EDF0ED] px-4 py-3 text-center text-xs text-[#5C646C]">
          {[p.fecha, p.hora, p.campo, p.arbitro].filter(Boolean).join(' · ')}
        </p>}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {(['local', 'visitante'] as const).map((lado) => {
          const titulo = lado === 'local' ? p?.local ?? 'Local' : p?.visitante ?? 'Visitante';
          const titulares = a.participantes.filter((x) => x.lado === lado && x.condicion === 'titulares');
          const suplentes = a.participantes.filter((x) => x.lado === lado && x.condicion === 'suplentes');
          const convocados = a.participantes.filter((x) => x.lado === lado && x.condicion === 'convocados');
          return <Bloque key={lado} titulo={titulo}>
            <div className="px-4 pt-4"><h3 className="font-display text-xs uppercase text-[#5C646C]">Titulares</h3></div>
            <ul>{titulares.map((x) => <li key={`${x.orden}-${x.dorsal}`} className="flex gap-3 border-t border-[#EDF0ED] px-4 py-2.5 text-sm first:border-t-0">
              <span className="w-7 shrink-0 text-right font-display text-[#5C646C]">{x.dorsal ?? '—'}</span>
              <span>{x.codigo ? <Link className="hover:text-club hover:underline" href={`/jugador/${slugJugador(x.codigo, a.federacion)}`}>{nombreParticipante(x)}</Link> : nombreParticipante(x)}{x.portero ? ' · POR' : ''}</span>
            </li>)}</ul>
            <div className="border-t border-[#D6D6D4] px-4 pt-4"><h3 className="font-display text-xs uppercase text-[#5C646C]">Suplentes</h3></div>
            <ul>{suplentes.map((x) => <li key={`${x.orden}-${x.dorsal}`} className="flex gap-3 border-t border-[#EDF0ED] px-4 py-2.5 text-sm first:border-t-0">
              <span className="w-7 shrink-0 text-right font-display text-[#5C646C]">{x.dorsal ?? '—'}</span>
              <span>{x.codigo ? <Link className="hover:text-club hover:underline" href={`/jugador/${slugJugador(x.codigo, a.federacion)}`}>{nombreParticipante(x)}</Link> : nombreParticipante(x)}</span>
            </li>)}</ul>
            {convocados.length > 0 && <>
              <div className="border-t border-[#D6D6D4] px-4 pt-4"><h3 className="font-display text-xs uppercase text-[#5C646C]">Convocados · condición no publicada</h3></div>
              <ul>{convocados.map((x) => <li key={`c-${x.orden}-${x.dorsal}`} className="flex gap-3 border-t border-[#EDF0ED] px-4 py-2.5 text-sm first:border-t-0">
                <span className="w-7 shrink-0 text-right font-display text-[#5C646C]">{x.dorsal ?? '—'}</span>
                <span>{x.codigo ? <Link className="hover:text-club hover:underline" href={`/jugador/${slugJugador(x.codigo, a.federacion)}`}>{nombreParticipante(x)}</Link> : nombreParticipante(x)}{x.portero ? ' · POR' : ''}</span>
              </li>)}</ul>
            </>}
          </Bloque>;
        })}
      </div>

      <Bloque titulo="Desarrollo del partido" pie="Ordenado por minuto según los datos interpretados del acta.">
        <ul>{a.eventos.map((e) => <li key={`${e.orden}-${e.tipo}-${e.minuto}`}
          className="grid grid-cols-[3.5rem_8rem_1fr] gap-3 border-t border-[#EDF0ED] px-4 py-3 text-sm first:border-t-0">
          <span className="font-display">{e.minutoBase == null ? '—' : `${e.minutoBase}${e.minutoAnadido ? `+${e.minutoAnadido}` : ''}′`}</span>
          <span className="text-xs uppercase text-[#5C646C]">{etiquetaDesarrollo(e.tipo, e.subtipo)}</span>
          <span>{e.codigo && e.sujetoTipo === 'jugador'
            ? <Link href={`/jugador/${slugJugador(e.codigo, a.federacion)}`} className="font-medium hover:text-club hover:underline">{e.nombre ?? 'Jugador'}</Link>
            : (e.nombre ?? 'Sin nombre')}
            {e.sujetoTipo === 'tecnico' ? ' · cuerpo técnico' : ''}
            {e.lado ? ` · ${e.lado === 'local' ? p?.local ?? 'Local' : p?.visitante ?? 'Visitante'}` : ''}
            {e.tipo === 'gol' && e.ladoBeneficiado && e.ladoBeneficiado !== e.lado
              ? ` · beneficia a ${e.ladoBeneficiado === 'local' ? p?.local ?? 'Local' : p?.visitante ?? 'Visitante'}` : ''}</span>
        </li>)}</ul>
        {a.eventos.length === 0 && <p className="p-5 text-sm text-[#5C646C]">No hay eventos individualizados en esta acta.</p>}
      </Bloque>

      {a.tecnicos.length > 0 && <Bloque titulo="Cuerpos técnicos">
        <div className="grid gap-px bg-[#EDF0ED] sm:grid-cols-2">
          {(['local', 'visitante'] as const).map((lado) => <div key={lado} className="bg-white p-4">
            <h3 className="mb-3 font-display text-xs uppercase text-[#5C646C]">{lado === 'local' ? p?.local : p?.visitante}</h3>
            <ul className="space-y-2">{a.tecnicos.filter((x) => x.lado === lado).map((x, i) =>
              <li key={`${x.rol}-${i}`} className="text-sm"><span className="text-xs text-[#5C646C]">{x.rol}</span><br />{x.nombre}</li>)}</ul>
          </div>)}
        </div>
      </Bloque>}

      {(a.incidencias.length > 0 || a.calidad) && <p className="mb-6 text-xs leading-5 text-[#5C646C]">
        Calidad del análisis: {a.calidad ?? 'sin evaluar'}{a.incidencias.length ? ` · ${a.incidencias.map(explicaIncidencia).join(' · ')}` : ''}.
      </p>}
    </>
  );
}
