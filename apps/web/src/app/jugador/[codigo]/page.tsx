import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { SinCanonico } from '@/componentes/SinCanonico';
import { JugadorDesdeCola } from '@/componentes/JugadorDesdeCola';
import { IdentidadPersona, Miga, TablaDatos, Vacio } from '@/componentes/base';
import type { ColumnaTabla } from '@/componentes/base';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { PERSONA_POR_ID, TRAYECTORIA_DE_PERSONA } from '@/consultas/entidades';
import type { FilaPersona, FilaTemporadaDePersona } from '@/consultas/entidades';
import { etiqueta, numero } from '@/lib/presentacion-canonico';

export const dynamic = 'force-dynamic';

/**
 * Ficha de jugador. Puente de dos caminos, igual que la de equipo:
 *
 * - **Identificador numérico** → canónico (`core.person.id`).
 * - **Cualquier otra cosa** → el código federativo, como siempre (`JugadorDesdeCola`).
 *
 * El puente existe por lo mismo que en `/equipo`: los enlaces de las páginas sin migrar llevan el
 * código federativo, y hoy el camino antiguo **enseña más** porque calcula las cifras desde las actas
 * y el canónico no puede (`analytics` está vacía y nadie la escribe).
 *
 * Lo que esta pantalla **no** hace, y es deliberado: no presenta como hecho el enlace de una persona
 * entre temporadas cuando la identidad es nominal. Un nombre igual no une a dos personas, y aquí se
 * dice en pantalla en vez de dejarlo escrito sólo en la documentación.
 */
