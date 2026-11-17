import type { Metadata } from 'next';
import Competicion from '../page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Competición · Casa — Fondo Popular' };

export default async function PantallaCasa({ params }: { params: Promise<{ id: string }> }) {
  return Competicion({
    params,
    searchParams: Promise.resolve({ vista: 'local' }),
  });
}
