import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { SinCanonico } from '@/componentes/SinCanonico';
import { EquipoDesdeCola } from '@/componentes/EquipoDesdeCola';
import { InsigniaCobertura, Marcador, Miga, Procedencia, TablaDatos, Vacio } from '@/componentes/base';
import type { ColumnaTabla, EstadoCobertura } from '@/componentes/base';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { EQUIPO_POR_ID, PARTIDOS_DEL_EQUIPO, PLANTILLA_DEL_EQUIPO } from '@/consultas/entidades';
import type { FilaEquipo, FilaJugadorDePlantilla, FilaPartidoDeEquipo } from '@/consultas/entidades';
import { insigniaForma } from '@/lib/forma-equipo';
import { etiqueta, fechaCorta, numero } from '@/lib/presentacion-canonico';

export const dynamic = 'force-dynamic';

/**
 * Ficha de equipo. **Es un puente temporal con dos caminos y hay que saber por qué.**
 *
 * - **Identificador numérico** → se lee del canónico (esta es la versión nueva).
 * - **Cualquier otra cosa** → se lee de las colas SQLite, como siempre (`EquipoDesdeCola`).
 *
 * El motivo de que convivan: los enlaces que ya existen en las páginas sin migrar
 * (`/equipos`, `/competicion/…`, `/jugador/…`) llevan el slug antiguo, que codifica federación,
 * temporada, competición, grupo y código de equipo. Si esta ruta dejara de resolverlo, se romperían de
 * golpe. Y hoy el camino antiguo **enseña más**: calcula la plantilla, los puntos y la racha desde las
 * actas, y el canónico todavía no puede porque `analytics` está vacía.
 *
 * El puente se retira cuando las páginas que apuntan al slug antiguo estén migradas y el agregado por
 * jugador exista. Leer las colas dentro de una petición de usuario es lo que prohíbe
 * ARQUITECTURA.md §7, así que este camino no crece: sólo se conserva.
 *
 * La URL canónica lleva el identificador de `core.team_entry`, y es deliberado: `core.team_season`
 * mezcla el juvenil y el sénior del club 16 en una sola fila (ver `consultas/entidades.ts`), así que
 * resolver por equipo de temporada no distinguiría dos equipos reales.
 */

/** La calidad de un acta en palabras. Un valor fuera del vocabulario se enseña tal cual. */
const CALIDAD_ACTA: Record<string, string> = {
  correct: 'correcta', administrative: 'administrativa', review: 'a revisar',
  partial: 'parcial', unavailable: 'no disponible',
};

function coberturaDe(fila: FilaEquipo): { estado: EstadoCobertura; hasta: number | null } {
  switch (fila.visibility_state) {
    case 'completa': return { estado: 'completa', hasta: fila.complete_through_matchday };
    case 'verificada_hasta_jornada': return { estado: 'hasta_jornada', hasta: fila.complete_through_matchday };
    case 'parcial_privada': return { estado: 'parcial', hasta: fila.complete_through_matchday };
    case 'oculta': return { estado: 'no_publicada', hasta: null };
    default: return { estado: 'sin_medir', hasta: null };
  }
}

/**
 * El resultado de un partido, tal como lo devuelve la consulta (`ganado`/`empatado`/`perdido`), con
 * su `Signo` del dominio y su color. El color va en clases literales: Tailwind no genera una clase
 * construida con una variable.
 */
const RESULTADO_DEL_PARTIDO = {
  ganado: { signo: 'G', clase: 'text-[var(--victoria)]' },
  empatado: { signo: 'E', clase: 'text-[var(--empate)]' },
  perdido: { signo: 'P', clase: 'text-[var(--derrota)]' },
} as const;

/**
 * El resultado de un partido: letra **y** color, nunca sólo color (DESIGN.md §Color), y con la letra
 * en **V-E-D** (Victoria/Empate/Derrota), no con la del `Signo` del dato (decisión de David,
 * 04/11/2026). La traducción vive en `lib/forma-equipo.ts`: aquí no hay ningún mapa G→V propio.
 */
function Resultado({ resultado }: { resultado: string }) {
  if (resultado === 'sin_resultado') {
    return <span className="text-[var(--texto-tenue)]">sin resultado publicado</span>;
  }
  // Un valor fuera del vocabulario no se disfraza: se lee como derrota, que es lo que hacía antes.
  const { signo, clase } =
    RESULTADO_DEL_PARTIDO[resultado as keyof typeof RESULTADO_DEL_PARTIDO] ?? RESULTADO_DEL_PARTIDO.perdido;
  const { letra, etiqueta } = insigniaForma(signo);
  return <span className={`inline-block w-5 text-center font-semibold ${clase}`} title={etiqueta}>{letra}</span>;
}

