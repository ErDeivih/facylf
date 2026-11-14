import { Alert, Badge, Card, CardContent, Progress } from '@/componentes/ui';

/**
 * Panel de calidad del grupo: actas, última actualización y las reglas de coherencia.
 *
 * Todo sale de los partidos y de la foto del grupo (no se inventa nada). Si alguna regla falla, el panel lo dice
 * con el descuadre exacto y deja claro que la tabla NO se publica como definitiva. Si la tabla oficial es de otra
 * jornada, se marca «por conciliar» con el motivo, para no enseñar dos cifras que se contradicen.
 *
 * Con la capa `componentes/ui`: tarjeta, insignias de OK/KO y barra de actas. El color nunca va solo: cada
 * insignia lleva su texto y cada descuadre su signo.
 */
export function PanelCalidad({ actas, conResultado, porcentajeActas, fecha, descuadres, jornadaOficial, jornadaResultados, hrefSinActa }: {
  actas: number;
  conResultado: number;
  porcentajeActas: number;
  fecha: string | null;
  descuadres: { pj: number; puntos: number; goles: number } | null;
  jornadaOficial: number | null;
  jornadaResultados: number | null;
  /** A dónde lleva el «X/Y» de actas: la lista de partidos sin acta. */
  hrefSinActa?: string;
}) {
  const reglas: Array<{ nombre: string; detalle: string; valor: number }> = [
    { nombre: 'Partidos jugados', detalle: 'PJ = V+E+D', valor: descuadres?.pj ?? 0 },
    { nombre: 'Puntos', detalle: 'Puntos = 3V+E', valor: descuadres?.puntos ?? 0 },
    { nombre: 'Goles', detalle: 'ΣGF = ΣGC', valor: descuadres?.goles ?? 0 },
  ];
  const ko = reglas.filter((r) => Number(r.valor) !== 0);
  const porConciliar = jornadaOficial !== null && jornadaResultados !== null && jornadaOficial !== jornadaResultados;

  return (
    <Card className="basis-full">
      <CardContent className="px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-nota font-semibold text-[var(--texto-suave)]">Calidad del grupo</h2>
          {ko.length > 0
            ? <Badge variant="ko">{ko.length === 1 ? '1 regla no cuadra' : `${ko.length} reglas no cuadran`}</Badge>
            : <Badge variant="ok">Las reglas cuadran</Badge>}
        </div>

        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-nota text-[var(--texto)] sm:grid-cols-5">
          <div className="flex flex-col gap-0.5">
            <dt className="m-0 text-[var(--texto-suave)]">Actas</dt>
            <dd className="m-0 font-semibold">
              {hrefSinActa
                ? <a className="underline decoration-dotted" href={hrefSinActa}>{actas}/{conResultado} ({porcentajeActas} %)</a>
                : <>{actas}/{conResultado} ({porcentajeActas} %)</>}
            </dd>
            <Progress valor={porcentajeActas} etiqueta={`Actas: ${porcentajeActas} % de los partidos con resultado`} className="mt-1" />
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="m-0 text-[var(--texto-suave)]">Última actualización</dt>
            <dd className="m-0 font-semibold">{fecha ?? 'sin fecha'}</dd>
          </div>
          {reglas.map((r) => (
            <div key={r.nombre} className="flex flex-col gap-0.5">
              <dt className="m-0 text-[var(--texto-suave)]" title={r.detalle}>{r.nombre}</dt>
              <dd className="m-0">
                {Number(r.valor) === 0
                  ? <Badge variant="ok">Cuadra</Badge>
                  : <Badge variant="ko">No cuadra ({Number(r.valor) > 0 ? '+' : ''}{r.valor})</Badge>}
              </dd>
            </div>
          ))}
        </dl>

        {(ko.length > 0 || porConciliar) && (
          <Alert variant={ko.length > 0 ? 'error' : 'aviso'} className="mt-3" role="status">
            {ko.length > 0 && (
              <p className="m-0">
                <strong>La tabla no se publica como definitiva:</strong>{' '}
                {ko.map((r) => `${r.nombre} (${r.detalle})`).join(', ')} no cuadra.
              </p>
            )}
            {ko.length > 0 && porConciliar && ' '}
            {porConciliar && (
              <p className="m-0">
                <strong>Cortes distintos:</strong> la federación publicó su tabla de la jornada {jornadaOficial} y
                los resultados llegan a la {jornadaResultados}; no es un error: se muestra la calculada.
              </p>
            )}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
