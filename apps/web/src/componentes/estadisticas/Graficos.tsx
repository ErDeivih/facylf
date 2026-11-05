import type { ReactNode } from 'react';
import { TARJETA } from './controles';

/**
 * Gráficos de las páginas de estadísticas, en SVG sin librería nueva.
 *
 * Reglas que cumplen todos:
 *  · el gráfico lleva un resumen en texto (`aria-label`) y una tabla equivalente en un `<details>`;
 *  · nunca se lee sólo por color: hay leyenda con nombre y la tabla con las cifras;
 *  · usan tokens del sistema de diseño, no colores literales;
 *  · el texto del SVG sube de tamaño en pantallas estrechas para que no quede ilegible al reducirse
 *    el `viewBox`.
 *
 * Las cifras que no existen se pintan con un hueco o un guion, nunca como 0 inventado.
 */

export type SerieDeLineas = {
  nombre: string;
  /** Un valor por jornada; `null` es «sin dato» y corta la línea, no la convierte en 0. */
  valores: Array<number | null>;
  destacada?: boolean;
};

export type LeyendaDeSerie = { etiqueta: string; color: string };

/** Escala del eje: cuatro intervalos con un paso «redondo» (1, 2 o 5 por potencia de diez). */
function escalaDeEje(maximo: number): { techo: number; marcas: number[] } {
  const bruto = Math.max(1, maximo) / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const normalizado = bruto / potencia;
  const paso = (normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10) * potencia;
  const techo = Math.ceil(Math.max(1, maximo) / paso) * paso;
  const intervalos = Math.max(1, Math.round(techo / paso));
  return { techo, marcas: Array.from({ length: intervalos + 1 }, (_, i) => i * paso) };
}

function segmentos(valores: Array<number | null>, x: (i: number) => number, y: (v: number) => number): string[] {
  const rutas: string[] = [];
  let actual: string[] = [];
  valores.forEach((valor, i) => {
    if (valor === null) {
      if (actual.length > 1) rutas.push(actual.join(' '));
      actual = [];
      return;
    }
    actual.push(`${x(i).toFixed(1)},${y(valor).toFixed(1)}`);
  });
  if (actual.length > 1) rutas.push(actual.join(' '));
  return rutas;
}

const ETIQUETA_SVG = 'fill-[var(--texto-suave)] text-[17px] sm:text-[10.5px]';
const ETIQUETA_SVG_FUERTE = 'fill-[var(--texto)] text-[17px] font-semibold sm:text-[10.5px]';

