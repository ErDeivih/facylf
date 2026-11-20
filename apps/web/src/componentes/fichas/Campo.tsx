import Link from 'next/link';
import type { Route } from 'next';
import type { FilaCampo, FilaHorarioDeCampo, FilaLocalDeCampo, FilaPartidoDeCampo } from '@/consultas/campos';
import { diaCorto } from '@/lib/proximas';
import { etiquetaCategoria } from '@/lib/vocabulario-pantalla';

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
const pct = (parte: number, total: number): string => (total > 0 ? `${Math.round((parte / total) * 100)} %` : '—');

/** Cabecera y cifras del campo: cuántos partidos, cómo le va al de casa y cuántos goles se ven. */
export function ResumenDelCampo({ campo }: { campo: FilaCampo }) {
  const r = campo.con_resultado;
  const cifras = [
    { etiqueta: 'Partidos', valor: String(campo.partidos), nota: `${r} con resultado` },
    { etiqueta: 'Gana el local', valor: pct(campo.victorias_local, r), nota: `${campo.victorias_local} de ${r}` },
    { etiqueta: 'Empate', valor: pct(campo.empates, r), nota: `${campo.empates} de ${r}` },
    { etiqueta: 'Gana el visitante', valor: pct(campo.victorias_visitante, r), nota: `${campo.victorias_visitante} de ${r}` },
  ];
  return (
    <>
      <header className={`${TARJETA} px-5 py-4`}>
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">{campo.nombre}</h1>
        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
          {[campo.municipio, r > 0 ? `${(campo.goles / r).toFixed(2).replace('.', ',')} goles por partido` : null]
            .filter(Boolean).join(' · ') || 'Campo de juego'}
        </p>
      </header>
      <dl className="m-0 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cifras.map((c) => (
          <div key={c.etiqueta} className={`${TARJETA} flex flex-col gap-1 p-3`}>
            <dt className="text-nota text-[var(--texto-suave)]">{c.etiqueta}</dt>
            <dd className="m-0 text-bloque font-extrabold tabular-nums text-[var(--texto)]">{c.valor}</dd>
            <dd className="m-0 text-nota tabular-nums text-[var(--texto-suave)]">{c.nota}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/** Horarios habituales: día y hora de comienzo, de más a menos frecuente. */
export function HorariosDelCampo({ horarios }: { horarios: readonly FilaHorarioDeCampo[] }) {
  const total = horarios.reduce((s, h) => s + h.partidos, 0);
  const maximo = Math.max(1, ...horarios.map((h) => h.partidos));
  return (
    <section aria-labelledby="horarios-campo" className={`${TARJETA} overflow-hidden`}>
      <header className="px-4 py-3">
        <h2 id="horarios-campo" className="m-0 text-bloque font-bold text-[var(--texto)]">Horarios habituales</h2>
        <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">
          {total === 0 ? 'Ningún partido de este campo tiene la hora publicada.' : `${total} partidos con hora publicada`}
        </p>
      </header>
      {horarios.length > 0 && (
        <ul className="m-0 list-none p-0">
          {horarios.map((h) => (
            <li key={`${h.dia}-${h.hora}`} className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-3 border-t border-[var(--fondo-sutil)] px-4 py-2">
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-tabla font-semibold tabular-nums text-[var(--texto)]">{DIAS[h.dia] ?? 'Día'} · {h.hora}</span>
                <span aria-hidden="true" className="block h-1.5 rounded-full bg-[var(--accion)]" style={{ width: `${Math.max(4, (h.partidos / maximo) * 100)}%` }} />
              </span>
              <span className="text-right text-tabla tabular-nums text-[var(--texto-suave)]">{h.partidos}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Los equipos que juegan en casa aquí, con su balance en este campo. */
export function LocalesDelCampo({ locales }: { locales: readonly FilaLocalDeCampo[] }) {
  if (locales.length === 0) return null;
  return (
    <section aria-labelledby="locales-campo" className={`${TARJETA} overflow-hidden`}>
      <h2 id="locales-campo" className="m-0 px-4 py-3 text-bloque font-bold text-[var(--texto)]">Juegan en casa aquí</h2>
      <ul className="m-0 list-none p-0">
        {locales.map((l) => (
          <li key={`${l.equipo_id}`} className="border-t border-[var(--fondo-sutil)]">
            <Link href={`/explorar/equipo/${l.equipo_id}` as Route}
              className="flex min-h-11 flex-col justify-center gap-0.5 px-4 py-2 hover:bg-[var(--fondo-sutil)]">
              <span className="break-words text-tabla font-semibold text-[var(--texto)]">{l.equipo}</span>
              <span className="text-nota tabular-nums text-[var(--texto-suave)]">
                {etiquetaCategoria(l.categoria)} · {l.partidos} {l.partidos === 1 ? 'partido' : 'partidos'} · {l.ganados} V · {l.empatados} E · {l.perdidos} D
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Últimos partidos del campo. Un partido sin marcador es «sin resultado», nunca 0-0. */
export function PartidosDelCampo({ partidos }: { partidos: readonly FilaPartidoDeCampo[] }) {
  return (
    <section aria-labelledby="partidos-campo" className={`${TARJETA} overflow-hidden`}>
      <h2 id="partidos-campo" className="m-0 px-4 py-3 text-bloque font-bold text-[var(--texto)]">Últimos partidos</h2>
      {partidos.length === 0
        ? <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-3 text-tabla text-[var(--texto-suave)]">Sin partidos publicados en este campo.</p>
        : (
          <ul className="m-0 list-none p-0">
            {partidos.map((p) => {
              const jugado = p.goles_local !== null && p.goles_visitante !== null;
              const destino = p.tiene_acta ? `/explorar/acta/${p.match_id}` : jugado ? `/explorar/competicion/${p.grupo_id}` : `/explorar/previa/${p.match_id}`;
              return (
                <li key={p.match_id} className="border-t border-[var(--fondo-sutil)]">
                  <Link href={destino as Route} className="flex min-h-11 flex-col justify-center gap-0.5 px-4 py-2 hover:bg-[var(--fondo-sutil)]">
                    <span className="text-nota tabular-nums text-[var(--texto-suave)]">
                      {[p.fecha ? diaCorto(p.fecha) : 'sin fecha', p.hora, p.edicion, p.jornada !== null ? `J${p.jornada}` : null].filter(Boolean).join(' · ')}
                    </span>
                    <span className="flex items-baseline justify-between gap-3 text-tabla font-semibold text-[var(--texto)]">
                      <span className="min-w-0 break-words">{p.local} <span className="font-normal text-[var(--texto-suave)]">–</span> {p.visitante}</span>
                      <span className="flex-none tabular-nums">
                        {jugado ? `${p.goles_local}-${p.goles_visitante}` : <span className="font-normal text-[var(--texto-suave)]">sin resultado</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
