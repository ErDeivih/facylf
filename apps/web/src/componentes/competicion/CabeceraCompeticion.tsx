import { EscudoFederacion } from '@/componentes/EscudoFederacion';
import { Card, CardContent, Progress, TabsNav, type Pestana } from '@/componentes/ui';
import { subtituloCompeticion } from '@/lib/pantalla-competicion';
import { fechaCorta } from '@/lib/vocabulario-pantalla';
import type { FilaEdicionDeLaCompeticion, FilaGrupoDeLaEdicion, FilaPortadaGrupo } from '@/consultas/competiciones';
import { SelectorEnlace } from './SelectorEnlace';

/**
 * Cabecera de la pantalla de competición (pantalla 2 del prototipo) con la capa `componentes/ui`.
 *
 * Todo lo que enseña sale de `grupo-por-id`: nombre publicado, grupo, categoría, modalidad, ámbito,
 * jornadas previstas y hasta qué jornada hay datos. Lo que la base no sabe no se rellena: la barra de
 * temporada no se pinta sin jornadas previstas, las fechas de los extremos sólo aparecen si existen y
 * los desplegables sólo si hay más de una opción real que elegir.
 *
 * Las pestañas con pantalla son enlaces (el estado vive en la URL); las que aún no la tienen se
 * apagan con `aria-disabled`, no se finge un enlace muerto. La barra se desplaza dentro de sí misma y
 * no arrastra al documento.
 */
export function CabeceraCompeticion({ grupo, grupos, temporadas, rutaBase, fechaInicio, fechaFin, fechaUltimaJugada, activa = 'clasificacion' }: {
  grupo: FilaPortadaGrupo;
  grupos: readonly FilaGrupoDeLaEdicion[];
  temporadas: readonly FilaEdicionDeLaCompeticion[];
  rutaBase: string;
  fechaInicio: string | null;
  /** Última fecha publicada del calendario, jugada o no. Sólo se usa si no llega la jugada. */
  fechaFin: string | null;
  /**
   * Fecha de la última jornada JUGADA (partidos con resultado), no la última programada. Es la fecha
   * derecha de la barra de temporada. Si no llega —campo aún no disponible— se pinta la del calendario
   * para no dejar el extremo vacío, pero la fuente buena es ésta.
   */
  fechaUltimaJugada?: string | null;
  /** Pestaña que se está viendo; las que tienen pantalla se marcan y enlazan. */
  activa?: 'clasificacion' | 'jornadas' | 'calendario' | 'estadisticas' | 'proyeccion';
}) {
  const fechaDerecha = fechaUltimaJugada === undefined ? fechaFin : fechaUltimaJugada;
  const totalJornadas = grupo.jornadas_previstas;
  const jornadaActual = grupo.jornada_actual;
  const porcentaje = totalJornadas && totalJornadas > 0 && jornadaActual !== null
    ? Math.min(100, Math.round((jornadaActual / totalJornadas) * 100))
    : null;
  const subtitulo = subtituloCompeticion(grupo);
  const pestanas: Pestana[] = [
    { etiqueta: 'Clasificación', href: rutaBase, activa: activa === 'clasificacion' },
    { etiqueta: 'Jornadas', href: `${rutaBase}/jornadas`, activa: activa === 'jornadas' },
    { etiqueta: 'Calendario', href: `${rutaBase}/calendario`, activa: activa === 'calendario' },
    { etiqueta: 'Estadísticas', href: `${rutaBase}/estadisticas`, activa: activa === 'estadisticas' },
    { etiqueta: 'Proyección', href: `${rutaBase}/proyeccion`, activa: activa === 'proyeccion' },
    // Goleadores está en esta misma página: la pestaña lleva a su sección. Disciplina y Equipos no tienen
    // pantalla y se han quitado de la barra: una pestaña apagada que no lleva a ninguna parte sólo ocupa
    // sitio y confunde (hallazgo 2 de Codex, 16/11/2026).
    { etiqueta: 'Goleadores', href: `${rutaBase}#goleadores`, activa: false },
  ];
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-wrap items-center gap-4 px-5 pb-1 pt-5">
        {/* Escudo de la federación dueña de la competición; si no hay, sus siglas. */}
        <EscudoFederacion codigo={grupo.federacion} nombre={grupo.federacion_nombre} tieneEscudo={grupo.federacion_tiene_escudo} />
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
          <h1 className="m-0 text-titulo font-bold tracking-[-0.02em] text-[var(--texto)]">
            {grupo.edicion} · {grupo.grupo}
          </h1>
          {subtitulo !== '' && <span className="text-tabla text-[var(--texto-suave)]">{subtitulo}</span>}
        </div>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
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
      </CardContent>

      <div className="flex flex-col gap-1.5 px-5 pb-3.5">
        {porcentaje !== null && (
          <Progress
            valor={porcentaje}
            valorActual={jornadaActual ?? 0}
            valorMax={totalJornadas ?? 0}
            etiqueta={`Jornada ${jornadaActual ?? 0} de ${totalJornadas ?? 0}`}
            className="h-1.5"
          />
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
          <span>{fechaCorta(fechaDerecha) ?? ''}</span>
        </div>
      </div>

      {/* `py-1` da aire al anillo de foco: la barra recorta en horizontal (`overflow-x-auto`) y el
          enlace mide el alto justo, así que sin relleno el `outline` se recortaba (hallazgo C5 del QA). */}
      <div className="border-t border-[var(--fondo-sutil)] px-3 py-1">
        <TabsNav pestanas={pestanas} etiqueta="Secciones" />
      </div>
    </Card>
  );
}
