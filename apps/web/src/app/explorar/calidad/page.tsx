import Link from 'next/link';
import type { Metadata, Route } from 'next';

import { CALIDAD_GLOBAL, type FilaCalidadGlobal } from '@/consultas/calidad';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';

export const metadata: Metadata = {
  title: 'Calidad de los grupos — Fondo Popular',
  description: 'Reglas de coherencia por grupo (PJ, puntos, goles), cobertura de actas y contador de incoherencias.',
};

export const revalidate = 120;

/**
 * Panel de calidad global: todos los grupos de la temporada con las tres reglas y el % de actas.
 *
 * El contador de KO se calcula CON LAS MISMAS FILAS que se pintan (no con otra consulta), así que no puede
 * contradecir a la columna: si una fila dice KO, cuenta; si dice OK, no cuenta.
 */
export default async function PantallaCalidad() {
  const temporada = '2026-27';
  let filas: FilaCalidadGlobal[] = [];
  try {
    filas = await consulta<FilaCalidadGlobal>(CALIDAD_GLOBAL.sql, [temporada], {
      presupuestoMs: CALIDAD_GLOBAL.presupuestoMs,
    });
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <p className="p-4 text-cuerpo text-[var(--texto)]">El canónico no está disponible ahora mismo.</p>;
    }
    throw error;
  }

  const ko = filas.filter((f) => f.resultado === 'KO').length;
  const ok = filas.length - ko;
  const total = filas[0]?.total_grupos ?? filas.length;
  const koSql = filas[0]?.total_ko ?? ko;
  const porcentajeMedio = filas.length
    ? Math.round(filas.reduce((a, f) => a + Number(f.porcentaje_actas), 0) / filas.length)
    : 0;

  return (
    <div className="flex flex-col gap-[18px]">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
        <Link className="hover:underline" href={'/' as Route}>Inicio</Link>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--texto)]" aria-current="page">Calidad de los grupos</span>
      </nav>

      <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Calidad de los grupos</h1>
      <p className="m-0 text-nota text-[var(--texto-suave)]">
        Temporada {temporada} · reglas calculadas desde los partidos · el contador de KO cuenta las filas KO de esta
        misma tabla.
      </p>

      <div className="flex flex-wrap gap-2" aria-label="Resumen de calidad">
        <span className="rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-2 py-1 text-nota text-[var(--texto)]">
          Grupos <strong data-total-grupos>{filas.length}</strong> de {total}
        </span>
        <span className="rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-2 py-1 text-nota text-[var(--texto)]">
          OK <strong>{ok}</strong>
        </span>
        <span className="rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-2 py-1 text-nota text-[var(--texto)]">
          KO <strong data-total-ko>{ko}</strong> {koSql === ko ? '· cuadra con la columna' : `· la columna dice ${koSql}`}
        </span>
        <span className="rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-2 py-1 text-nota text-[var(--texto)]">
          Actas medias <strong>{porcentajeMedio} %</strong>
        </span>
      </div>

      <section aria-label="Tabla de calidad por grupo"
        className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
        <div data-tabla-scroll tabIndex={0} role="region" aria-label="Calidad por grupo: desplázate en horizontal"
          className="relative overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-tabla">
            <thead>
              <tr className="text-right text-etiqueta uppercase tracking-[0.05em] text-[var(--texto-suave)]">
                <th scope="col" className="py-2 pl-4 pr-1.5 text-left font-semibold">Competición · grupo</th>
                <th scope="col" className="px-1.5 py-2 font-semibold" title="PJ = V+E+D">PJ</th>
                <th scope="col" className="px-1.5 py-2 font-semibold" title="Puntos = 3V+E">Puntos</th>
                <th scope="col" className="px-1.5 py-2 font-semibold" title="Suma de goles a favor = suma de goles en contra">ΣGF</th>
                <th scope="col" className="px-1.5 py-2 font-semibold">Actas</th>
                <th scope="col" className="py-2 pl-1.5 pr-4 font-semibold">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.grupo_id} className="text-right">
                  <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5 text-left text-[var(--texto)]">
                    <Link href={`/explorar/competicion/${f.grupo_id}` as Route} className="hover:underline">
                      {f.edicion} · {f.grupo}
                    </Link>
                  </td>
                  <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5">{Number(f.descuadre_pj) === 0 ? 'OK' : `KO (${f.descuadre_pj})`}</td>
                  <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5">{Number(f.descuadre_puntos) === 0 ? 'OK' : `KO (${f.descuadre_puntos})`}</td>
                  <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5">{Number(f.descuadre_goles) === 0 ? 'OK' : `KO (${f.descuadre_goles})`}</td>
                  <td className="border-t border-[var(--fondo-sutil)] px-1.5 py-1.5">{f.con_acta}/{f.con_resultado} ({f.porcentaje_actas} %)</td>
                  <td className="border-t border-[var(--fondo-sutil)] py-1.5 pl-1.5 pr-4 font-semibold">{f.resultado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filas.length === 0 && <p className="m-0 px-4 pb-4 text-cuerpo text-[var(--texto-suave)]">No hay grupos con resultados en esta temporada.</p>}
      </section>
    </div>
  );
}
