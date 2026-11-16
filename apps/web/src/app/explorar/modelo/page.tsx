import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import modelo from '@/datos/modelo.json';

export const metadata: Metadata = { title: 'Modelo de predicción — Fondo Popular' };

type Resultado = { modelo: string; log_loss: number; brier: number; acierto: number; n: number };
type Calibracion = { clase: string; ece: number; bins: { bin: string; n: number; previsto: number; observado: number }[] };

const NOMBRE: Record<string, string> = {
  'base-frecuencias': 'Línea base (frecuencias)',
  'poisson-dixon-coles': 'Poisson + Dixon-Coles',
  elo: 'Elo + Poisson',
  'ml-variables': 'ML con variables',
};

/** Ficha pública del modelo: variables, temporadas y error (log-loss/Brier/calibración). */
export default function PantallaModelo() {
  const resultados = (modelo.resultados ?? []) as Resultado[];
  const mejor = resultados.reduce((a, b) => (a.log_loss <= b.log_loss ? a : b), resultados[0]);
  const calib = (modelo.calibracion_mejor?.bins ?? []) as Calibracion[];
  const base = resultados.find((r) => r.modelo === 'base-frecuencias');
  const diferencia = base ? mejor.log_loss - base.log_loss : null;
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="m-0 text-titulo font-bold tracking-[-0.02em] text-[var(--texto)]">Cómo se calcula la predicción</h1>
        <p className="m-0 mt-1 max-w-[75ch] text-tabla text-[var(--texto-suave)]">
          Entrenamiento con temporadas anteriores y validación con temporadas posteriores, nunca aleatoria.
          Entrenamiento hasta {modelo.train_hasta} ({modelo.n_train.toLocaleString('es-ES')} partidos); validación
          {' '}{modelo.validacion.join(' y ')} ({modelo.n_valid.toLocaleString('es-ES')} partidos).
        </p>
      </header>

      <section className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
        <h2 className="m-0 border-b border-[var(--fondo-sutil)] px-4 py-3 text-bloque font-bold text-[var(--texto)]">Error en validación temporal</h2>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Comparación de modelos">
          <table className="w-full border-collapse text-tabla">
            <thead>
              <tr className="text-left text-etiqueta text-[var(--texto-suave)]">
                <th scope="col" className="px-3 py-2 font-semibold">Modelo</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Log-loss</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Brier</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Acierto</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r) => (
                <tr key={r.modelo} className={`border-t border-[var(--fondo-sutil)] ${r.modelo === mejor.modelo ? 'font-semibold' : ''}`}>
                  <td className="px-3 py-1.5 text-[var(--texto)]">{NOMBRE[r.modelo] ?? r.modelo}{r.modelo === mejor.modelo ? ' · elegido' : ''}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--texto)]">{r.log_loss.toFixed(5).replace('.', ',')}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--texto)]">{r.brier.toFixed(5).replace('.', ',')}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--texto)]">{(r.acierto * 100).toFixed(1).replace('.', ',')} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 px-4 py-2 text-nota text-[var(--texto-suave)]">
          Línea base ingenua: frecuencias de 1/X/2 del entrenamiento. Cuanto más bajo, mejor. El modelo elegido es el de menor log-loss.
        </p>
        {diferencia !== null && (
          <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2 text-tabla text-[var(--texto)]">
            El modelo elegido mejora la línea base en <strong className="tabular-nums">{Math.abs(diferencia).toFixed(5).replace('.', ',')}</strong> de log-loss
            {' '}({((Math.abs(diferencia) / base!.log_loss) * 100).toFixed(1).replace('.', ',')} % menos) y en{' '}
            <strong className="tabular-nums">{Math.abs(mejor.brier - base!.brier).toFixed(5).replace('.', ',')}</strong> de Brier.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
        <h2 className="m-0 border-b border-[var(--fondo-sutil)] px-4 py-3 text-bloque font-bold text-[var(--texto)]">Calibración del modelo elegido</h2>
        <p className="m-0 px-4 pt-2 text-nota text-[var(--texto-suave)]">Probabilidad prevista frente a frecuencia observada, en 10 tramos.</p>
        <div className="grid gap-4 p-4 lg:grid-cols-3">
          {calib.map((c) => (
            <div key={c.clase} className="min-w-0">
              <h3 className="m-0 text-tabla font-bold capitalize text-[var(--texto)]">{c.clase} <span className="font-normal text-[var(--texto-suave)]">· ECE {(c.ece * 100).toFixed(1).replace('.', ',')} %</span></h3>
              <table className="mt-1 w-full border-collapse text-etiqueta">
                <thead><tr className="text-[var(--texto-suave)]"><th className="text-left font-semibold">Tramo</th><th className="text-right font-semibold">Previsto</th><th className="text-right font-semibold">Observado</th></tr></thead>
                <tbody>
                  {c.bins.map((b) => (
                    <tr key={b.bin} className="border-t border-[var(--fondo-sutil)]">
                      <td className="py-0.5 text-[var(--texto)]">{b.bin}</td>
                      <td className="py-0.5 text-right tabular-nums text-[var(--texto)]">{(b.previsto * 100).toFixed(1).replace('.', ',')} %</td>
                      <td className="py-0.5 text-right tabular-nums text-[var(--texto)]">{(b.observado * 100).toFixed(1).replace('.', ',')} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3.5">
        <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">Variables</h2>
        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
          Ataque y defensa (Elo y Poisson), forma reciente (últimos 5), impacto de plantilla, cambio de
          entrenador, local/visitante, descanso y momento de la temporada. La banda de la ficha es el rango
          entre ML, Elo y Poisson: mide desacuerdo entre modelos, no un intervalo estadístico.
        </p>
        <p className="m-0 mt-2 text-nota text-[var(--texto-suave)]">
          Última validación: {modelo.generado_en?.slice(0, 10) ?? 'sin fecha'} · <Link href={'/explorar/proximas' as Route} className="font-semibold text-[var(--accion)] hover:underline">ver próxima jornada</Link>
        </p>
      </section>
    </div>
  );
}
