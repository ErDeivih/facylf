import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Selector from '@/app/explorar/competiciones/page';
import { etiquetaCategoria } from '@/lib/vocabulario-pantalla';

const CATEGORIAS = new Set([
  'aficionados', 'juvenil', 'cadete', 'infantil', 'alevin', 'benjamin', 'prebenjamin', 'veteranos',
]);

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ categoria: string }> }): Promise<Metadata> {
  const { categoria } = await params;
  return { title: `${etiquetaCategoria(categoria)} — Competiciones — Fondo Popular` };
}

export default async function PantallaCategoria({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  if (!CATEGORIAS.has(categoria)) notFound();
  return Selector({ searchParams: Promise.resolve({ cat: categoria }) });
}
