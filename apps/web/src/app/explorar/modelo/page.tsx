import type { Metadata } from 'next';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import historico from '@/datos/modelo.json';
import evaluacion from '../../../../../../pruebas/prediccion/evaluacion-castilla-leon-2026-11-16.json';
import global from '../../../../../../pruebas/prediccion/evaluacion.json';
import federaciones from '../../../../../../pruebas/prediccion/referencia-federaciones-2026-11-17.json';

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
      <thead><tr><th scope="col" className="text-left">Ámbito</th><th scope="col">Partidos</th><th scope="col">Log-loss</th><th scope="col">Brier</th><th scope="col">Acierto</th><th scope="col">ECE</th></tr></thead>
      <tbody>{filas.map(([nombre, m]) => <tr key={nombre} className="border-t border-[var(--fondo-sutil)] text-right tabular-nums">
        <th scope="row" className="py-1 text-left font-normal">{nombre}</th><td>{m.n.toLocaleString('es-ES')}</td>
        <td>{decimal(m.log_loss)}</td><td>{decimal(m.brier)}</td><td>{porcentaje(m.acierto)}</td><td>{m.ece === undefined ? '—' : porcentaje(m.ece)}</td>
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
          <thead><tr><th scope="col">Versión y jornada</th><th scope="col">Partidos</th><th scope="col">Signo</th><th scope="col">Log-loss</th><th scope="col">Brier</th><th scope="col">Marcador exacto</th></tr></thead>
          <tbody>{estado[0].map((r) => <tr key={`${r.modelo}-${r.jornada}`} className="border-t border-[var(--fondo-sutil)] text-right">
            <th scope="row" className="py-1 text-left font-normal">{r.modelo} · {r.jornada === null ? 'Acumulado' : `Jornada ${r.jornada}`}</th>
            <td>{r.n}</td><td>{porcentaje(r.acierto)}</td><td>{decimal(r.log_loss)}</td><td>{decimal(r.brier)}</td>
            <td>{r.acierto_marcador === null ? '—' : `${porcentaje(r.acierto_marcador)} de ${r.con_marcador}`}</td>
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
      <p className="text-tabla">Forma con decaimiento, rendimiento frente al tercio alto, descanso, remontadas y cohesión. Cada partido usa resultados y actas de días anteriores.</p>
    </header>
    <Tabla titulo="Evaluación oficial · Castilla y León" filas={[
      ['LightGBM · Castilla y León', total], ['HGB de referencia · Castilla y León', evaluacion.prueba.hgb_base_causal],
    ]} />
    <Tabla titulo="Por temporada" filas={Object.entries(temporadas).map(([a, m]) => [temporada(a), m])} />
    <Tabla titulo="Por categoría" filas={Object.entries(categorias)} />
    <section className={panel}>
      <h2 className="m-0 text-bloque font-bold">Por jornada · canónico multifederación</h2>
      <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">El modelo gana precisión cuando hay más partidos; la clasificación no se calcula igual en la jornada 1 que en la 14.</p>
      <table className="mt-2 w-full text-tabla tabular-nums">
        <thead><tr><th scope="col" className="text-left">Tramo</th><th scope="col">Partidos</th><th scope="col">Log-loss ML</th><th scope="col">Acierto ML</th><th scope="col">Base log-loss</th></tr></thead>
        <tbody>{Object.entries((global as unknown as { por_jornada?: Record<string, { n: number; 'ml-variables': Medida; 'base-frecuencias': Medida }> }).por_jornada ?? {}).map(([tramo, m]) => (
          <tr key={tramo} className="border-t border-[var(--fondo-sutil)] text-right">
            <th scope="row" className="py-1 text-left font-normal">{tramo}</th><td>{m.n.toLocaleString('es-ES')}</td>
            <td>{decimal(m['ml-variables'].log_loss)}</td><td>{porcentaje(m['ml-variables'].acierto)}</td><td>{decimal(m['base-frecuencias'].log_loss)}</td>
          </tr>))}</tbody>
      </table>
    </section>
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
    <details><summary className="cursor-pointer text-tabla">Referencia histórica multifederación</summary>
      <Tabla titulo="Canónico multifederación · evaluación histórica" filas={historico.resultados.map((r) => [r.modelo, r])} />
      <Tabla titulo="HGB histórico por federación · desde 500 partidos" filas={federaciones.grupos.map((f) => [f.federacion, f])} />
    </details>
  </div>;
}
