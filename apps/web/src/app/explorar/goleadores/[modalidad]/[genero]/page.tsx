import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Goleadores from '../../page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ modalidad: string; genero: string }> }): Promise<Metadata> {
  const { modalidad, genero } = await params;
  return { title: `Goleadores · ${modalidad} · ${genero} — Fondo Popular` };
}

export default async function PantallaGoleadoresFiltro({ params, searchParams }: { params: Promise<{ modalidad: string; genero: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { modalidad, genero } = await params;
  const query = await searchParams;
  if (!['futbol', 'sala'].includes(modalidad) || !['masculina', 'femenina', 'mixta', 'desconocido'].includes(genero)) notFound();
  return Goleadores({ searchParams: Promise.resolve({ ...query, modalidad, genero }) });
}
