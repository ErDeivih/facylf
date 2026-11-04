import { siglas } from '@/lib/pantalla-competicion';
import { etiquetaAmbito, etiquetaCategoria, etiquetaDivision, etiquetaModalidad, fechaCorta } from '@/lib/vocabulario-pantalla';
import type { FilaGrupoDeLaEdicion, FilaPortadaGrupo } from '@/consultas/competiciones';
import type { FilaEdicionDeLaCompeticion } from '@/consultas/competiciones';
import { SelectorEnlace } from './SelectorEnlace';

/**
 * Cabecera de la pantalla de competición (pantalla 2 del prototipo).
 *
 * Todo lo que enseña sale de `grupo-por-id`: nombre publicado, grupo, categoría, división, modalidad,
 * jornadas previstas y hasta qué jornada hay datos. Lo que la base no sabe no se rellena: la barra de
 * temporada no se pinta sin jornadas previstas y las fechas de los extremos sólo aparecen si existen.
 */
export function CabeceraCompeticion({ grupo, grupos, temporadas, rutaBase, fechaInicio, fechaFin }: {
  grupo: FilaPortadaGrupo;
  grupos: readonly FilaGrupoDeLaEdicion[];
  temporadas: readonly FilaEdicionDeLaCompeticion[];
  rutaBase: string;
  fechaInicio: string | null;
  fechaFin: string | null;
}) {
  const totalJornadas = grupo.jornadas_previstas;
  const jornadaActual = grupo.jornada_actual;
  const porcentaje = totalJornadas && totalJornadas > 0 && jornadaActual !== null
    ? Math.min(100, Math.round((jornadaActual / totalJornadas) * 100))
    : null;
  const pestañas = [
    { texto: 'Clasificación', activa: true },
    { texto: 'Jornadas', activa: false },
    { texto: 'Goleadores', activa: false },
    { texto: 'Disciplina', activa: false },
    { texto: 'Equipos', activa: false },
  ];
  return (
    <section className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="flex flex-wrap items-center gap-4 px-5 pt-5 pb-3">
        <div aria-hidden="true"
          className="flex size-14 flex-none items-center justify-center rounded-[var(--radius-tarjeta)] bg-[var(--accion)] text-lg font-extrabold text-white">
          {siglas(grupo.edicion)}
        </div>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
          <h1 className="m-0 text-2xl font-extrabold tracking-[-0.02em] text-[var(--texto)]">
            {grupo.edicion} · {grupo.grupo}
          </h1>
          <span className="text-[13px] text-[var(--texto-suave)]">
            {[
              etiquetaCategoria(grupo.categoria),
              // Lo que el vocabulario no sabe no se rellena: se omite del subtítulo en vez de poner
              // «Sin clasificar» dentro de la frase, que se lee como si fuera un dato.
              grupo.modalidad !== 'desconocida' ? etiquetaModalidad(grupo.modalidad) : null,
              grupo.ambito !== 'desconocido' ? etiquetaAmbito(grupo.ambito) : null,
              grupo.division !== 'desconocida' ? etiquetaDivision(grupo.division) : null,
            ].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {grupos.length > 1 && (
            <SelectorEnlace
              etiqueta="Grupo"
              id="selector-grupo"
              valorActual={String(grupo.grupo_id)}
              opciones={grupos.map((g) => ({
                valor: String(g.grupo_id),
                texto: g.grupo,
                href: `/explorar/competicion/${g.grupo_id}`,
              }))}
            />
          )}
          {temporadas.length > 1 && (
            <SelectorEnlace
              etiqueta="Temporada"
              id="selector-temporada"
              valorActual={String(grupo.edicion_id)}
              opciones={temporadas.map((t) => ({
                valor: String(t.edicion_id),
                texto: t.temporada,
                href: `/explorar/competicion/${t.grupo_id}`,
              }))}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-5 pb-3">
        {porcentaje !== null && (
          <div className="h-1.5 overflow-hidden rounded-[3px] bg-[var(--fondo-sutil)]"
            role="progressbar" aria-valuemin={0} aria-valuemax={totalJornadas ?? 0} aria-valuenow={jornadaActual ?? 0}
            aria-label={`Jornada ${jornadaActual ?? 0} de ${totalJornadas}`}>
            <div className="h-full bg-[var(--accion)]" style={{ width: `${porcentaje}%` }} />
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--texto-suave)]">
          <span>{fechaCorta(fechaInicio) ?? ''}</span>
          <span className="font-semibold text-[var(--texto)]">
            {jornadaActual !== null && totalJornadas !== null
              ? `Jornada ${jornadaActual} de ${totalJornadas}`
              : jornadaActual !== null
                ? `Jornada ${jornadaActual}`
                : totalJornadas !== null
                  ? `${totalJornadas} jornadas previstas`
                  : 'Sin jornadas publicadas'}
          </span>
          <span>{fechaCorta(fechaFin) ?? ''}</span>
        </div>
      </div>

      <nav aria-label="Secciones" className="flex gap-0.5 overflow-x-auto border-t border-[var(--fondo-sutil)] px-3">
        {pestañas.map((p) => p.activa
          ? (
            <a key={p.texto} href={rutaBase} aria-current="page"
              className="border-b-2 border-[var(--accion)] px-3.5 py-3 text-sm font-semibold text-[var(--accion)]">
              {p.texto}
            </a>
          )
          : (
            // Las demás pestañas todavía no tienen pantalla. Se enseñan como el prototipo pero se
            // desactivan: un enlace que lleva a «en obras» sin decirlo es peor que uno apagado.
            <span key={p.texto} aria-disabled="true" title="Todavía no tiene pantalla"
              className="cursor-not-allowed px-3.5 py-3 text-sm font-medium text-[var(--texto-tenue)]">
              {p.texto}
            </span>
          ))}
      </nav>
    </section>
  );
}
