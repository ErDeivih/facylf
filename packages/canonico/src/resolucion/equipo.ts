/**
 * Club, equipo-temporada e inscripción en un grupo.
 *
 * Regla 7 del encargo: el club se deriva SÓLO quitando la letra de filial del final (entre comillas, o suelta
 * según la fuente: ver `clubDesdeNombreEquipo`).
 * Ninguna otra transformación, y ninguna consolidación automática de dos denominaciones.
 *
 * ## Inscripción CON código e inscripción SIN código
 *
 * Una inscripción puede identificarse de dos maneras (ver `inscripcion.ts` y la migración 0012):
 *
 * - por su **código federativo**, cuando la fuente lo publica;
 * - por su **referencia contextual** `federación | temporada | competición | grupo | nombre_normalizado`,
 *   cuando no lo publica. Entonces `codigo_externo` queda NULL y la referencia se registra en
 *   `source.external_ref` con `external_id = 'ctx:<normalizado>'`.
 *
 * Lo que NO se hace en ningún caso: fabricar un código, cruzar el ámbito para resolver un nombre, usar
 * parecido difuso, quitar la letra de equipo o quitar un calificador legítimo (`(Femenino)`, `(Juv.)`).
 *
 * ## El nombre
 *
 * El equipo-temporada se crea con el nombre **limpio**, sin los marcadores de estado demostrados
 * (`(Sailkatua)`, `(Irabazlea)`…). Ésa es la regla que hace que el calendario y el acta hablen del mismo
 * equipo: la maqueta nova pega el estado al nombre del calendario y el acta publica el nombre limpio.
 * El literal **original no se pierde**: se guarda en `core.team_alias`, que es la tabla de procedencia.
 */
import type { ClienteCanonico } from '../destino/pool.js';
import type { Repositorio } from '../destino/repositorio.js';
import { clubDesdeNombreEquipo } from '../origen/vocabularios.js';
import { contextoDe, type Normalizador } from './contexto.js';
import { registraRef } from './catalogo.js';
import { externalIdContextual, type InscripcionDeGrupo } from './inscripcion.js';

const adaptadores = new Map<number, Promise<boolean>>();
/** La FCF pone siempre la letra del filial suelta al final: ahí cuenta de la A a la H (ver la regla 7). */
function letraSueltaSiempre(cliente: ClienteCanonico, federacionId: number): Promise<boolean> {
  if (!adaptadores.has(federacionId)) {
    adaptadores.set(federacionId, cliente.query<{ adaptador: string }>(
      'select adaptador from core.federation where id = $1', [federacionId],
    ).then((r) => r.rows[0]?.adaptador === 'fcf'));
  }
  return adaptadores.get(federacionId)!;
}

export type EntradaInscripcion = {
  federacionId: number;
  seasonId: number;
  etiquetaTemporada: string;
  competicion: string;
  grupo: string;
  phaseGroupId: number;
  /** La inscripción decidida por el catálogo del grupo: con código o por referencia contextual. */
  inscripcion: InscripcionDeGrupo;
  categoria: string;
  genero: string;
};

export type InscripcionPersistida = {
  teamSeasonId: number;
  teamEntryId: number;
  clubId: number;
  /** La clave con la que el lote identifica esta inscripción: su código o `contexto:<normalizado>`. */
  clave: string;
};

/**
 * Persiste una inscripción del grupo y sus referencias externas.
 *
 * Upserts, todos por clave natural, así que **importar dos veces inserta cero entidades nuevas**:
 * el club por (federación, nombre normalizado), el equipo-temporada por (club, temporada, nombre) y la
 * inscripción por (equipo-temporada, grupo).
 */
