import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { SinCanonico } from '@/componentes/SinCanonico';
import { consulta, CanonicoNoDisponible } from '@/consultas/adaptadores/postgres/conexion';
import { PREVIA_CRUCE, FORMA_PREVIA_CRUCE, type PreviaCruce, type FormaPrevia } from '@/consultas/previa-cruce';
import { tieneActa } from '@/lib/acta';
import { diaCorto, linea1X2 } from '@/lib/proximas';

export const revalidate = 60;
type Parametros = { params: Promise<{ clave: string }> };
const tarjeta = 'min-w-0 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4';
const enlace = 'text-[var(--accion)] hover:underline';

const cruceDe = cache(async (clave: string) => {
  if (!/^[1-9]\d{0,9}(?:-[1-9]\d{0,9}){3}$/.test(clave)) return null;
  const [grupo, jornada, local, visitante] = clave.split('-').map(Number) as [number, number, number, number];
  if (local === visitante || jornada > 32767 || Math.max(grupo, local, visitante) > 2147483647) return null;
  const [partido] = await consulta<PreviaCruce>(PREVIA_CRUCE.sql, [grupo, jornada, local, visitante]);
  return partido ? { grupo, jornada, local, visitante, partido } : null;
});

export async function generateMetadata({ params }: Parametros): Promise<Metadata> {
  try {
    const cruce = await cruceDe((await params).clave);
    return { title: cruce ? `${cruce.partido.local} – ${cruce.partido.visitante} · Previa` : 'Previa' };
  } catch { return { title: 'Previa' }; }
}

export default async function PaginaPreviaCruce({ params }: Parametros) {
  let cruce;
  let forma: FormaPrevia[] = [];
  try {
    cruce = await cruceDe((await params).clave);
    if (!cruce) notFound();
    forma = await consulta<FormaPrevia>(FORMA_PREVIA_CRUCE.sql, [cruce.local, cruce.visitante, cruce.partido.corte]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Previa" motivo={error.message} />;
    throw error;
  }
  const p = cruce.partido;
  const fecha = p.fecha_partido ?? p.fecha_jornada;
  const signos = linea1X2(p);
  return (
    <article className="grid min-w-0 gap-4 lg:grid-cols-2">
      <header className={`${tarjeta} lg:col-span-2`}>
        <Link className={enlace} href={`/explorar/competicion/${cruce.grupo}`}>{p.edicion} · {p.grupo}</Link>
        <p className="text-nota text-[var(--texto-suave)]">{p.temporada} · Jornada {cruce.jornada}</p>
        <h1 className="text-titulo font-bold">{p.local} – {p.visitante}</h1>
        {p.gl !== null && p.gv !== null && <p className="text-bloque font-bold tabular-nums">Resultado {p.gl} – {p.gv}</p>}
        {p.estado === 'cancelled' && <p>Partido cancelado</p>}
        {p.estado === 'postponed' && <p>Partido aplazado</p>}
        {p.match_id && tieneActa(p.calidad) && <Link className={enlace} href={`/explorar/acta/${p.match_id}`}>Ver acta</Link>}
      </header>
      <section className={tarjeta}>
        <h2 className="text-bloque font-bold">Cuándo y dónde</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-tabla">
          <dt>{p.fecha_partido ? 'Fecha' : 'Fecha de la jornada'}</dt>
          <dd>{fecha ? diaCorto(fecha) : 'Sin fecha publicada'}</dd>
          <dt>Hora</dt><dd>{p.hora ?? 'Por confirmar'}</dd>
          <dt>Campo</dt><dd>{p.campo_id ? <Link className={enlace} href={`/explorar/campo/${p.campo_id}`}>{p.campo}</Link> : 'Sin campo publicado'}</dd>
          <dt>Árbitro</dt><dd>{p.arbitro_id ? <Link className={enlace} href={`/explorar/arbitro/${p.arbitro_id}`}>{p.arbitro}</Link> : 'Sin designación publicada'}</dd>
        </dl>
      </section>
      <section className={tarjeta}>
        <h2 className="text-bloque font-bold">Pronóstico previo</h2>
        {signos ? <>
          <p className="mt-3 font-semibold tabular-nums">{signos}</p>
          {p.marcador && <p>Marcador más probable · {p.marcador}</p>}
          <p className="mt-2 text-nota text-[var(--texto-suave)]">Modelo <Link className={enlace} href="/explorar/modelo">{p.modelo}</Link></p>
        </> : <p>Sin predicción congelada.</p>}
      </section>
      {[[cruce.local, p.local], [cruce.visitante, p.visitante]].map(([id, nombre]) => {
        const partidos = forma.filter((f) => f.equipo_id === id);
        const jugadores = partidos[0]?.jugadores ?? [];
        return <section key={id} className={tarjeta}>
          <h2 className="text-bloque font-bold"><Link className={enlace} href={`/explorar/equipo/${id}` as Route}>{nombre}</Link></h2>
          <p className="text-nota text-[var(--texto-suave)]">Últimos resultados anteriores al {p.corte}</p>
          {partidos.length ? <ul className="mt-3 divide-y divide-[var(--borde)]">
            {partidos.map((f, i) => <li key={i} className="flex items-baseline justify-between gap-2 py-2">
              <span>{diaCorto(f.fecha)} · {f.rival}</span><span className="shrink-0 font-semibold tabular-nums">{f.gf} – {f.gc}</span>
            </li>)}
          </ul> : <p>Sin resultados anteriores publicados.</p>}
          {jugadores.length > 0 ? <details className="mt-3">
            <summary className="cursor-pointer">Convocatoria del último partido ({jugadores.length})</summary>
            <ul>{jugadores.map((j) => <li key={j.id}><Link className={enlace} href={`/explorar/jugador/${j.id}`}>{j.nombre}</Link></li>)}</ul>
          </details> : <p className="text-nota">Sin convocatoria publicada para el último partido.</p>}
        </section>;
      })}
    </article>
  );
}
