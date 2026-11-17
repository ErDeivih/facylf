import type { MetadataRoute } from 'next';

/** Sólo se indexan las páginas públicas; el área de cuenta y el API quedan fuera. */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001';
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/mi-cuenta', '/mi-panel', '/recuperar', '/entrar', '/crear-cuenta', '/admin', '/explorar/calidad', '/explorar/salud', '/explorar/estados', '/explorar/datos'],
    }],
    sitemap: `${base}/sitemap.xml`,
  };
}