export async function resuelveEquipo(
  cliente: ClienteCanonico,
  repo: Repositorio,
  normalizador: Normalizador,
  entrada: EntradaInscripcion,
): Promise<InscripcionPersistida> {
  const { federacionId, seasonId, inscripcion } = entrada;
  const nombreEquipo = inscripcion.nombre.trim();
  const nombreClub = clubDesdeNombreEquipo(nombreEquipo, { letraSueltaSiempre: await letraSueltaSiempre(cliente, federacionId) });
  const clubNorm = await normalizador.normaliza(nombreClub);

  // El club se busca por su clave natural normalizada; si no está, se crea.
  const { rows: clubes } = await cliente.query<{ id: string }>(
    'select id from core.club where federation_id = $1 and nombre_norm = $2',
    [federacionId, clubNorm],
  );
  let clubId: number;
  if (clubes[0]) {
    clubId = Number(clubes[0].id);
  } else {
    // `nombre_norm` es una columna generada: no se inserta, sólo se usa como destino del conflicto.
    clubId = await repo.upsert(
      'core.club',
      { federation_id: federacionId, nombre_canonico: nombreClub, municipio: null, provincia: null, data_version: 1 },
      ['federation_id', 'nombre_norm'],
    );
  }

  /*
   * ── EL CÓDIGO ES IDENTIDAD FUERTE: SI EL GRUPO YA TIENE ESE CÓDIGO, SE REUTILIZA SU EQUIPO-TEMPORADA ──
   *
   * El equipo-temporada se identifica por (club, temporada, NOMBRE), y el nombre puede cambiar de una
   * importación a otra —«PALAMOS CLUB DE FUTBOL A» hoy, «PALAMOS CLUB DE FUTBOL» mañana—. Sin esta consulta,
   * el nombre nuevo creaba un equipo-temporada nuevo y su inscripción chocaba con el índice único
   * (grupo, código) que ya tenía la vieja: «duplicate key value violates unique constraint
   * team_entry_grupo_codigo_uq». Medido el 25/09/2026 en tres grupos de Cataluña.
   *
   * Un código federativo es la identidad que publica la fuente, así que manda sobre la ortografía del día.
   */
  let teamSeasonId: number | undefined;
  if (inscripcion.codigoExterno !== null) {
    const { rows } = await cliente.query<{ team_season_id: string }>(
      `select team_season_id from core.team_entry
        where phase_group_id = $1 and codigo_externo = $2
        order by id limit 1`,
      [entrada.phaseGroupId, inscripcion.codigoExterno],
    );
    if (rows[0] !== undefined) teamSeasonId = Number(rows[0].team_season_id);
  }
  /*
   * ── Y LO MISMO CON LA REFERENCIA CONTEXTUAL (13/10/2026) ──────────────────────────────────────────────
   *
   * Un equipo sin código se identifica en su grupo por su nombre NORMALIZADO (`referencia_contextual`), pero
   * el equipo-temporada se busca por el nombre LITERAL. Si la fuente cambia la ortografía sin cambiar el
   * nombre normalizado (un punto, una tilde, mayúsculas), el literal nuevo creaba otro equipo-temporada y su
   * inscripción chocaba con la que ya tenía esa referencia: «duplicate key value violates unique constraint
   * team_entry_referencia_contextual_uq». Medido en Rioja 2026-27, grupos 21959333 y 21959335.
   * La referencia es la identidad que ya estableció el grupo: manda sobre la ortografía del día.
   */
  if (teamSeasonId === undefined && inscripcion.referenciaContextual !== null) {
    const { rows } = await cliente.query<{ team_season_id: string }>(
      `select team_season_id from core.team_entry
        where phase_group_id = $1 and referencia_contextual = $2
        order by id limit 1`,
      [entrada.phaseGroupId, inscripcion.referenciaContextual],
    );
    if (rows[0] !== undefined) teamSeasonId = Number(rows[0].team_season_id);
  }
  teamSeasonId ??= await repo.upsert(
    'core.team_season',
    {
      club_id: clubId,
      season_id: seasonId,
      nombre: nombreEquipo,
      categoria: entrada.categoria,
      genero: entrada.genero,
      data_version: 1,
    },
    ['club_id', 'season_id', 'nombre'],
  );

  // La procedencia se conserva ENTERA: todas las formas literales que la fuente usó para este equipo,
  // incluida la que traía el marcador de estado y la del acta. Ninguna se pierde por el camino.
  for (const literal of inscripcion.alias) {
    await repo.upsert(
      'core.team_alias',
      { team_season_id: teamSeasonId, federation_id: federacionId, literal, visto_desde: null, visto_hasta: null },
      ['team_season_id', 'federation_id', 'literal'],
    );
  }
  // Y el nombre limpio, que es el que usan el acta y el resto de representaciones del ámbito.
  if (nombreEquipo !== '' && !inscripcion.alias.includes(nombreEquipo)) {
    await repo.upsert(
      'core.team_alias',
      { team_season_id: teamSeasonId, federation_id: federacionId, literal: nombreEquipo, visto_desde: null, visto_hasta: null },
      ['team_season_id', 'federation_id', 'literal'],
    );
  }

  const teamEntryId = await repo.upsert(
    'core.team_entry',
    {
      team_season_id: teamSeasonId,
      phase_group_id: entrada.phaseGroupId,
      codigo_externo: inscripcion.codigoExterno,
      nombre_en_fuente: nombreEquipo,
      referencia_contextual: inscripcion.referenciaContextual,
      metodo_resolucion: inscripcion.metodo,
      // `procedencias` es jsonb: se manda como TEXTO JSON. Un array de JavaScript lo convertiría
      // node-postgres en un literal de array de PostgreSQL (`{calendario,acta}`), que jsonb rechaza.
      procedencias: JSON.stringify(inscripcion.procedencias),
      // Fechado SÓLO cuando la inscripción nació sin código y ya tiene uno: es la vinculación auditable.
      codigo_vinculado_en: inscripcion.vinculada === true ? new Date().toISOString() : null,
      retirado: false,
    },
    ['team_season_id', 'phase_group_id'],
  );

  const contextKey = contextoDe({
    etiquetaTemporada: entrada.etiquetaTemporada,
    competicion: entrada.competicion,
    grupo: entrada.grupo,
  });

  // La referencia externa del equipo lleva la tupla completa: temporada + competición + grupo. Es el
  // MISMO contexto para las dos formas, así que una inscripción contextual y su código real posterior
  // apuntan al mismo `canonical_id` y la vinculación queda auditable en las dos direcciones.
  if (inscripcion.codigoExterno !== null) {
    await registraRef(repo, {
      federacionId, entityType: 'equipo', externalId: inscripcion.codigoExterno, contextKey, canonicalId: teamEntryId,
    });
  }
  if (inscripcion.referenciaContextual !== null) {
    await registraRef(repo, {
      federacionId,
      entityType: 'equipo',
      externalId: externalIdContextual(inscripcion.referenciaContextual),
      contextKey,
      canonicalId: teamEntryId,
    });
  }

  return { teamSeasonId, teamEntryId, clubId, clave: inscripcion.clave };
}