export function GraficoLineas({ id, titulo, subtitulo, resumen, etiquetasX, series, leyenda, tableHeaders, tableRows, nota }: {
  id: string;
  titulo: string;
  subtitulo: string;
  resumen: string;
  etiquetasX: string[];
  series: readonly SerieDeLineas[];
  leyenda: readonly LeyendaDeSerie[];
  tableHeaders: string[];
  tableRows: string[][];
  nota?: ReactNode;
}) {
  const { techo: maximo, marcas } = escalaDeEje(
    Math.max(1, ...series.flatMap((serie) => serie.valores.filter((v): v is number => v !== null))),
  );
  const izquierda = 36;
  const derecha = 474;
  const arriba = 10;
  const abajo = 158;
  const ancho = derecha - izquierda;
  const alto = abajo - arriba;
  const x = (i: number) => (etiquetasX.length <= 1 ? izquierda : izquierda + (i * ancho) / (etiquetasX.length - 1));
  const y = (valor: number) => abajo - (valor * alto) / maximo;
  const pasoEtiquetas = Math.max(1, Math.ceil(etiquetasX.length / 8));
  return (
    <section aria-labelledby={id} className={`${TARJETA} px-4 py-3.5`}>
      <h2 id={id} className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
      <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">{subtitulo}</p>
      <svg viewBox="0 0 480 180" role="img" aria-label={resumen} className="mt-2 block h-auto w-full">
        <title>{resumen}</title>
        {marcas.map((marca) => (
          <g key={marca}>
            <line x1={izquierda} x2={derecha} y1={y(marca)} y2={y(marca)}
              stroke="var(--fondo-sutil)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={izquierda - 6} y={y(marca) + 3} textAnchor="end" className={ETIQUETA_SVG}>{marca}</text>
          </g>
        ))}
        <line x1={izquierda} x2={derecha} y1={abajo} y2={abajo}
          stroke="var(--borde)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {series.map((serie) => (
          <g key={serie.nombre}>
            {segmentos(serie.valores, x, y).map((ruta, i) => (
              <polyline key={i} points={ruta} fill="none"
                stroke={serie.destacada ? 'var(--accion)' : 'var(--borde-fuerte)'}
                strokeWidth={serie.destacada ? 2.5 : 1.2}
                strokeOpacity={serie.destacada ? 1 : 0.75}
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ))}
            {serie.destacada && serie.valores.map((valor, i) => (valor === null ? null : (
              <circle key={i} cx={x(i)} cy={y(valor)} r={2.6} fill="var(--accion)"
                stroke="var(--fondo-elevado)" strokeWidth={1.2} />
            )))}
          </g>
        ))}
        {etiquetasX.map((etiqueta, i) => (i % pasoEtiquetas === 0 ? (
          <text key={`${etiqueta}-${i}`} x={x(i)} y={174} textAnchor="middle" className={ETIQUETA_SVG}>{etiqueta}</text>
        ) : null))}
        {series.filter((serie) => serie.destacada).map((serie) => {
          const ultimo = [...serie.valores].reverse().find((valor): valor is number => valor !== null);
          if (ultimo === undefined) return null;
          return (
            <text key={`fin-${serie.nombre}`} x={derecha} y={y(ultimo) - 7} textAnchor="end" className={ETIQUETA_SVG_FUERTE}>
              {ultimo}
            </text>
          );
        })}
      </svg>
      <ul className="m-0 mt-1 flex flex-wrap gap-x-4 gap-y-1 p-0 text-nota text-[var(--texto-suave)]">
        {leyenda.map((serie) => (
          <li key={serie.etiqueta} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-[3px] w-4 rounded-full" style={{ backgroundColor: serie.color }} />
            {serie.etiqueta}
          </li>
        ))}
      </ul>
      {nota !== undefined && <p className="m-0 mt-1.5 text-nota text-[var(--texto-suave)]">{nota}</p>}
      <details className="mt-2 text-nota text-[var(--texto-suave)]">
        <summary className="cursor-pointer text-[var(--accion)]">Ver como tabla</summary>
        <div className="mt-1.5 overflow-x-auto">
          <table className="w-full border-collapse text-tabla">
            <thead>
              <tr className="text-right">
                {tableHeaders.map((cabecera, i) => (
                  <th key={cabecera} scope="col" className={`border-b border-[var(--borde)] px-1.5 py-1 font-semibold ${i === 0 ? 'text-left' : ''}`}>
                    {cabecera}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((fila, i) => (
                <tr key={i} className="text-right tabular-nums">
                  {fila.map((celda, j) => (
                    <td key={j} className={`border-t border-[var(--fondo-sutil)] px-1.5 py-1 ${j === 0 ? 'text-left' : ''}`}>{celda}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function GraficoBarras({ id, titulo, subtitulo, resumen, datos, tableHeaders, tableRows, nota }: {
  id: string;
  titulo: string;
  subtitulo: string;
  resumen: string;
  datos: ReadonlyArray<{ etiqueta: string; valor: number; titulo?: string }>;
  tableHeaders: string[];
  tableRows: string[][];
  nota?: ReactNode;
}) {
  const maximo = Math.max(1, ...datos.map((dato) => dato.valor));
  const izquierda = 12;
  const derecha = 472;
  const arriba = 18;
  const abajo = 140;
  const ancho = derecha - izquierda;
  const hueco = ancho / Math.max(1, datos.length);
  const anchoBarra = Math.min(46, hueco * 0.62);
  return (
    <section aria-labelledby={id} className={`${TARJETA} px-4 py-3.5`}>
      <h2 id={id} className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
      <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">{subtitulo}</p>
      <svg viewBox="0 0 480 160" role="img" aria-label={resumen} className="mt-2 block h-auto w-full">
        <title>{resumen}</title>
        <line x1={izquierda} x2={derecha} y1={abajo} y2={abajo}
          stroke="var(--borde)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {datos.map((dato, i) => {
          const centro = izquierda + hueco * (i + 0.5);
          const alto = dato.valor === 0 ? 0 : Math.max(1.5, ((abajo - arriba) * dato.valor) / maximo);
          return (
            <g key={dato.etiqueta}>
              <rect x={centro - anchoBarra / 2} y={abajo - alto} width={anchoBarra} height={alto}
                rx={3} fill="var(--accion)">
                <title>{dato.titulo ?? `${dato.etiqueta}: ${dato.valor}`}</title>
              </rect>
              <text x={centro} y={abajo - alto - 5} textAnchor="middle" className={ETIQUETA_SVG_FUERTE}>{dato.valor}</text>
              <text x={centro} y={156} textAnchor="middle" className={ETIQUETA_SVG}>{dato.etiqueta}</text>
            </g>
          );
        })}
      </svg>
      {nota !== undefined && <p className="m-0 mt-1.5 text-nota text-[var(--texto-suave)]">{nota}</p>}
      <details className="mt-2 text-nota text-[var(--texto-suave)]">
        <summary className="cursor-pointer text-[var(--accion)]">Ver como tabla</summary>
        <div className="mt-1.5 overflow-x-auto">
          <table className="w-full border-collapse text-tabla">
            <thead>
              <tr className="text-right">
                {tableHeaders.map((cabecera, i) => (
                  <th key={cabecera} scope="col" className={`border-b border-[var(--borde)] px-1.5 py-1 font-semibold ${i === 0 ? 'text-left' : ''}`}>
                    {cabecera}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((fila, i) => (
                <tr key={i} className="text-right tabular-nums">
                  {fila.map((celda, j) => (
                    <td key={j} className={`border-t border-[var(--fondo-sutil)] px-1.5 py-1 ${j === 0 ? 'text-left' : ''}`}>{celda}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

/** Reparto de resultados en una barra partida, con leyenda de texto (nunca sólo color). */
export function BarraReparto({ id, titulo, subtitulo, resumen, partes, nota }: {
  id: string;
  titulo: string;
  subtitulo: string;
  resumen: string;
  partes: ReadonlyArray<{ clave: string; etiqueta: string; partidos: number; porcentaje: number; clase: string }>;
  nota?: ReactNode;
}) {
  const conPartidos = partes.filter((parte) => parte.partidos > 0);
  return (
    <section aria-labelledby={id} className={`${TARJETA} px-4 py-3.5`}>
      <h2 id={id} className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
      <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">{subtitulo}</p>
      <div role="img" aria-label={resumen} className="mt-2 flex h-3 overflow-hidden rounded-[4px] bg-[var(--fondo-sutil)]">
        {conPartidos.map((parte) => (
          <span key={parte.clave} aria-hidden="true" className={parte.clase} style={{ width: `${parte.porcentaje}%` }} />
        ))}
      </div>
      <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-nota text-[var(--texto-suave)]">
        {partes.map((parte) => (
          <li key={parte.clave} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-3 rounded-[3px] ${parte.clase}`} />
            <span>{parte.etiqueta}</span>
            <span className="font-semibold tabular-nums text-[var(--texto)]">{parte.porcentaje} %</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{parte.partidos}</span>
          </li>
        ))}
      </ul>
      {nota !== undefined && <p className="m-0 mt-1.5 text-nota text-[var(--texto-suave)]">{nota}</p>}
    </section>
  );
}
