import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  EDICIONES_DE_LA_COMPETICION, GRUPO_POR_ID, GRUPOS_DE_LA_EDICION, SIMULACION_DEL_GRUPO,
  type FilaEdicionDeLaCompeticion, type FilaGrupoDeLaEdicion, type FilaPortadaGrupo, type FilaSimulacionFinal,
} from '@/consultas/competiciones';
import { ZONAS_DEL_GRUPO, ZONAS_HISTORICAS, type FilaZonas, type FilaZonasHistoricas } from '@/consultas/paneles';
import { PARTIDOS_DE_GRUPO, type FilaPartidoCanonico } from '@/consultas/partidos';
import { SinCanonico } from '@/componentes/SinCanonico';
import { CabeceraCompeticion } from '@/componentes/competicion/CabeceraCompeticion';
import { MigaCompeticion } from '@/componentes/competicion/MigaCompeticion';
import { ProyeccionFinal } from '@/componentes/competicion/ProyeccionFinal';
import { EloDelGrupo } from '@/componentes/competicion/EloDelGrupo';
import { idDeGrupoDeUrl } from '@/lib/calendario';
import { fechaUltimaJugadaDePortada } from '@/lib/jornadas';
import { temporadasPublicables, type ZonasDelGrupo } from '@/lib/pantalla-competicion';

export const revalidate = 60;

const portadaDe = cache(async (id: number): Promise<FilaPortadaGrupo | undefined> => {
  const [fila] = await consulta<FilaPortadaGrupo>(GRUPO_POR_ID.sql, [id]);
  return fila;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeGrupoDeUrl(crudo);
  if (id === null) return {};
  try {
    const p = await portadaDe(id);
    return p ? { title: `Clasificación final · ${p.edicion} · ${p.grupo} — Fondo Popular` } : {};
  } catch { return {}; }
}

/**
 * Proyección de la clasificación final: una pestaña más de la competición, con su misma cabecera y su
 * misma miga. Se llega desde la clasificación y se vuelve a ella con la barra de pestañas.
 */
export default async function PantallaProyeccion({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeGrupoDeUrl(crudo);
  if (id === null) notFound();

  let portada: FilaPortadaGrupo | undefined;
  let hermanos: FilaGrupoDeLaEdicion[] = [];
  let temporadas: FilaEdicionDeLaCompeticion[] = [];
  let filas: FilaSimulacionFinal[] = [];
  let zonas: ZonasDelGrupo | null = null;
  let partidos: FilaPartidoCanonico[] = [];
  try {
    portada = await portadaDe(id);
    if (portada) {
      const [h, t, s, z, p, zh] = await consultaEnUnaFoto([
        { sql: GRUPOS_DE_LA_EDICION.sql, parametros: [portada.edicion_id] },
        { sql: EDICIONES_DE_LA_COMPETICION.sql, parametros: [portada.grupo_id] },
        { sql: SIMULACION_DEL_GRUPO.sql, parametros: [id] },
        { sql: ZONAS_DEL_GRUPO.sql, parametros: [id] },
        { sql: PARTIDOS_DE_GRUPO.sql, parametros: [portada.federacion, portada.grupo_codigo, 400] },
        { sql: ZONAS_HISTORICAS.sql, parametros: [portada.categoria, portada.division, portada.genero, id] },
      ]);
      hermanos = h as unknown as FilaGrupoDeLaEdicion[];
      temporadas = temporadasPublicables(t as unknown as FilaEdicionDeLaCompeticion[], undefined, portada.edicion_id);
      filas = s as unknown as FilaSimulacionFinal[];
      partidos = p as unknown as FilaPartidoCanonico[];
      const zona = (z as unknown as FilaZonas[])[0];
      const historica = (zh as unknown as FilaZonasHistoricas[])[0];
      zonas = zona && zona.origen !== 'ninguna'
        ? {
          ascensos: zona.ascensos, promocion: zona.promocion, descensos: zona.descensos,
          promocion_permanencia: zona.promocion_permanencia, origen: zona.origen,
          confianza: zona.confianza, temporadas: zona.temporadas,
        }
        : historica
          ? {
            ascensos: historica.ascensos, promocion: historica.promocion, descensos: historica.descensos,
            promocion_permanencia: 0, origen: 'historica', confianza: null, temporadas: historica.temporadas,
          }
          : null;
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Clasificación final" motivo={error.message} />;
    throw error;
  }
  if (!portada) notFound();

  return (
    <div className="flex flex-col gap-4">
      <MigaCompeticion grupo={portada} tramos={[{ texto: 'Clasificación final' }]} />
      <CabeceraCompeticion
        grupo={portada}
        grupos={hermanos}
        temporadas={temporadas}
        rutaBase={`/explorar/competicion/${portada.grupo_id}`}
        fechaInicio={portada.fecha_inicio}
        fechaFin={portada.fecha_fin}
        fechaUltimaJugada={fechaUltimaJugadaDePortada(portada)}
        activa="proyeccion"
      />
      <ProyeccionFinal grupo={portada} filas={filas} zonas={zonas} />
      <EloDelGrupo partidos={partidos} />
    </div>
  );
}
