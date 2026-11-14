import Link from 'next/link';
import type { Route } from 'next';
import type { FilaCalidadGlobal } from '@/consultas/calidad';
import { Badge, Progress } from '@/componentes/ui';

/**
 * Fila de calidad adaptada al móvil (revisión externa, 13/11/2026).
 *
 * En una pantalla de 390 px, una tabla de seis columnas obliga a desplazar en horizontal y a recorrer
 * cientos de filas sin contexto. Aquí cada grupo es un bloque con **nombre legible** y **una métrica
 * principal** (¿cuadra? y qué porcentaje de actas hay); las tres reglas, PJ, puntos y goles quedan al
 * desplegar la fila con un `<details>` nativo (teclado y lector de pantalla sin JavaScript).
 *
 * La estructura y las métricas son las mismas que las de la tabla: esto es la misma fila contada de
 * otra forma, no un panel distinto.
 */
export function FilaCalidad({ fila }: { fila: FilaCalidadGlobal }) {
  const ko = fila.resultado === 'KO';
  const reglas = [
    { nombre: 'Partidos jugados', detalle: 'PJ = V+E+D', valor: Number(fila.descuadre_pj) },
    { nombre: 'Puntos', detalle: 'Puntos = 3V+E', valor: Number(fila.descuadre_puntos) },
    { nombre: 'Goles', detalle: 'ΣGF = ΣGC', valor: Number(fila.descuadre_goles) },
  ];
  return (
    <details className="group border-b border-[var(--fondo-sutil)] last:border-b-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-cuerpo font-bold leading-snug break-words text-[var(--texto)]">{fila.edicion}</span>
          <span className="text-nota text-[var(--texto-suave)]">{fila.grupo}</span>
        </span>
        <span className="flex flex-none flex-col items-end gap-1">
          <Badge variant={ko ? 'ko' : 'ok'}>{ko ? 'No cuadra' : 'Cuadra'}</Badge>
          <span className="text-nota tabular-nums text-[var(--texto-suave)]">{fila.con_acta}/{fila.con_resultado} ({fila.porcentaje_actas} %)</span>
          <Progress valor={Number(fila.porcentaje_actas)} etiqueta={`Actas de ${fila.edicion} · ${fila.grupo}`} className="w-20" />
        </span>
      </summary>
      <div className="grid gap-3 px-4 pb-3">
        <dl className="m-0 grid grid-cols-3 gap-2 text-nota">
          {reglas.map((r) => (
            <div key={r.nombre} className="flex flex-col gap-0.5">
              <dt className="m-0 text-[var(--texto-suave)]" title={r.detalle}>{r.nombre}</dt>
              <dd className="m-0">
                {r.valor === 0
                  ? <Badge variant="ok">Cuadra</Badge>
                  : <Badge variant="ko">No cuadra ({r.valor > 0 ? '+' : ''}{r.valor})</Badge>}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-2 text-nota text-[var(--texto-suave)]">
          <span>
            PJ {fila.partidos} · con resultado {fila.con_resultado} · actas {fila.con_acta}
          </span>
          <Link href={`/explorar/competicion/${fila.grupo_id}` as Route}
            className="inline-flex min-h-11 items-center font-semibold text-[var(--accion)] hover:underline">
            Ver la ficha del grupo →
          </Link>
        </div>
      </div>
    </details>
  );
}
