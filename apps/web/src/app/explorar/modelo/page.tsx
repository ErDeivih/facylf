import type { Metadata } from 'next';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import evaluacion from '@/datos/evaluacion-castilla-leon.json';
import global from '@/datos/evaluacion-global.json';

export const metadata: Metadata = { title: 'Modelo de predicción — Fondo Popular' };
export const dynamic = 'force-dynamic';

type Medida = { n: number; log_loss: number; brier: number; acierto: number; ece?: number };
const panel = 'overflow-x-auto rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4';
const decimal = (n: number) => n.toFixed(5).replace('.', ',');
const porcentaje = (n: number) => `${(n * 100).toFixed(2).replace('.', ',')} %`;
const temporada = (a: string) => `${a}-${String(Number(a) + 1).slice(-2)}`;

function Tabla({ titulo, filas }: { titulo: string; filas: [string, Medida][] }) {
  return <section className={panel}>
    <h2 className="m-0 text-bloque font-bold">{titulo}</h2>
    <table className="mt-2 w-full text-tabla">
      <thead><tr><th scope="col" className="text-left">Ámbito</th><th scope="col">Partidos</th><th scope="col">Log-loss</th><th scope="col" className="hidden sm:table-cell">Brier</th><th scope="col">Acierto</th><th scope="col" className="hidden sm:table-cell">ECE</th></tr></thead>
      <tbody>{filas.map(([nombre, m]) => <tr key={nombre} className="border-t border-[var(--fondo-sutil)] text-right tabular-nums">
        <th scope="row" className="py-1 text-left font-normal">{nombre}</th><td>{m.n.toLocaleString('es-ES')}</td>
        <td>{decimal(m.log_loss)}</td><td className="hidden sm:table-cell">{decimal(m.brier)}</td><td>{porcentaje(m.acierto)}</td><td className="hidden sm:table-cell">{m.ece === undefined ? '—' : porcentaje(m.ece)}</td>
      </tr>)}</tbody>
    </table>
  </section>;
}

type Registro = Medida & { modelo: string; jornada: number | null; acierto_marcador: number | null; con_marcador: number };

async function RegistroDeAciertos() {
  const estado = await Promise.all([
    consulta<Registro>('select * from analytics.prediccion_registro_resumen order by modelo, jornada nulls first limit 300', [], { presupuestoMs: 900 }),
    consulta<{ n: number; version: string | null }>(`select count(*)::int n,
      (array_agg(modelo order by emitida_en desc))[1] version
      from analytics.prediccion_emitida_cruce where corte_datos is not null`, [], { presupuestoMs: 900 }),
  ]).catch(() => null);
  return <section className={panel}>
    <h2 className="m-0 text-bloque font-bold">Registro de aciertos · Castilla y León</h2>
    {estado === null ? <p className="text-tabla">Registro temporalmente no disponible.</p> : <>
      <p className="text-tabla">{(estado[1][0]?.n ?? 0).toLocaleString('es-ES')} predicciones emitidas antes del partido.</p>
      {estado[1][0]?.version && <p className="text-tabla">Última versión emitida: {estado[1][0].version}.</p>}
      {estado[0].length === 0 ? <p className="text-tabla">Pendiente de los primeros resultados.</p> :
        <table className="w-full text-tabla tabular-nums">
          <thead><tr><th scope="col">Versión y jornada</th><th scope="col">Partidos</th><th scope="col">Acierto 1X2</th><th scope="col">Log-loss</th><th scope="col">Brier</th><th scope="col">Marcador exacto</th></tr></thead>
          <tbody>{estado[0].map((r) => <tr key={`${r.modelo}-${r.jornada}`} className="border-t border-[var(--fondo-sutil)] text-right">
            <th scope="row" className="py-1 text-left font-normal">{r.modelo} · {r.jornada === null ? 'Acumulado' : `Jornada ${r.jornada}`}</th>
            <td>{r.n}</td><td>{porcentaje(r.acierto)}</td><td>{decimal(r.log_loss)}</td><td>{decimal(r.brier)}</td>
            <td>{r.acierto_marcador === null ? '—' : `${porcentaje(r.acierto_marcador)} (${r.con_marcador} con marcador)`}</td>
          </tr>)}</tbody>
        </table>}
    </>}
  </section>;
}

export default function PantallaModelo() {
  const { total, temporadas, categorias, temporada_categoria } = evaluacion.desglose;
  return <div className="flex flex-col gap-4">
    <header>
      <h1 className="m-0 text-titulo font-bold">Cómo se calcula la predicción</h1>
      <p className="mt-1 text-tabla">Castilla y León · LightGBM · prueba temporal 2024-25 y 2025-26.</p>
      <p className="text-tabla">Log-loss y Brier: cuanto más bajos, mejor. Acierto: porcentaje de 1X2 acertados. ECE: diferencia entre lo previsto y lo ocurrido.</p>
      <p className="text-tabla">Forma con decaimiento, rendimiento frente al tercio alto, descanso, remontadas y cohesión. Cada partido usa resultados y actas de días anteriores.</p>
    </header>
    <Tabla titulo="Evaluación oficial · Castilla y León" filas={[
      ['LightGBM · Castilla y León', total], ['Modelo de referencia más simple · Castilla y León', evaluacion.prueba.hgb_base_causal],
    ]} />
    <Tabla titulo="Por temporada" filas={Object.entries(temporadas).map(([a, m]) => [temporada(a), m])} />
    <Tabla titulo="Por categoría" filas={Object.entries(categorias)} />
    <details><summary className="cursor-pointer text-tabla">Desglose de categoría por temporada</summary>
      <Tabla titulo="Categorías y temporadas" filas={Object.entries(temporada_categoria).map(([k, m]) => {
        const [a, c] = k.split('/'); return [`${temporada(a ?? '')} · ${c}`, m];
      })} />
    </details>
    <section className={panel}>
      <h2 className="m-0 text-bloque font-bold">Calibración en Castilla y León</h2>
      <table className="mt-2 w-full text-tabla tabular-nums">
        <thead><tr><th scope="col">Signo</th><th scope="col">Tramo</th><th scope="col">Partidos</th><th scope="col">Previsto</th><th scope="col">Observado</th></tr></thead>
        <tbody>{total.calibracion.map((b) => <tr key={`${b.clase}-${b.desde}`} className="border-t border-[var(--fondo-sutil)] text-right">
          <th scope="row" className="text-left font-normal capitalize">{b.clase}</th><td>{Math.round(b.desde * 100)}–{Math.round(b.hasta * 100)} %</td>
          <td>{b.n.toLocaleString('es-ES')}</td><td>{porcentaje(b.previsto)}</td><td>{porcentaje(b.observado)}</td>
        </tr>)}</tbody>
      </table>
    </section>
    <RegistroDeAciertos />
  </div>;
}
