/**
 * Matriz de marcadores de un partido: del 0-0 al 4-4, con el porcentaje de cada uno, y los cinco más
 * probables en una tabla.
 *
 * La predicción guarda la rejilla 0-0…5-5 (`analytics.poisson_partido.matriz`, valores 0..1). Aquí se
 * enseña hasta el 4-4, que cabe entera en 390 px; lo que queda fuera —cualquier marcador con cinco
 * goles o más de un equipo— se suma y se dice en una línea, para que los porcentajes visibles no
 * parezcan sumar 100.
 *
 * Filas = goles del local, columnas = goles del visitante. La intensidad del fondo acompaña al número
 * pero no lo sustituye: cada celda lleva su cifra.
 */
const MAXIMO = 4;
const GOLES = Array.from({ length: MAXIMO + 1 }, (_, i) => i);

const pct = (valor: number): string => (valor < 0.05 ? '0' : valor.toFixed(1).replace('.', ','));

export function MatrizMarcadores({ local, visitante, matriz }: {
  local: string;
  visitante: string;
  /** Celdas `"local-visitante"` con probabilidad 0..1. */
  matriz: Record<string, number>;
}) {
  const celdas = Object.entries(matriz)
    .map(([clave, p]) => {
      const [gl, gv] = clave.split('-').map(Number);
      return { clave, gl, gv, p: Number(p) * 100 };
    })
    .filter((c) => Number.isInteger(c.gl) && Number.isInteger(c.gv) && Number.isFinite(c.p));
  if (celdas.length === 0) return null;

  const total = celdas.reduce((s, c) => s + c.p, 0);
  // La rejilla guardada no llega a sumar 100 (falta la cola de 6 goles o más): se reparte en proporción.
  const escala = total > 0 ? 100 / total : 1;
  const valor = new Map(celdas.map((c) => [c.clave, c.p * escala]));
  const maximo = Math.max(...valor.values());
  const fuera = celdas.filter((c) => c.gl > MAXIMO || c.gv > MAXIMO).reduce((s, c) => s + c.p * escala, 0);
  const cinco = [...valor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="mt-3 flex flex-col gap-3">
      <table className="w-full border-collapse text-nota">
        <caption className="pb-1 text-left text-nota font-semibold text-[var(--texto)]">Marcadores más probables</caption>
        <tbody>
          {cinco.map(([clave, p]) => (
            <tr key={clave} className="border-t border-[var(--fondo-sutil)]">
              <th scope="row" className="py-1 text-left font-semibold tabular-nums text-[var(--texto)]">{clave}</th>
              <td className="py-1 text-right tabular-nums text-[var(--texto)]">{pct(p)} %</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <table className="w-full table-fixed border-collapse text-center text-nota tabular-nums">
          <caption className="pb-1 text-left text-nota font-semibold text-[var(--texto)]">
            Todos los marcadores, en %
          </caption>
          <thead>
            <tr>
              <td className="w-8 text-etiqueta text-[var(--texto-suave)]" aria-hidden="true">L / V</td>
              {GOLES.map((gv) => (
                <th key={gv} scope="col" className="py-1 font-semibold text-[var(--texto-suave)]">{gv}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GOLES.map((gl) => (
              <tr key={gl}>
                <th scope="row" className="py-1 font-semibold text-[var(--texto-suave)]">{gl}</th>
                {GOLES.map((gv) => {
                  const p = valor.get(`${gl}-${gv}`) ?? 0;
                  return (
                    <td key={gv} title={`${gl}-${gv}: ${pct(p)} %`}
                      style={{ backgroundColor: `color-mix(in srgb, var(--accion) ${Math.round((p / maximo) * 55)}%, transparent)` }}
                      className={`border border-[var(--fondo)] py-2 text-[var(--texto)] ${p === maximo ? 'font-extrabold outline outline-2 -outline-offset-2 outline-[var(--texto)]' : ''}`}>
                      {pct(p)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">
          Filas (L): goles de {local}. Columnas (V): goles de {visitante}. El recuadro marca el más probable.
          {fuera >= 0.1 ? ` Con cinco goles o más de un equipo: ${pct(fuera)} %.` : ''}
        </p>
      </div>
    </div>
  );
}
