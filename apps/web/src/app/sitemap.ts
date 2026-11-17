import type { MetadataRoute } from 'next';

/** Mapa de las páginas públicas estables. Las fichas concretas se enlazan desde ellas. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001';
  const rutas = [
    '', '/explorar/competiciones', '/explorar/proximas', '/explorar/estadisticas',
    '/explorar/rankings', '/explorar/goleadores', '/explorar/modelo', '/explorar/legal',
  ];
  return rutas.map((ruta) => ({ url: `${base}${ruta}`, changeFrequency: 'daily', priority: ruta === '' ? 1 : 0.7 }));
}
