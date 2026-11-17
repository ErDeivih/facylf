import type { Metadata } from 'next';

/** Toda la administración queda fuera de los buscadores. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return children;
}