async function EquipoCanonico({ idEquipo }: { idEquipo: number }) {
  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico titulo="Equipo" motivo={motivo} />;

  let equipo: FilaEquipo | null = null;
  let jugadores: FilaJugadorDePlantilla[] = [];
  let partidos: FilaPartidoDeEquipo[] = [];
  try {
    equipo = (await consulta<FilaEquipo>(EQUIPO_POR_ID.sql, [idEquipo]))[0] ?? null;
    if (equipo) {
      jugadores = await consulta<FilaJugadorDePlantilla>(PLANTILLA_DEL_EQUIPO.sql, [idEquipo, 200]);
      partidos = await consulta<FilaPartidoDeEquipo>(PARTIDOS_DEL_EQUIPO.sql, [idEquipo, 200, 0]);
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Equipo" motivo={error.message} />;
    throw error;
  }
  if (!equipo) notFound();

  const { estado, hasta } = coberturaDe(equipo);
  // ¿Se puede enseñar alguna cifra derivada? Sólo si el agregado por jugador existe. Si no hay ni una
  // fila con datos se dice con palabras, en vez de pintar una rejilla de guiones que parecería un cero.
  const hayResumen = jugadores.some((j) => j.convocatorias !== null || j.goles !== null);

  const columnasPlantilla: ColumnaTabla<FilaJugadorDePlantilla>[] = [
    { clave: 'nombre_mostrado', titulo: 'Jugador' },
    { clave: 'dorsales', titulo: 'Dorsal', render: (j) => j.dorsales ?? '—' },
    { clave: 'partidos_con_aparicion', titulo: 'Partidos con aparición en acta', tipo: 'numero', abreviatura: 'Apar.' },
    { clave: 'convocatorias', titulo: 'Convocatorias', tipo: 'numero', abreviatura: 'Conv.', render: (j) => numero(j.convocatorias) },
    { clave: 'partidos_demostrados', titulo: 'Partidos demostrados', tipo: 'numero', abreviatura: 'PJ', render: (j) => numero(j.partidos_demostrados) },
    { clave: 'titularidades', titulo: 'Titularidades', tipo: 'numero', abreviatura: 'Tit.', render: (j) => numero(j.titularidades) },
    { clave: 'goles', titulo: 'Goles', tipo: 'numero', abreviatura: 'G', render: (j) => numero(j.goles) },
    { clave: 'amarillas', titulo: 'Tarjetas amarillas', tipo: 'numero', abreviatura: 'TA', render: (j) => numero(j.amarillas) },
    { clave: 'rojas', titulo: 'Tarjetas rojas', tipo: 'numero', abreviatura: 'TR', render: (j) => numero(j.rojas) },
  ];

  const columnasPartidos: ColumnaTabla<FilaPartidoDeEquipo>[] = [
    { clave: 'jornada_numero', titulo: 'Jornada', tipo: 'numero', abreviatura: 'J', render: (p) => numero(p.jornada_numero) },
    { clave: 'fecha_prevista', titulo: 'Fecha prevista', render: (p) => (p.fecha_prevista ? String(p.fecha_prevista).slice(0, 10) : '—') },
    { clave: 'condicion', titulo: 'Condición', render: (p) => (p.condicion === 'casa' ? 'casa' : 'fuera') },
    { clave: 'rival', titulo: 'Rival' },
    {
      clave: null, titulo: 'Marcador',
      // El marcador se pinta con el componente del inventario, no a mano: así la regla de que un
      // resultado sin publicar NO es 0-0 vive en un solo sitio.
      render: (p) => <Marcador local={p.goles_propios} visitante={p.goles_rival} />,
    },
    { clave: 'resultado', titulo: 'Resultado', render: (p) => <Resultado resultado={p.resultado} /> },
    { clave: 'campo', titulo: 'Campo', render: (p) => p.campo ?? '—' },
    {
      clave: 'calidad_acta', titulo: 'Calidad del acta',
      render: (p) => (p.calidad_acta ? (CALIDAD_ACTA[p.calidad_acta] ?? p.calidad_acta) : 'sin acta analizada'),
    },
  ];

  return <>
    <Miga tramos={[
      { texto: 'Federaciones', href: '/federaciones' },
      { texto: equipo.club, href: `/club/${equipo.club_id}` },
      { texto: 'Equipo' },
    ]} />

    <p className="text-etiqueta text-[var(--texto-suave)]">
      {equipo.federacion_nombre} · {equipo.temporada} · {etiqueta('categoria', equipo.edicion_categoria)}
      {' · '}{etiqueta('ambito', equipo.edicion_ambito)}
    </p>
    <h2 className="mt-1 font-display text-3xl uppercase">{equipo.nombre_en_fuente}</h2>
    <p className="mt-2 text-tabla leading-6 text-[var(--texto-suave)]">
      {equipo.edicion} · <b className="text-[var(--texto)]">{equipo.grupo}</b>
      {equipo.jornadas_previstas ? ` · ${equipo.jornadas_previstas} jornadas previstas` : ''}
    </p>
    <p className="mt-2"><InsigniaCobertura estado={estado} hastaJornada={hasta} /></p>

    <div className="my-5 grid grid-cols-2 gap-px border border-[var(--borde)] bg-[var(--borde)] sm:grid-cols-4 lg:grid-cols-7">
      {([
        ['Posición', numero(equipo.posicion)],
        ['Puntos', numero(equipo.puntos)],
        ['Jugados', numero(equipo.jugados)],
        ['Ganados', numero(equipo.ganados)],
        ['Empatados', numero(equipo.empatados)],
        ['Perdidos', numero(equipo.perdidos)],
        ['Partidos con acta', `${numero(equipo.partidos_cubiertos)}/${numero(equipo.partidos_elegibles)}`],
      ] as const).map(([titulo, valor]) => (
        <div key={titulo} className="bg-[var(--fondo-elevado)] p-3">
          <p className="font-display text-xl tabular-nums">{valor}</p>
          <p className="mt-0.5 text-etiqueta tracking-wider text-[var(--texto-suave)]">{titulo}</p>
        </div>
      ))}
    </div>

    <p className="text-nota leading-5 text-[var(--texto-tenue)]">
      Posición y puntos son los de la clasificación oficial guardada. Los goles a favor y en contra
      <b> no se enseñan aquí</b>: la fila oficial los trae a cero y la reconstruida existe aparte, así que
      hasta que el importador los escriba bien cualquier cifra sería falsa.
    </p>

    <h3 className="mt-6 font-display text-lg uppercase">Plantilla · {jugadores.length}</h3>
    {!hayResumen && (
      <div className="mt-2 border-l-4 border-[var(--cobertura-parcial)] bg-[var(--fondo-sutil)] p-3 text-tabla leading-6 text-[var(--texto-suave)]">
        <b className="text-[var(--texto)]">Sin cifras por jugador todavía.</b> El canónico tiene las actas de
        este equipo y de ellas salen las apariciones y los dorsales que se ven abajo, pero los resúmenes
        por jugador (<code>analytics.player_team_season_summary</code>) están sin calcular: hoy no hay
        ningún proceso en el repositorio que los escriba. Las columnas derivadas aparecen como «—» porque
        no están medidas, y <b>no</b> como 0. Goles, minutos y tarjetas se completarán solos cuando ese
        cálculo exista.
      </div>
    )}
    <div className="mt-3">
      <TablaDatos
        filas={jugadores}
        columnas={columnasPlantilla}
        caption={`Jugadores que aparecen en las actas del equipo ${equipo.nombre_en_fuente} en ${equipo.edicion}.`}
        clave={(j) => j.persona_id}
        enlaceFila={(j) => `/jugador/${j.persona_id}`}
        columnaPrincipal={0}
        vacio={<Vacio
          titulo="Sin alineaciones en el canónico"
          motivo="No hay ninguna acta con alineación importada para este equipo. No se puede saber cuál de los dos casos es: que esta federación no publique alineaciones en este tipo de ficha, o que esas actas todavía no se hayan importado. El canónico no declara hoy la capacidad de la fuente —core.source_capability está vacía— así que la web no puede distinguirlo y no lo adivina."
        />}
      />
    </div>
    <p className="mt-2 text-etiqueta leading-5 text-[var(--texto-tenue)]">
      No se enseña <b>quién fue el portero</b>: la fuente marca esa condición de forma irregular. Medido
      en el grupo de Salamanca juvenil 2025-26, sólo 8 de los 26 partidos traen la marca y todos son del
      mismo jugador, así que en 18 partidos no se sabe; además otro jugador usa el dorsal 1 sin estar
      marcado como portero. Afirmarlo sería inventarlo, así que la columna no existe.
    </p>
    {hayResumen && (
      <p className="mt-2 text-etiqueta leading-5 text-[var(--texto-tenue)]">
        «Apar.» son los partidos en los que la persona figura en el acta y sale de las actas mismas. Una
        convocatoria sin condición publicada <b>no</b> cuenta como partido jugado.
      </p>
    )}

    <h3 className="mt-6 font-display text-lg uppercase">Partidos · {partidos.length}</h3>
    <div className="mt-2">
      <TablaDatos
        filas={partidos}
        columnas={columnasPartidos}
        caption={`Partidos del equipo ${equipo.nombre_en_fuente} en ${equipo.edicion}, con jornada, rival, marcador desde su punto de vista y resultado.`}
        clave={(p) => p.partido_id}
        vacio={<Vacio titulo="Sin calendario importado" motivo="El canónico no tiene ningún partido de esta inscripción. No es un cero: no está importado." />}
      />
    </div>

    <div className="mt-4">
      <Procedencia fuente={`${equipo.federacion_nombre} (canónico)`} medidoEn={fechaCorta(equipo.calculado_en)} />
    </div>
  </>;
}

export default async function Equipo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // El puente: identificador canónico → canónico; slug antiguo → colas. Se decide por la forma del
  // valor, que es lo único que distingue los dos espacios de identificadores sin ambigüedad.
  return /^\d+$/.test(slug)
    ? <EquipoCanonico idEquipo={Number(slug)} />
    : <EquipoDesdeCola slug={slug} />;
}
