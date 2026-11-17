import type { Metadata } from 'next';
import Competicion from '../page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Competición · Fuera — Fondo Popular' };

export default async function PantallaFuera({ params }: { params: Promise<{ id: string }> }) {
  return Competicion({
    params,
    searchParams: Promise.resolve({ vista: 'fuera' }),
  });
}
