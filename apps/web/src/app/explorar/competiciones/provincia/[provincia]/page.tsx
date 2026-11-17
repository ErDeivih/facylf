import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Selector from '@/app/explorar/competiciones/page';
import { provinciaCanonicaDe } from '@/lib/provincias-cyl';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Competiciones por provincia — Fondo Popular' };

export default async function PantallaProvincia({ params }: { params: Promise<{ provincia: string }> }) {
  const { provincia } = await params;
  const canonica = provinciaCanonicaDe(decodeURIComponent(provincia));
  if (canonica === null) notFound();
  return Selector({ searchParams: Promise.resolve({ prov: canonica }) });
}
