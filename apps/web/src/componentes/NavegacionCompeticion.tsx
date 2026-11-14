import Link from 'next/link';
import type { Route } from 'next';
import { SUBNAV } from '@/componentes/ui/legado';

export function NavegacionCompeticion({ slug }: { slug: string }) {
  const raiz = `/competicion/${slug}`;
  return (
    <nav className={`${SUBNAV} mb-6`} aria-label="Secciones de la competición">
      <Link href={raiz as Route}>Resumen</Link>
      <Link href={`${raiz}#clasificacion` as Route}>Clasificación</Link>
      <Link href={`${raiz}/calendario` as Route}>Calendario</Link>
      <Link href={`${raiz}#jornadas` as Route}>Jornadas</Link>
      <Link href={`${raiz}#estadisticas` as Route}>Gráficas</Link>
      <Link href={`${raiz}/jugadores` as Route}>Jugadores</Link>
    </nav>
  );
}
