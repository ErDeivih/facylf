import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { ACTA_DEL_PARTIDO, type FilaActaCanonica } from '@/consultas/partidos';
import { SinCanonico } from '@/componentes/SinCanonico';
import { AlineacionesActa, type EquipoEnActa } from '@/componentes/acta/AlineacionesActa';
import { CabeceraActa } from '@/componentes/acta/CabeceraActa';
import { ContextoActa } from '@/componentes/acta/ContextoActa';
import { CronologiaActa } from '@/componentes/acta/CronologiaActa';
import { MigaActa } from '@/componentes/acta/MigaActa';
import { PrediccionPartido } from '@/componentes/partidos/PrediccionPartido';
import type { PrediccionDePartido } from '@/lib/prediccion';
import {
  alineacionesPorLado, construyeCronologia, etiquetaEstado, tieneActa, tituloDeActa,
} from '@/lib/acta';

/**
 * Acta de un partido: `/explorar/acta/[id]`, con el id de `core.match`.
 *
 * Una sola consulta (`acta-del-partido`) trae el partido, los eventos, las alineaciones, los árbitros,
 * el cuerpo técnico y los enfrentamientos anteriores: nada de una petición por bloque ni por jugador.
 *
 * Cuándo es un 404 de verdad (y no una página vacía):
 *  · el id no es un entero positivo;
 *  · no existe un partido con ese id;
 *  · el partido no tiene informe de acta, o su calidad es `unavailable` (se comprobó que la federación
 *    no ofrece el acta). No se rellena con el marcador solo: eso no es un acta.
 *
 * Como en el detalle de la jornada, aquí no hay `Suspense`: el 404 se decide después de leer el acta y
 * un `notFound()` por debajo de un límite de suspensión contestaría 200 con cuerpo de 404.
 */
export const revalidate = 60;

/** Un id de la URL sólo vale si es un entero positivo; cualquier otra cosa es una página que no existe. */
function idDePartido(crudo: string | undefined): number | null {
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** El acta, cacheada por React: la comparten `generateMetadata` y la página para no pedirla dos veces. */
const actaDe = cache(async (id: number): Promise<FilaActaCanonica | undefined> => {
  const [fila] = await consulta<FilaActaCanonica>(ACTA_DEL_PARTIDO.sql, [id]);
  return fila;
});

/** La pestaña del navegador dice el partido y su jornada, no el título genérico del sitio. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: idCrudo } = await params;
  const id = idDePartido(idCrudo);
  if (id === null) return {};
  try {
    const acta = await actaDe(id);
    if (!acta || !tieneActa(acta.calidad_acta)) return {};
    return { title: tituloDeActa({ local: acta.local, visitante: acta.visitante, jornada: acta.jornada }) };
  } catch {
    // Sin canónico la página ya enseña su estado de error; el título por defecto del sitio vale.
    return {};
  }
}

export default async function PantallaActa({ params }: { params: Promise<{ id: string }> }) {
  const { id: idCrudo } = await params;
  const id = idDePartido(idCrudo);
  if (id === null) notFound();

  let acta: FilaActaCanonica | undefined;
  try {
    acta = await actaDe(id);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Acta" motivo={error.message} />;
    }
    throw error;
  }
  if (!acta || !tieneActa(acta.calidad_acta)) notFound();

  // La predicción sólo se enseña si están los tres porcentajes y los datos de la liga: una fila a
  // medias no se completa con ceros ni con 33/33/33.
  const prediccion: PrediccionDePartido | null =
    acta.pred_local != null && acta.pred_empate != null && acta.pred_visitante != null
      && acta.pred_marcador != null && acta.pred_prob_marcador != null
      && acta.liga_media_total != null && acta.liga_ventaja_casa != null && acta.liga_partidos != null
      ? {
        prob_local: Number(acta.pred_local),
        prob_empate: Number(acta.pred_empate),
        prob_visitante: Number(acta.pred_visitante),
        marcador_probable: acta.pred_marcador,
        prob_marcador: Number(acta.pred_prob_marcador),
        media_total: Number(acta.liga_media_total),
        ventaja_casa: Number(acta.liga_ventaja_casa),
        partidos_liga: Number(acta.liga_partidos),
        banda: acta.pred_local_low != null && acta.pred_local_high != null
          && acta.pred_empate_low != null && acta.pred_empate_high != null
          && acta.pred_visitante_low != null && acta.pred_visitante_high != null
          ? {
            local: [Number(acta.pred_local_low), Number(acta.pred_local_high)],
            empate: [Number(acta.pred_empate_low), Number(acta.pred_empate_high)],
            visitante: [Number(acta.pred_visitante_low), Number(acta.pred_visitante_high)],
          }
          : null,
      }
      : null;

  const equipos: { local: EquipoEnActa; visitante: EquipoEnActa } = {
    local: {
      nombre: acta.local,
      nombreCorto: acta.local_nombre_corto,
      equipoId: acta.local_id,
      clubId: acta.local_club_id,
      tieneEscudo: acta.local_tiene_escudo,
    },
    visitante: {
      nombre: acta.visitante,
      nombreCorto: acta.visitante_nombre_corto,
      equipoId: acta.visitante_id,
      clubId: acta.visitante_club_id,
      tieneEscudo: acta.visitante_tiene_escudo,
    },
  };

  const jugado = acta.goles_local !== null && acta.goles_visitante !== null;
  const resultado: 'local' | 'empate' | 'visitante' | null = !jugado
    ? null
    : (acta.goles_local as number) > (acta.goles_visitante as number)
      ? 'local'
      : (acta.goles_local as number) === (acta.goles_visitante as number) ? 'empate' : 'visitante';
  const localCorto = acta.local_nombre_corto ?? acta.local;
  const visitanteCorto = acta.visitante_nombre_corto ?? acta.visitante;

  return (
    <div className="flex flex-col gap-[18px]">
      <MigaActa acta={acta} />
      <CabeceraActa acta={acta} />
      {/* En un partido jugado la expectativa previa es contexto, no el contenido principal: va al
          lateral para no empujar la cronología (criterio de Claude, 16/11/2026). */}
      {!jugado && (
        <PrediccionPartido
          local={localCorto}
          visitante={visitanteCorto}
          prediccion={prediccion}
          jugado={false}
          resultado={null}
        />
      )}
      <div className="flex flex-wrap items-start gap-[18px]">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-[18px]">
          <CronologiaActa
            lineas={construyeCronologia(acta.eventos)}
            // El cierre del acta sólo se escribe cuando el partido está cerrado con resultado oficial.
            cierre={acta.estado === 'played' ? etiquetaEstado(acta.estado) : null}
          />
        </div>
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-[18px]">
          {jugado && (
            <PrediccionPartido
              local={localCorto}
              visitante={visitanteCorto}
              prediccion={prediccion}
              jugado
              resultado={resultado}
            />
          )}
          <ContextoActa
            oficiales={acta.oficiales}
            enfrentamientos={acta.enfrentamientos}
            calidad={acta.calidad_acta}
          />
        </aside>
      </div>
      <AlineacionesActa
        alineaciones={alineacionesPorLado(acta.alineaciones, acta.cuerpo_tecnico)}
        equipos={equipos}
        eventos={acta.eventos}
      />
    </div>
  );
}
