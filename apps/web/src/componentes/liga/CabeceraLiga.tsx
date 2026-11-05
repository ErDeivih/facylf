import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPortadaGrupo } from '@/consultas/competiciones';
import { Migas } from '@/componentes/fichas/piezas';
import { ETIQUETA } from '@/componentes/estadisticas/controles';
import { etiquetaCategoria, etiquetaDivision } from '@/lib/vocabulario-pantalla';

/**
 * Cabecera de la página de liga: de dónde es la competición, hasta dónde llega lo publicado y cómo
 * seguir a la competición, a sus jornadas o a sus estadísticas.
 *
 * No repite los desplegables de la ficha de competición: esta pantalla es una lectura de la liga, no
 * el selector de temporadas. Los enlaces llevan a las pantallas que ya existen.
 */
export function CabeceraLiga({ grupo }: { grupo: FilaPortadaGrupo }) {
  const base = `/explorar/competicion/${grupo.grupo_id}`;
  const enlaces = [
    { texto: 'Competición', href: base },
    { texto: 'Jornadas', href: `${base}/jornadas` },
    { texto: 'Calendario', href: `${base}/calendario` },
    { texto: 'Estadísticas', href: `${base}/estadisticas` },
  ];
  const categoria = etiquetaCategoria(grupo.categoria);
  const division = grupo.division !== 'desconocida' ? etiquetaDivision(grupo.division) : null;
  const publicados = grupo.partidos_conocidos;
  const conResultado = grupo.partidos_con_resultado;
  const cobertura = publicados === null
    ? 'Cobertura sin medir'
    : conResultado === null
      ? `${publicados} partidos publicados`
      : `${conResultado} de ${publicados} partidos con resultado`;

  return (
    <div className="flex flex-col gap-3">
      <Migas tramos={[
        { texto: grupo.federacion_corta ?? grupo.federacion_nombre },
        { texto: grupo.edicion, href: base },
        { texto: grupo.grupo },
        { texto: 'Liga' },
      ]} />
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
            {grupo.edicion} · {grupo.grupo}
          </h1>
          <p className="m-0 text-tabla text-[var(--texto-suave)]">
            {[categoria, division, grupo.temporada].filter(Boolean).join(' · ')}
            {' · '}
            <span className={ETIQUETA}>{cobertura}</span>
          </p>
        </div>
        <nav aria-label="Ir a" className="flex flex-wrap gap-x-4 gap-y-1">
          {enlaces.map((enlace) => (
            <Link key={enlace.texto} href={enlace.href as Route}
              className="inline-flex min-h-11 items-center text-tabla font-semibold text-[var(--accion)] hover:underline">
              {enlace.texto}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
