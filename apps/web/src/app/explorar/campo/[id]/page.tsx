import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  CAMPO_POR_ID, HORARIOS_DEL_CAMPO, LOCALES_DEL_CAMPO, PARTIDOS_DEL_CAMPO,
  type FilaCampo, type FilaHorarioDeCampo, type FilaLocalDeCampo, type FilaPartidoDeCampo,
} from '@/consultas/campos';
import { HorariosDelCampo, LocalesDelCampo, PartidosDelCampo, ResumenDelCampo } from '@/componentes/fichas/Campo';
import { AvisoSinArchivo, Migas } from '@/componentes/fichas/piezas';
import { idDeFicha } from '@/lib/fichas';

export const revalidate = 300;

const campoDe = cache(async (id: number): Promise<FilaCampo | undefined> => {
  const [fila] = await consulta<FilaCampo>(CAMPO_POR_ID.sql, [id]);
  return fila;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) return {};
  try {
    const campo = await campoDe(id);
    return campo ? { title: `${campo.nombre} · Campo — Fondo Popular` } : {};
  } catch { return {}; }
}

/**
 * Ficha de campo: `/explorar/campo/[id]` (`core.venue.id`).
 *
 * Qué se ha jugado aquí, cómo le va al equipo de casa, a qué horas se juega y quién juega como local.
 * Cuatro consultas, ninguna por partido. Un id que no es un campo de una federación publicada es un 404.
 */
export default async function PaginaCampo({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) notFound();

  let campo: FilaCampo | undefined;
  let horarios: FilaHorarioDeCampo[] = [];
  let locales: FilaLocalDeCampo[] = [];
  let partidos: FilaPartidoDeCampo[] = [];
  try {
    campo = await campoDe(id);
    if (campo) {
      const [h, l, p] = await consultaEnUnaFoto([
        { sql: HORARIOS_DEL_CAMPO.sql, parametros: [id] },
        { sql: LOCALES_DEL_CAMPO.sql, parametros: [id] },
        { sql: PARTIDOS_DEL_CAMPO.sql, parametros: [id, 20] },
      ]);
      horarios = h as unknown as FilaHorarioDeCampo[];
      locales = l as unknown as FilaLocalDeCampo[];
      partidos = p as unknown as FilaPartidoDeCampo[];
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <AvisoSinArchivo titulo="Campo" />;
    throw error;
  }
  if (!campo) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Migas tramos={[
        { texto: 'Explorar', href: '/explorar' },
        { texto: campo.nombre },
      ]} />
      <ResumenDelCampo campo={campo} />
      <div className="grid gap-4 lg:grid-cols-2">
        <HorariosDelCampo horarios={horarios} />
        <LocalesDelCampo locales={locales} />
      </div>
      <PartidosDelCampo partidos={partidos} />
    </div>
  );
}
