import Link from 'next/link';
import type { Route } from 'next';
import { Bloque } from '@/componentes/Bloque';
import { FEDERACIONES_LOCALES, resumenLocal, resumenFederacionesLocal, listarGruposLocal } from '@/lib/repositorio-local';

export const revalidate = 60;

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

export default function Inicio() {
  const estado = resumenLocal();
  const federaciones = resumenFederacionesLocal();
  const salamanca = listarGruposLocal(400).filter((g) => g.salamanca);
  const conDatos = salamanca.filter((g) => g.partidos > 0).slice(0, 15);
  const totales = federaciones.reduce((a, f) => ({
    competiciones: a.competiciones + f.competiciones, grupos: a.grupos + f.grupos,
    jornadas: a.jornadas + f.jornadas, partidos: a.partidos + f.partidos,
    actas: a.actas + f.actas, actasProcesadas: a.actasProcesadas + f.actasProcesadas,
    jornadasEsperadas: a.jornadasEsperadas + f.jornadasEsperadas,
  }), { competiciones: 0, grupos: 0, jornadas: 0, partidos: 0, actas: 0, actasProcesadas: 0, jornadasEsperadas: 0 });

  const contadores: Array<[string, number, string]> = [
    ['Federaciones', federaciones.length, '/federaciones'],
    ['Competiciones', totales.competiciones, '/competiciones'],
    ['Grupos', totales.grupos, '/competiciones'],
    ['Partidos', totales.partidos, '/partidos'],
    ['Jornadas', totales.jornadas, '/partidos'],
    ['Actas analizadas', totales.actasProcesadas, '/partidos'],
  ];

  return <>
    <section className="border border-[#D6D6D4] bg-white p-5">
      <h2 className="font-display text-2xl uppercase">Buscar en el archivo</h2>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#5C646C]">
        {FEDERACIONES_LOCALES.length} federaciones · {totales.competiciones.toLocaleString('es-ES')} competiciones ·{' '}
        {totales.partidos.toLocaleString('es-ES')} partidos · {totales.actasProcesadas.toLocaleString('es-ES')} actas analizadas
      </p>
      <form action="/buscar" className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input name="q" autoFocus className="control-filtro sm:flex-1" placeholder="Equipo, jugador, competición, técnico, árbitro…" />
        <select name="federacion" className="control-filtro sm:w-56" defaultValue="todas">
          <option value="todas">Todas las federaciones</option>
          {FEDERACIONES_LOCALES.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombre}</option>)}
        </select>
        <button className="boton-primario sm:w-40">Buscar</button>
      </form>
    </section>

    <div className="my-5 grid grid-cols-2 gap-px border border-[#D6D6D4] bg-[#D6D6D4] sm:grid-cols-3 lg:grid-cols-6">
      {contadores.map(([titulo, valor, destino]) => (
        <Link key={titulo} href={destino as Route} className="bg-white p-3 hover:bg-[#FAFBFA]">
          <p className="font-display text-xl tabular-nums">{valor.toLocaleString('es-ES')}</p>
          <p className="text-[10px] uppercase tracking-wider text-[#5C646C]">{titulo}</p>
        </Link>
      ))}
    </div>

    <section className="mb-5 grid gap-4 border-l-4 border-club bg-white p-4 sm:grid-cols-2">
      <div>
        <div className="flex justify-between text-xs text-[#5C646C]"><span>Jornadas descargadas (todas las bases)</span>
          <b className="tabular-nums">{totales.jornadas.toLocaleString('es-ES')}/{totales.jornadasEsperadas.toLocaleString('es-ES')} · {pct(totales.jornadas, totales.jornadasEsperadas)}%</b></div>
        <div className="mt-1 h-2 bg-[#EDF0ED]"><div className="h-full bg-club" style={{ width: `${pct(totales.jornadas, totales.jornadasEsperadas)}%` }} /></div>
      </div>
      <div>
        <div className="flex justify-between text-xs text-[#5C646C]"><span>Actas analizadas</span>
          <b className="tabular-nums">{totales.actasProcesadas.toLocaleString('es-ES')}/{totales.actas.toLocaleString('es-ES')} · {pct(totales.actasProcesadas, totales.actas)}%</b></div>
        <div className="mt-1 h-2 bg-[#EDF0ED]"><div className="h-full bg-[#1F7A46]" style={{ width: `${pct(totales.actasProcesadas, totales.actas)}%` }} /></div>
      </div>
      <p className="text-[12px] leading-5 text-[#5C646C] sm:col-span-2">
        Un catálogo completo no significa contenido completo: cada ficha indica su cobertura.
        La prioridad de análisis sigue siendo Castilla y León y Salamanca. Fuente: portales federativos oficiales.
      </p>
    </section>

    <Bloque titulo={`Salamanca · ${estado.salamanca} grupos identificados`}
      pie="Se listan primero los grupos que ya tienen partidos interpretados">
      <div className="overflow-x-auto"><table className="w-full text-sm tabular-nums">
        <thead><tr className="border-b border-[#D6D6D4] text-left text-xs uppercase text-[#5C646C]">
          <th className="p-2">Grupo</th><th className="p-2">Temporada</th>
          <th className="p-2 text-right">Jornadas</th><th className="p-2 text-right">Resultados</th>
        </tr></thead>
        <tbody>{conDatos.map((g) => (
          <tr key={g.slug} className="border-b border-[#EDF0ED] hover:bg-[#FAFBFA]">
            <td className="p-2"><Link href={`/competicion/${g.slug}` as Route} className="font-medium hover:text-club hover:underline">{g.nombre}</Link>
              <span className="block text-[10px] text-[#8A8E91]">{g.grupo}</span></td>
            <td className="p-2 text-[12px] text-[#5C646C]">{g.temporada}</td>
            <td className="p-2 text-right">{g.jornadas}</td>
            <td className="p-2 text-right font-semibold">{g.resultados}/{g.partidos}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {!conDatos.length && <p className="p-5 text-sm text-[#5C646C]">Los grupos de Salamanca ya están identificados, pero ninguno ha completado todavía todas sus jornadas y actas. Aparecerán aquí automáticamente al quedar completos.</p>}
    </Bloque>

    <div className="mt-5 grid gap-3 sm:grid-cols-4">
      {[['/federaciones', 'Federaciones', 'Cobertura por territorio'],
        ['/competiciones', 'Competiciones', 'Por temporada, categoría y grupo'],
        ['/equipos', 'Equipos', 'Partidos y continuidad'],
        ['/jugadores', 'Jugadores', 'Trayectoria y estadísticas']].map(([href, titulo, pie]) => (
        <Link key={href} href={href as Route} className="border border-[#D6D6D4] bg-white p-3 hover:border-club">
          <h3 className="font-display uppercase">{titulo}</h3><p className="mt-1 text-[11px] text-[#5C646C]">{pie}</p>
        </Link>
      ))}
    </div>
  </>;
}
