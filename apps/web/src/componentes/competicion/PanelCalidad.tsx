/**
 * Panel de calidad del grupo: actas, última actualización y las reglas de coherencia.
 *
 * Todo sale de los partidos y de la foto del grupo (no se inventa nada). Si alguna regla falla, el panel lo dice
 * con el descuadre exacto y deja claro que la tabla NO se publica como definitiva. Si la tabla oficial es de otra
 * jornada, se marca «por conciliar» con el motivo, para no enseñar dos cifras que se contradicen.
 */
export function PanelCalidad({ actas, conResultado, porcentajeActas, fecha, descuadres, jornadaOficial, jornadaResultados }: {
  actas: number;
  conResultado: number;
  porcentajeActas: number;
  fecha: string | null;
  descuadres: { pj: number; puntos: number; goles: number } | null;
  jornadaOficial: number | null;
  jornadaResultados: number | null;
}) {
  const reglas = [
    { nombre: 'PJ = V+E+D', valor: descuadres?.pj ?? 0 },
    { nombre: 'Puntos = 3V+E', valor: descuadres?.puntos ?? 0 },
    { nombre: 'ΣGF = ΣGC', valor: descuadres?.goles ?? 0 },
  ];
  const ko = reglas.filter((r) => Number(r.valor) !== 0);
  const porConciliar = jornadaOficial !== null && jornadaResultados !== null && jornadaOficial !== jornadaResultados;

  return (
    <section aria-label="Calidad del grupo"
      className="basis-full rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3">
      <h2 className="m-0 text-etiqueta font-semibold uppercase tracking-[0.05em] text-[var(--texto-suave)]">Calidad del grupo</h2>
      <dl className="m-0 mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-nota text-[var(--texto)] sm:grid-cols-4">
        <div>
          <dt className="m-0 text-[var(--texto-suave)]">Actas</dt>
          <dd className="m-0 font-semibold">{actas}/{conResultado} ({porcentajeActas} %)</dd>
        </div>
        <div>
          <dt className="m-0 text-[var(--texto-suave)]">Última actualización</dt>
          <dd className="m-0 font-semibold">{fecha ?? 'sin fecha'}</dd>
        </div>
        {reglas.map((r) => (
          <div key={r.nombre}>
            <dt className="m-0 text-[var(--texto-suave)]">{r.nombre}</dt>
            <dd className="m-0 font-semibold">
              {Number(r.valor) === 0 ? 'OK' : `KO (${Number(r.valor) > 0 ? '+' : ''}${r.valor})`}
            </dd>
          </div>
        ))}
      </dl>
      {(ko.length > 0 || porConciliar) && (
        <p role="alert" className="m-0 mt-2 rounded-[var(--radius-sm)] border border-[var(--borde)] bg-[var(--fondo-sutil)] px-2 py-1 text-nota text-[var(--texto)]">
          {ko.length > 0 && (
            <><strong>Aviso de calidad:</strong> incoherencia en {ko.map((r) => r.nombre).join(', ')}. La tabla no se publica como definitiva.</>
          )}
          {ko.length > 0 && porConciliar && ' '}
          {porConciliar && (
            <><strong>Por conciliar:</strong> la federación publicó su tabla de la jornada {jornadaOficial} y los resultados llegan a la {jornadaResultados}; se muestra la calculada.</>
          )}
        </p>
      )}
    </section>
  );
}
