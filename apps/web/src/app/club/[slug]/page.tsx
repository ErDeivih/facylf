import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { SinCanonico } from '@/componentes/SinCanonico';
import { Escudo, InsigniaCobertura, Miga, Procedencia, TablaDatos, Vacio } from '@/componentes/base';
import type { ColumnaTabla, EstadoCobertura } from '@/componentes/base';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { CLUB_POR_ID, EQUIPOS_DEL_CLUB } from '@/consultas/entidades';
import type { FilaClub, FilaEquipoDeClub } from '@/consultas/entidades';
import { etiqueta, fechaCorta, numero, texto } from '@/lib/presentacion-canonico';

export const dynamic = 'force-dynamic';

/**
 * Ficha de club, leída del canónico.
 *
 * Sustituye a la versión anterior, que leía el repositorio local antiguo y agrupaba por nombre
 * federativo dentro de una temporada. Aquí el club es `core.club` —una entidad con identificador
 * propio— y sus equipos son las **inscripciones** (`core.team_entry`) que cuelgan de él.
 *
 * Dos decisiones que se ven en la pantalla y que no son de estilo:
 *
 * 1. **El selector es de temporada, y cada fila es un equipo concreto, no un «equipo del club».**
 *    Medido el 23/09/2026: `core.team_season` tiene la clave única `(club_id, season_id, nombre)`, así
 *    que cuando la fuente publica el mismo nombre para dos equipos del mismo club en la misma
 *    temporada, **los dos colapsan en una sola fila**. Le pasa al club 16: su juvenil (inscripción
 *    2489, «1ª División Provincial de Juveniles») y su sénior (inscripción 2517, «1ª División
 *    Regional de Aficionados») comparten el `team_season` 2489. Por eso cada fila es una inscripción
 *    y lleva su competición y su grupo: sin ellos, dos equipos distintos parecerían el mismo.
 *
 * 2. **Los goles que se enseñan son los reconstruidos desde los marcadores, y se dice.** La
 *    clasificación oficial del canónico guarda `goles_favor` y `goles_contra` a **cero en las 338
 *    filas de 338** con partidos jugados; el juvenil de Ciudad Rodrigo ganó 14 partidos de 26 y su
 *    fila oficial dice 0 goles. Enseñar ese 0 como si fuera un dato sería el falso cero que este
 *    proyecto existe para no publicar, así que la columna se rotula como reconstruida y viene de la
 *    fila `reconstruida` del punto de control. **El arreglo de fondo es del importador.**
 *
 * La URL lleva el identificador canónico del club. El nombre legible no forma parte de la ruta: un
 * cambio de nombre en la fuente no debe romper un enlace.
 */

/** Traduce el estado de visibilidad de la cobertura a la insignia. */
function coberturaDe(fila: FilaEquipoDeClub): { estado: EstadoCobertura; hasta: number | null } {
  switch (fila.visibility_state) {
    case 'completa': return { estado: 'completa', hasta: null };
    case 'verificada_hasta_jornada': return { estado: 'hasta_jornada', hasta: fila.complete_through_matchday };
    case 'parcial_privada': return { estado: 'parcial', hasta: fila.complete_through_matchday };
    case 'oculta': return { estado: 'no_publicada', hasta: null };
    default: return { estado: 'sin_medir', hasta: null };
  }
}

