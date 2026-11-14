import Link from 'next/link';
import type { Route } from 'next';
import { Escudo } from '@/componentes/Escudo';
import { BotonFavorito } from '@/componentes/favorito/BotonFavorito';
import type { FilaClub, FilaEquipo, FilaPersona } from '@/consultas/entidades';
import { inicialesDeNombre } from '@/lib/fichas';

/**
 * Cabeceras de las tres fichas. Enseñan quién es quién y en qué contexto juega, y nada más: los
 * números van en sus propias secciones. Ninguna pinta una foto de persona (§9): el jugador lleva sus
 * iniciales sobre un círculo, y el equipo y el club, su escudo real cuando lo hay.
 *
 * La estrella de favorito va aquí y no en cada página: las tres pantallas comparten esta cabecera y
 * así el control es el mismo en las tres. Es un componente de cliente que pregunta su estado a la API
 * (no lee la sesión en el servidor), para que las fichas sigan renderizándose igual para todo el
 * mundo hasta que alguien pulsa.
 */

export type ContextoDeJugador = {
  /** Equipo de la temporada más reciente con actas, o `null` si hoy no tiene ninguno. */
  equipoActual: { equipo_id: number; nombre: string; edicion: string; temporada: string } | null;
  /** Federaciones en las que ha jugado, ya sin repetir. */
  federaciones: readonly string[];
  temporadas: number;
};

export function CabeceraJugador({ jugador, contexto }: {
  jugador: FilaPersona;
  contexto: ContextoDeJugador;
}) {
  const { equipoActual } = contexto;
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-5 py-4">
      <span aria-hidden="true"
        className="flex size-16 flex-none items-center justify-center rounded-full bg-[var(--fondo-sutil)] text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto-suave)]">
        {inicialesDeNombre(jugador.nombre_mostrado)}
      </span>
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
          {jugador.nombre_mostrado}
        </h1>
        <p className="m-0 text-tabla text-[var(--texto-suave)]">
          {equipoActual
            ? (
              <>
                Ahora:{' '}
                <Link href={`/explorar/equipo/${equipoActual.equipo_id}` as Route}
                  className="font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
                  {equipoActual.nombre}
                </Link>
                {' · '}{equipoActual.edicion}{' · '}{equipoActual.temporada}
              </>
            )
            : 'Sin equipo en la temporada en curso'}
        </p>
        {contexto.federaciones.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {contexto.federaciones.map((federacion) => (
              <li key={federacion}
                className="rounded-full bg-[var(--accion-suave)] px-2.5 py-0.5 text-etiqueta font-semibold text-[var(--texto)]">
                {federacion}
              </li>
            ))}
          </ul>
        )}
        {contexto.temporadas > 0 && (
          <p className="m-0 text-nota text-[var(--texto-suave)]">
            {contexto.temporadas === 1 ? 'Una temporada con actas' : `${contexto.temporadas} temporadas con actas`}
          </p>
        )}
      </div>
      <div className="ml-auto">
        <BotonFavorito tipo="jugador" entidadId={Number(jugador.persona_id)} etiqueta={jugador.nombre_mostrado} />
      </div>
    </section>
  );
}

export function CabeceraEquipo({ equipo, tieneEscudo }: { equipo: FilaEquipo; tieneEscudo: boolean }) {
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-5 py-4">
      <Escudo equipoId={Number(equipo.equipo_id)} nombre={equipo.nombre_en_fuente}
        clubId={Number(equipo.club_id)} tieneEscudo={tieneEscudo} />
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
          {equipo.nombre_en_fuente}
        </h1>
        <p className="m-0 text-tabla text-[var(--texto-suave)]">
          <Link href={`/explorar/club/${equipo.club_id}` as Route}
            className="font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
            {equipo.club}
          </Link>
          {' · '}
          <Link href={`/explorar/competicion/${equipo.grupo_id}` as Route}
            className="font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
            {equipo.edicion} · {equipo.grupo}
          </Link>
        </p>
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          {equipo.temporada} · {equipo.federacion_nombre}
        </p>
      </div>
      <div className="ml-auto">
        <BotonFavorito tipo="equipo" entidadId={Number(equipo.equipo_id)} etiqueta={equipo.nombre_en_fuente} />
      </div>
    </section>
  );
}

export function CabeceraClub({ club, tieneEscudo }: { club: FilaClub; tieneEscudo: boolean }) {
  const lugar = club.municipio && club.provincia
    ? `${club.municipio} (${club.provincia})`
    : (club.municipio ?? club.provincia ?? null);
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-5 py-4">
      <Escudo equipoId={Number(club.club_id)} nombre={club.nombre_canonico}
        clubId={Number(club.club_id)} tieneEscudo={tieneEscudo} />
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
          {club.nombre_canonico}
        </h1>
        <p className="m-0 text-tabla text-[var(--texto-suave)]">
          {[lugar, club.federacion_nombre].filter(Boolean).join(' · ')}
        </p>
        {club.aliases && (
          <p className="m-0 text-nota text-[var(--texto-suave)]">
            También publicado como: {club.aliases}
          </p>
        )}
      </div>
      <div className="ml-auto">
        <BotonFavorito tipo="club" entidadId={Number(club.club_id)} etiqueta={club.nombre_canonico} />
      </div>
    </section>
  );
}
