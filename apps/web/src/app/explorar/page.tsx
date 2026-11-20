import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';

export const metadata: Metadata = {
  title: 'Explorar — Fondo Popular',
  description: 'Acceso ordenado a competiciones, jornadas, equipos, jugadores, estadísticas y pronósticos de Castilla y León.',
  alternates: { canonical: '/explorar' },
  robots: { index: true, follow: true },
};

const BLOQUES = [
  {
    titulo: 'Competiciones',
    descripcion: 'Ligas, grupos, calendario y clasificación.',
    enlaces: [
      ['Todas las competiciones', '/explorar/competiciones'],
      ['Próximos partidos', '/explorar/proximas'],
      ['Calendario', '/explorar/calendario'],
      ['Jornadas y calendario', '/explorar/calendario'],
    ],
  },
  {
    titulo: 'Equipos y jugadores',
    descripcion: 'Fichas, plantillas, trayectorias y comparativas.',
    enlaces: [
      ['Equipos', '/explorar/competiciones'],
      ['Jugadores', '/explorar/ojeo'],
      ['Comparar jugadores', '/explorar/comparar'],
      ['Ojeo por perfil', '/explorar/ojeo'],
    ],
  },
  {
    titulo: 'Estadísticas',
    descripcion: 'Goles, tarjetas, rankings y datos por tramo.',
    enlaces: [
      ['Goleadores', '/explorar/goleadores'],
      ['Rankings', '/explorar/rankings'],
      ['Estadísticas', '/explorar/estadisticas'],
      ['Técnicos', '/explorar/estadisticas'],
    ],
  },
  {
    titulo: 'Datos y modelo',
    descripcion: 'De dónde sale cada número y cómo se calcula.',
    enlaces: [
      ['Modelo de predicción', '/explorar/modelo'],
      ['Cobertura y calidad', '/explorar/datos'],
      ['Salud del canónico', '/explorar/salud'],
      ['Publicidad', '/explorar/publicidad'],
    ],
  },
] as const;

export default function PantallaExplorar() {
  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-5 py-4">
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Explorar</h1>
        <p className="m-0 mt-1 max-w-[70ch] text-cuerpo text-[var(--texto-suave)]">
          Todo lo que hay en Fondo Popular, ordenado por para qué lo buscas: la competición, el equipo,
          el jugador o el dato.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {BLOQUES.map((bloque) => (
          <section key={bloque.titulo} className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-4">
            <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">{bloque.titulo}</h2>
            <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">{bloque.descripcion}</p>
            <ul className="m-0 mt-2 flex list-none flex-col gap-0.5 p-0">
              {bloque.enlaces.map(([texto, href]) => (
                <li key={`${texto}-${href}`}>
                  <Link href={href as Route} className="inline-flex min-h-11 items-center text-tabla font-semibold text-[var(--accion)] hover:underline">
                    {texto}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-4">
        <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">Por provincia y categoría</h2>
        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">El mismo catálogo, filtrado por lo que te interesa.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[['avila','Ávila'],['burgos','Burgos'],['leon','León'],['palencia','Palencia'],['salamanca','Salamanca'],['segovia','Segovia'],['soria','Soria'],['valladolid','Valladolid'],['zamora','Zamora']].map(([slug, texto]) => (
            <Link key={slug} href={`/explorar/competiciones/provincia/${slug}` as Route}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde)] px-3 text-tabla font-semibold text-[var(--texto)] hover:border-[var(--accion)] hover:text-[var(--accion)]">
              {texto}
            </Link>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[['aficionados','Aficionados'],['juvenil','Juvenil'],['cadete','Cadete'],['infantil','Infantil'],['alevin','Alevín'],['benjamin','Benjamín'],['prebenjamin','Prebenjamín'],['veteranos','Veteranos']].map(([slug, texto]) => (
            <Link key={slug} href={`/explorar/competiciones/categoria/${slug}` as Route}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde)] px-3 text-tabla font-semibold text-[var(--texto)] hover:border-[var(--accion)] hover:text-[var(--accion)]">
              {texto}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