export default async function Club({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ temp?: string }>;
}) {
  const { slug } = await params;
  const { temp } = await searchParams;

  // La ficha se resuelve por identificador canónico. Un valor que no sea un id se rechaza en vez de
  // intentar adivinar a qué club se refería: aqu\u00ed no hay slugs que resolver a ciegas.
  const idClub = Number(slug);
  if (!Number.isInteger(idClub) || idClub <= 0) notFound();

  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico titulo="Club" motivo={motivo} />;

  let club: FilaClub | null = null;
  let equipos: FilaEquipoDeClub[] = [];
  try {
    club = (await consulta<FilaClub>(CLUB_POR_ID.sql, [idClub]))[0] ?? null;
    if (club) {
      // Sin filtro de temporada: el selector necesita saber qué temporadas existen de verdad, y eso
      // sólo lo dice el canónico. Nunca se ofrece una lista de temporadas escrita a mano.
      equipos = await consulta<FilaEquipoDeClub>(EQUIPOS_DEL_CLUB.sql, [idClub, null, 200]);
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Club" motivo={error.message} />;
    throw error;
  }
  if (!club) notFound();

  // Temporadas con datos, de la más reciente a la más antigua, tal como vienen ordenadas.
  const temporadas = [...new Map(equipos.map((e) => [e.temporada, e.temporada_orden])).entries()];
  const elegida = temp && temporadas.some(([t]) => t === temp) ? temp : temporadas[0]?.[0];
  const deLaTemporada = equipos.filter((e) => e.temporada === elegida);

  // El caso que hay que explicar en voz alta: dos inscripciones con el mismo nombre publicado en la
  // misma temporada. No es un duplicado y no se fusiona; se dice por qué salen dos.
  const nombresRepetidos = new Set(
    deLaTemporada.map((e) => e.nombre_en_fuente)
      .filter((n, i, todos) => todos.indexOf(n) !== i),
  );
  // Y el otro desajuste medido: la categoría de la edición manda; la del `team_season` puede discrepar.
  const categoriaDiscrepa = deLaTemporada.some((e) => e.edicion_categoria !== e.categoria_team_season);

  const columnas: ColumnaTabla<FilaEquipoDeClub>[] = [
    { clave: 'edicion', titulo: 'Competición' },
    { clave: 'grupo', titulo: 'Grupo' },
    { clave: 'edicion_categoria', titulo: 'Categoría', render: (f) => etiqueta('categoria', f.edicion_categoria) },
    { clave: 'posicion', titulo: 'Posición', tipo: 'numero', abreviatura: 'Pos.' },
    { clave: 'puntos', titulo: 'Puntos', tipo: 'numero', abreviatura: 'Pts' },
    { clave: 'jugados', titulo: 'Jugados', tipo: 'numero', abreviatura: 'PJ' },
    { clave: 'ganados', titulo: 'Ganados', tipo: 'numero', abreviatura: 'G' },
    { clave: 'empatados', titulo: 'Empatados', tipo: 'numero', abreviatura: 'E' },
    { clave: 'perdidos', titulo: 'Perdidos', tipo: 'numero', abreviatura: 'P' },
    {
      clave: 'goles_favor_reconstruidos', titulo: 'Goles a favor (reconstruidos de los marcadores)',
      tipo: 'numero', abreviatura: 'GF*', render: (f) => numero(f.goles_favor_reconstruidos),
    },
    {
      clave: 'goles_contra_reconstruidos', titulo: 'Goles en contra (reconstruidos de los marcadores)',
      tipo: 'numero', abreviatura: 'GC*', render: (f) => numero(f.goles_contra_reconstruidos),
    },
    {
      clave: null, titulo: 'Cobertura del grupo',
      render: (f) => {
        const { estado, hasta } = coberturaDe(f);
        return <InsigniaCobertura estado={estado} hastaJornada={hasta} />;
      },
    },
  ];

  return <>
    <Miga tramos={[
      { texto: 'Federaciones', href: '/federaciones' },
      { texto: club.federacion_nombre },
      { texto: 'Club' },
    ]} />

    <p className="text-[0.6875rem] uppercase tracking-[0.16em] text-[var(--texto-suave)]">
      Club · {club.federacion_nombre}
    </p>
    <h2 className="mt-1 flex items-center gap-3 font-display text-3xl uppercase">
      <Escudo nombre={club.nombre_canonico} semilla={club.club_id} />
      {club.nombre_canonico}
    </h2>

    <p className="mt-2 max-w-3xl text-[0.8125rem] leading-6 text-[var(--texto-suave)]">
      Un club es una entidad histórica; sus equipos son inscripciones de una temporada en una
      competición y un grupo concretos. <b className="text-[var(--texto)]">No existe una «plantilla de
      club»</b>: un juvenil y un aficionado del mismo club son contextos deportivos distintos y sus
      cifras nunca se suman.
    </p>

    <p className="mt-2 text-[0.75rem] text-[var(--texto-tenue)]">
      {club.municipio ? `${club.municipio} · ` : ''}{texto(club.provincia)} ·{' '}
      {equipos.length} {equipos.length === 1 ? 'inscripción' : 'inscripciones'} en{' '}
      {temporadas.length} {temporadas.length === 1 ? 'temporada' : 'temporadas'}
    </p>

    {club.aliases && (
      <p className="mt-1 text-[0.6875rem] leading-5 text-[var(--texto-tenue)]">
        Nombres publicados por las fuentes: {club.aliases}
      </p>
    )}

    <h3 className="mt-6 font-display text-lg uppercase">Temporada</h3>
    {temporadas.length === 0 ? (
      <div className="mt-2">
        <Vacio
          titulo="Sin equipos importados"
          motivo={`El canónico conoce el club, pero no tiene ninguna inscripción suya importada. No es un cero: es que no está importado todavía.`}
        />
      </div>
    ) : (
      <>
        <nav aria-label="Temporadas con datos" className="mt-2 flex flex-wrap gap-2">
          {temporadas.map(([t]) => (
            <Link
              key={t}
              href={`/club/${idClub}?temp=${t}` as Route}
              aria-current={t === elegida ? 'true' : undefined}
              className={t === elegida ? 'boton-primario' : 'boton-secundario'}
            >
              {t}
            </Link>
          ))}
        </nav>

        {deLaTemporada.length === 0 ? (
          <div className="mt-4">
            <Vacio
              titulo="Sin inscripciones en esa temporada"
              motivo="El club tiene datos en otras temporadas, pero no en la elegida."
              accion={{ texto: `Ver ${temporadas[0]?.[0] ?? 'la más reciente'}`, href: `/club/${idClub}?temp=${temporadas[0]?.[0] ?? ''}` }}
            />
          </div>
        ) : (
          <>
            <div className="mt-3">
              <TablaDatos
                filas={deLaTemporada}
                columnas={columnas}
                caption={`Equipos del club ${club.nombre_canonico} en la temporada ${elegida}, con su competición, grupo, clasificación final y cobertura del grupo.`}
                clave={(f) => f.equipo_id}
                enlaceFila={(f) => `/equipo/${f.equipo_id}`}
                columnaPrincipal={0}
              />
            </div>

            <p className="mt-2 text-[0.6875rem] leading-5 text-[var(--texto-tenue)]">
              La fila entera lleva a la ficha del equipo. <b>*</b> Los goles se reconstruyen desde los
              marcadores de sus partidos: la clasificación oficial guardada no los publica y los trae a
              cero, así que no se muestran como si fueran suyos.
            </p>

            {nombresRepetidos.size > 0 && (
              <div className="mt-3 border-l-4 border-[var(--revision)] bg-[var(--fondo-sutil)] p-3 text-[0.8125rem] leading-6 text-[var(--texto-suave)]">
                <b className="text-[var(--texto)]">Dos equipos con el mismo nombre publicado.</b>{' '}
                Esta temporada el club tiene más de una inscripción con el mismo nombre en la fuente
                ({[...nombresRepetidos].join(', ')}). <b>Son equipos distintos</b> —competición y grupo
                distintos, plantillas distintas— y por eso aparecen en filas separadas. No se fusionan.
              </div>
            )}

            {categoriaDiscrepa && (
              <div className="mt-3 border-l-4 border-[var(--cobertura-parcial)] bg-[var(--fondo-sutil)] p-3 text-[0.8125rem] leading-6 text-[var(--texto-suave)]">
                <b className="text-[var(--texto)]">La categoría de la edición y la del equipo no coinciden.</b>{' '}
                La columna «Categoría» es la de la <b>competición</b>, que es la fiable. El equipo de
                temporada guarda otra distinta en algunos casos medidos y se conserva tal cual en vez de
                corregirla en pantalla.
              </div>
            )}

            <div className="mt-3">
              <Procedencia
                fuente={`${club.federacion_nombre} (canónico)`}
                medidoEn={fechaCorta(deLaTemporada[0]?.calculado_en ?? null)}
              />
            </div>
          </>
        )}
      </>
    )}
  </>;
}
