import { EscudoFederacion } from '@/componentes/EscudoFederacion';
import { subtituloCompeticion } from '@/lib/pantalla-competicion';
import { fechaCorta } from '@/lib/vocabulario-pantalla';
import type { FilaEdicionDeLaCompeticion, FilaGrupoDeLaEdicion, FilaPortadaGrupo } from '@/consultas/competiciones';
import { SelectorEnlace } from './SelectorEnlace';

/** Las pestañas del prototipo. Clasificación y Jornadas tienen pantalla; las demás se apagan. */
const PESTANAS = [
  { texto: 'Clasificación', activa: true },
  { texto: 'Jornadas', activa: false },
  { texto: 'Calendario', activa: false },
  { texto: 'Estadísticas', activa: false },
  { texto: 'Goleadores', activa: false },
  { texto: 'Disciplina', activa: false },
  { texto: 'Equipos', activa: false },
] as const;

/**
 * Cabecera de la pantalla de competición (pantalla 2 del prototipo).
 *
 * Todo lo que enseña sale de `grupo-por-id`: nombre publicado, grupo, categoría, modalidad, ámbito,
 * jornadas previstas y hasta qué jornada hay datos. Lo que la base no sabe no se rellena: la barra de
 * temporada no se pinta sin jornadas previstas, las fechas de los extremos sólo aparecen si existen y
 * los desplegables sólo si hay más de una opción real que elegir.
 */
export function CabeceraCompeticion({ grupo, grupos, temporadas, rutaBase, fechaInicio, fechaFin, activa = 'clasificacion' }: {
  grupo: FilaPortadaGrupo;
  grupos: readonly FilaGrupoDeLaEdicion[];
  temporadas: readonly FilaEdicionDeLaCompeticion[];
  rutaBase: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  /** Pestaña que se está viendo; las dos que tienen pantalla se marcan y enlazan. */
  activa?: 'clasificacion' | 'jornadas' | 'calendario' | 'estadisticas';
}) {
  const totalJornadas = grupo.jornadas_previstas;
  const jornadaActual = grupo.jornada_actual;
  const porcentaje = totalJornadas && totalJornadas > 0 && jornadaActual !== null
    ? Math.min(100, Math.round((jornadaActual / totalJornadas) * 100))
    : null;
  const subtitulo = subtituloCompeticion(grupo);
  return (
    <section className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="flex flex-wrap items-center gap-4 px-5 pt-5 pb-3.5">
        {/* Escudo de la federación dueña de la competición; si no hay, sus siglas. */}
        <EscudoFederacion codigo={grupo.federacion} nombre={grupo.federacion_nombre} tieneEscudo={grupo.federacion_tiene_escudo} />
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
          <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
            {grupo.edicion} · {grupo.grupo}
          </h1>
          {subtitulo !== '' && <span className="text-tabla text-[var(--texto-suave)]">{subtitulo}</span>}
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

      <div className="flex flex-col gap-1.5 px-5 pb-3.5">
        {porcentaje !== null && (
          <div className="h-1.5 overflow-hidden rounded-[3px] bg-[var(--fondo-sutil)]"
            role="progressbar" aria-valuemin={0} aria-valuemax={totalJornadas ?? 0} aria-valuenow={jornadaActual ?? 0}
            aria-label={`Jornada ${jornadaActual ?? 0} de ${totalJornadas ?? 0}`}>
            <div className="h-full bg-[var(--accion)]" style={{ width: `${porcentaje}%` }} />
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-2 text-nota text-[var(--texto-suave)]">
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

      {/* `py-1` da aire al anillo de foco de la pestaña: la nav recorta en horizontal
          (`overflow-x-auto`) y el enlace mide justo el alto (46 px), así que sin este relleno el
          `outline` de 2 px con offset 2 se recortaba arriba y abajo (hallazgo C5 del QA). */}
      <nav aria-label="Secciones" className="relative flex gap-0.5 overflow-x-auto border-t border-[var(--fondo-sutil)] px-3 py-1">
        {PESTANAS.map((p) => {
          const esActiva = (p.texto === 'Clasificación' && activa === 'clasificacion')
            || (p.texto === 'Jornadas' && activa === 'jornadas')
            || (p.texto === 'Calendario' && activa === 'calendario')
            || (p.texto === 'Estadísticas' && activa === 'estadisticas');
          const href = p.texto === 'Clasificación'
            ? rutaBase
            : p.texto === 'Jornadas'
              ? `${rutaBase}/jornadas`
              : p.texto === 'Calendario'
                ? `${rutaBase}/calendario`
                : p.texto === 'Estadísticas'
                  ? `${rutaBase}/estadisticas`
                  : null;
          if (href === null) {
            return (
              <span key={p.texto} aria-disabled="true"
                className="flex h-[46px] cursor-not-allowed items-center px-3 text-sm font-medium whitespace-nowrap text-[var(--texto-suave)]">
                {p.texto}
              </span>
            );
          }
          return (
            <a key={p.texto} href={href} aria-current={esActiva ? 'page' : undefined}
              className={esActiva
                ? 'flex h-[46px] items-center px-3 text-sm font-semibold whitespace-nowrap text-[var(--accion)] shadow-[inset_0_-3px_0_var(--accion)]'
                : 'flex h-[46px] items-center px-3 text-sm font-medium whitespace-nowrap text-[var(--texto-suave)] hover:text-[var(--texto)]'}>
              {p.texto}
            </a>
          );
        })}
      </nav>
    </section>
  );
}
