import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPortadaGrupo } from '@/consultas/competiciones';

/**
 * Cabecera de contexto del detalle de una jornada: competición, grupo, temporada y jornada.
 *
 * Es deliberadamente más pequeña que `CabeceraCompeticion`: aquí el usuario ya ha elegido competición
 * y grupo, y lo que necesita para situarse es la jornada y sus fechas, además de las flechas para
 * recorrer el calendario. Las flechas llevan a jornadas que EXISTEN en el grupo: cuando no hay anterior
 * o siguiente se apagan, porque un «‹» que devuelve «no encontrado» es peor que uno desactivado.
 */
export function CabeceraJornada({ grupo, numero, rango, hrefAnterior, hrefSiguiente, hrefClasificacion }: {
  grupo: FilaPortadaGrupo;
  numero: number;
  rango: string | null;
  hrefAnterior: string | null;
  hrefSiguiente: string | null;
  hrefClasificacion: string;
}) {
  const flecha = 'flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--borde)] bg-[var(--fondo-elevado)] text-lg';
  const apagada = `${flecha} cursor-not-allowed border-dashed text-[var(--texto-tenue)]`;
  return (
    <header className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="m-0 text-nota text-[var(--texto-suave)]">
            {grupo.edicion} · {grupo.grupo} · {grupo.temporada}
          </p>
          <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Jornada {numero}</h1>
          {rango !== null && <p className="m-0 text-tabla text-[var(--texto-suave)]">{rango}</p>}
        </div>
        <div className="flex gap-1">
          {hrefAnterior
            ? (
              <Link href={hrefAnterior as Route} aria-label="Jornada anterior"
                className={`${flecha} text-[var(--texto-suave)]`}>
                <span aria-hidden="true">‹</span>
              </Link>
            )
            : (
              <span aria-disabled="true" className={apagada}>
                <span aria-hidden="true">‹</span>
                <span className="sr-only">No hay jornada anterior</span>
              </span>
            )}
          {hrefSiguiente
            ? (
              <Link href={hrefSiguiente as Route} aria-label="Jornada siguiente"
                className={`${flecha} text-[var(--texto-suave)]`}>
                <span aria-hidden="true">›</span>
              </Link>
            )
            : (
              <span aria-disabled="true" className={apagada}>
                <span aria-hidden="true">›</span>
                <span className="sr-only">No hay jornada siguiente</span>
              </span>
            )}
        </div>
      </div>
      {/* Desde una jornada se llega a la tabla y a su proyección sin pasar por la portada del grupo. */}
      <p className="m-0 mt-2 flex flex-wrap gap-x-4 text-nota">
        <Link href={hrefClasificacion as Route}
          className="inline-flex min-h-11 items-center text-[var(--texto-suave)] hover:text-[var(--accion)] hover:underline">
          Clasificación
        </Link>
        <Link href={`${hrefClasificacion}/proyeccion` as Route}
          className="inline-flex min-h-11 items-center text-[var(--texto-suave)] hover:text-[var(--accion)] hover:underline">
          Proyección
        </Link>
      </p>
    </header>
  );
}
