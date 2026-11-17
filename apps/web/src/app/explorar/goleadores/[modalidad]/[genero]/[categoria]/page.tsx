import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Goleadores from '../../../page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ modalidad: string; genero: string; categoria: string }> }): Promise<Metadata> {
  const { categoria } = await params;
  return { title: `Goleadores · ${categoria} — Fondo Popular` };
}

export default async function PantallaGoleadoresCategoria({ params }: {
  params: Promise<{ modalidad: string; genero: string; categoria: string }>;
}) {
  const { modalidad, genero, categoria } = await params;
  if (!['futbol', 'sala'].includes(modalidad)
    || !['masculina', 'femenina', 'mixta', 'desconocido'].includes(genero)
    || !['aficionados', 'juvenil', 'cadete', 'infantil', 'alevin', 'benjamin', 'prebenjamin'].includes(categoria)) notFound();
  return Goleadores({ searchParams: Promise.resolve({ modalidad, genero, categoria }) });
}
