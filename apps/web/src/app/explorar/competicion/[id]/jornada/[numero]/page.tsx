import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { GRUPO_POR_ID, type FilaPortadaGrupo } from '@/consultas/competiciones';
import { PARTIDOS_DE_GRUPO } from '@/consultas/partidos';
import { SinCanonico } from '@/componentes/SinCanonico';
import { CabeceraJornada } from '@/componentes/competicion/CabeceraJornada';
import { MigaCompeticion } from '@/componentes/competicion/MigaCompeticion';
import { PartidosDeJornada } from '@/componentes/competicion/PartidosDeJornada';
import {
  detalleDeJornada, numeroDeJornada, rangoDeFechas, rutaDeJornada, rutaDeJornadas, tituloDeJornada,
  type PartidoDeJornada,
} from '@/lib/jornadas';

/**
 * Detalle de una jornada: `/explorar/competicion/[id]/jornada/[numero]`.
 *
 * Enseña el contexto (competición, grupo, temporada, jornada), los partidos con su marcador —o «—»—,
 * la hora y el campo cuando la federación los publica, y las flechas a la jornada anterior y siguiente.
 * Sólo se navega a jornadas que existen en el grupo: si no hay anterior o siguiente, la flecha se apaga.
 *
 * Dos consultas como mucho y ninguna por partido: la portada del grupo (cacheada con `generateMetadata`)
 * y los partidos del grupo, que se reparten por jornada en el servidor.
 *
 * **Por qué aquí no hay `Suspense`:** el 404 de «esta jornada no está publicada» sólo se sabe cuando han
 * llegado los partidos, y un `notFound()` por debajo de un límite de suspensión contesta 200 con cuerpo
 * de 404. Entre una página que tarda un poco más y un código de estado que miente, se elige no mentir
 * (SISTEMA-DISENO §5). La pantalla es de dos consultas indexadas; no compensa.
 *
 * El enlace al acta no se pinta todavía: la pantalla de acta no existe. `PartidosDeJornada` acepta
 * `hrefActa` y sólo enlaza los partidos con acta publicada; cuando esa pantalla exista, se pasa aquí en
 * una línea y no hay ningún enlace muerto por el camino.
 */
export const revalidate = 60;

/** Un id de la URL sólo vale si es un entero positivo; cualquier otra cosa es una página que no existe. */
function idDeGrupo(crudo: string | undefined): number {
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

/** Portada del grupo, cacheada por React: la comparten `generateMetadata` y la página. */
const portadaDe = cache(async (id: number): Promise<FilaPortadaGrupo | undefined> => {
  const [fila] = await consulta<FilaPortadaGrupo>(GRUPO_POR_ID.sql, [id]);
  return fila;
});

/** Título de la pestaña: la jornada concreta dentro de su competición (hallazgo C7 del QA). */
export async function generateMetadata({ params }: {
  params: Promise<{ id: string; numero: string }>;
}): Promise<Metadata> {
  const { id: idCrudo, numero: numeroCrudo } = await params;
  const id = idDeGrupo(idCrudo);
  const numero = numeroDeJornada(numeroCrudo);
  if (Number.isNaN(id) || numero === null) return {};
  try {
    const portada = await portadaDe(id);
    return portada ? { title: tituloDeJornada({ numero, edicion: portada.edicion, grupo: portada.grupo }) } : {};
  } catch {
    return {};
  }
}

export default async function PantallaJornada({ params }: {
  params: Promise<{ id: string; numero: string }>;
}) {
  const { id: idCrudo, numero: numeroCrudo } = await params;
  const id = idDeGrupo(idCrudo);
  const numero = numeroDeJornada(numeroCrudo);
  if (Number.isNaN(id) || numero === null) notFound();

  let portada: FilaPortadaGrupo | undefined;
  try {
    portada = await portadaDe(id);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Jornada" motivo={error.message} />;
    }
    throw error;
  }
  if (!portada) notFound();

  let partidos: PartidoDeJornada[] = [];
  try {
    partidos = await consulta<PartidoDeJornada>(PARTIDOS_DE_GRUPO.sql,
      [portada.federacion, portada.grupo_codigo, 1000]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Jornada" motivo={error.message} />;
    }
    throw error;
  }

  const detalle = detalleDeJornada(partidos, numero);
  if (!detalle) notFound();

  return (
    <div className="flex flex-col gap-[18px]">
      <MigaCompeticion grupo={portada} tramos={[
        { texto: 'Jornadas', href: rutaDeJornadas(portada.grupo_id) },
        { texto: `Jornada ${numero}` },
      ]} />
      <CabeceraJornada
        grupo={portada}
        numero={numero}
        rango={rangoDeFechas(detalle.jornada.desde, detalle.jornada.hasta)}
        hrefAnterior={detalle.anterior === null ? null : rutaDeJornada(portada.grupo_id, detalle.anterior)}
        hrefSiguiente={detalle.siguiente === null ? null : rutaDeJornada(portada.grupo_id, detalle.siguiente)}
        hrefClasificacion={`/explorar/competicion/${portada.grupo_id}`}
      />
      <PartidosDeJornada jornada={detalle.jornada} partidos={detalle.partidos} />
    </div>
  );
}
