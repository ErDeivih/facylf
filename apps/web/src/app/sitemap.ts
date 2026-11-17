import type { MetadataRoute } from 'next';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';

/** Mapa de páginas públicas: rutas fijas + competiciones y equipos con datos. */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001';
  const fijas = ['', '/explorar/competiciones', '/explorar/proximas', '/explorar/estadisticas',
    '/explorar/rankings', '/explorar/goleadores', '/explorar/modelo', '/explorar/legal'];
  const rutas: MetadataRoute.Sitemap = fijas.map((ruta) => ({
    url: `${base}${ruta}`, changeFrequency: 'daily', priority: ruta === '' ? 1 : 0.7,
  }));
  try {
    const grupos = await consulta<{ id: string }>(`
      select pg.id::text id
        from core.phase_group pg
        join core.competition_edition ce on ce.id = pg.competition_edition_id
        join core.federation f on f.id = ce.federation_id
       where f.codigo = 'castilla-leon'
       order by pg.id desc limit 200`);
    const equipos = await consulta<{ id: string }>(`
      select te.id::text id
        from core.team_entry te
        join core.phase_group pg on pg.id = te.phase_group_id
        join core.competition_edition ce on ce.id = pg.competition_edition_id
        join core.federation f on f.id = ce.federation_id
       where f.codigo = 'castilla-leon'
       order by te.id desc limit 500`);
    for (const g of grupos) rutas.push({ url: `${base}/explorar/competicion/${g.id}`, changeFrequency: 'daily', priority: 0.8 });
    for (const e of equipos) rutas.push({ url: `${base}/explorar/equipo/${e.id}`, changeFrequency: 'weekly', priority: 0.6 });
  } catch { /* sin base, el mapa queda con las rutas fijas */ }
  return rutas;
}