async function JugadorCanonico({ idPersona }: { idPersona: number }) {
  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico titulo="Jugador" motivo={motivo} />;

  let persona: FilaPersona | null = null;
  let carrera: FilaTemporadaDePersona[] = [];
  try {
    persona = (await consulta<FilaPersona>(PERSONA_POR_ID.sql, [idPersona]))[0] ?? null;
    if (persona) carrera = await consulta<FilaTemporadaDePersona>(TRAYECTORIA_DE_PERSONA.sql, [idPersona, 80]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Jugador" motivo={error.message} />;
    throw error;
  }
  if (!persona) notFound();

  // Las cifras derivadas sólo existen si el agregado por jugador se ha calculado. Hoy no: `analytics`
  // está vacía. Se decide por los datos, así que el día que se rellene la tabla se enseña sola.
  const hayResumen = carrera.some((c) => c.convocatorias !== null || c.goles !== null);

  const columnas: ColumnaTabla<FilaTemporadaDePersona>[] = [
    { clave: 'temporada', titulo: 'Temporada' },
    { clave: 'nombre_en_fuente', titulo: 'Equipo' },
    { clave: 'edicion', titulo: 'Competición' },
    { clave: 'grupo', titulo: 'Grupo' },
    { clave: 'edicion_categoria', titulo: 'Categoría', render: (c) => etiqueta('categoria', c.edicion_categoria) },
    { clave: 'partidos_con_aparicion', titulo: 'Partidos con aparición en acta', tipo: 'numero', abreviatura: 'Apar.' },
    ...(hayResumen ? [
      { clave: 'convocatorias' as const, titulo: 'Convocatorias', tipo: 'numero' as const, abreviatura: 'Conv.', render: (c: FilaTemporadaDePersona) => numero(c.convocatorias) },
      { clave: 'partidos_demostrados' as const, titulo: 'Partidos demostrados', tipo: 'numero' as const, abreviatura: 'PJ', render: (c: FilaTemporadaDePersona) => numero(c.partidos_demostrados) },
      { clave: 'goles' as const, titulo: 'Goles', tipo: 'numero' as const, abreviatura: 'G', render: (c: FilaTemporadaDePersona) => numero(c.goles) },
      { clave: 'amarillas' as const, titulo: 'Tarjetas amarillas', tipo: 'numero' as const, abreviatura: 'TA', render: (c: FilaTemporadaDePersona) => numero(c.amarillas) },
      { clave: 'rojas' as const, titulo: 'Tarjetas rojas', tipo: 'numero' as const, abreviatura: 'TR', render: (c: FilaTemporadaDePersona) => numero(c.rojas) },
    ] : []),
  ];

  const federacion = carrera[0]?.federacion_nombre ?? null;
  const temporadas = new Set(carrera.map((c) => c.temporada)).size;

  return <>
    <Miga tramos={[{ texto: 'Federaciones', href: '/federaciones' }, { texto: 'Jugador' }]} />

    <p className="text-etiqueta text-[var(--texto-suave)]">
      {federacion ?? 'Federación sin determinar'}
    </p>
    <h2 className="mt-1 font-display text-3xl uppercase">{persona.nombre_mostrado}</h2>

    <p className="mt-2 flex flex-wrap gap-2 text-xs">
      {persona.codigos
        ? <span className="border border-[var(--borde)] bg-[var(--fondo-sutil)] px-1.5 py-0.5">Código federativo {persona.codigos}</span>
        : <span className="border border-[var(--borde)] bg-[var(--fondo-sutil)] px-1.5 py-0.5 text-[var(--texto-suave)]">Sin código federativo</span>}
      <span className="border border-[var(--borde)] bg-[var(--fondo-sutil)] px-1.5 py-0.5 text-[var(--texto-suave)]">
        {carrera.length} {carrera.length === 1 ? 'equipo' : 'equipos'} en {temporadas} {temporadas === 1 ? 'temporada' : 'temporadas'}
      </span>
    </p>

    {persona.identidad_nominal && <IdentidadPersona decisiones={persona.decisiones_identidad} />}

    {persona.es_menor && (
      <p className="mt-2 text-etiqueta leading-5 text-[var(--texto-tenue)]">
        Persona menor de edad en el canónico. Esta instancia es privada y estos datos no salen de ella.
      </p>
    )}

    <h3 className="mt-6 font-display text-lg uppercase">Trayectoria</h3>
    {!hayResumen && carrera.length > 0 && (
      <div className="mt-2 border-l-4 border-[var(--cobertura-parcial)] bg-[var(--fondo-sutil)] p-3 text-tabla leading-6 text-[var(--texto-suave)]">
        <b className="text-[var(--texto)]">Sólo se pueden enseñar las apariciones.</b> Salen de las actas
        importadas y son lo único demostrable hoy. Las cifras derivadas —convocatorias, titularidades,
        minutos, goles y tarjetas— viven en <code>analytics.player_team_season_summary</code>, que está
        sin calcular y que ningún proceso del repositorio escribe todavía. Por eso esas columnas no se
        pintan, en vez de salir a «—» o a cero.
      </div>
    )}
    <div className="mt-3">
      <TablaDatos
        filas={carrera}
        columnas={columnas}
        caption={`Temporadas y equipos de ${persona.nombre_mostrado} según las actas importadas.`}
        clave={(c) => c.equipo_id}
        enlaceFila={(c) => `/equipo/${c.equipo_id}`}
        columnaPrincipal={1}
        vacio={<Vacio
          titulo="Sin apariciones registradas"
          motivo="El canónico conoce a esta persona, pero no hay ninguna acta importada en la que aparezca. No es un cero: es que no está."
        />}
      />
    </div>
    <p className="mt-2 text-etiqueta leading-5 text-[var(--texto-tenue)]">
      Una fila por equipo y temporada: si alguien juega con dos equipos el mismo año, salen dos filas y
      <b> no se suman</b>. Una convocatoria sin condición publicada no cuenta como partido jugado.
    </p>
  </>;
}

export default async function Jugador({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  return /^\d+$/.test(codigo)
    ? <JugadorCanonico idPersona={Number(codigo)} />
    : <JugadorDesdeCola codigo={codigo} />;
}
