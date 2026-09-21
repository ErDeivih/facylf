/**
 * Club, equipo-temporada e inscripción en un grupo.
 *
 * Regla 7 del encargo: el club se deriva SÓLO quitando el sufijo de letra entrecomillada final.
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
  const nombreClub = clubDesdeNombreEquipo(nombreEquipo);
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

  const teamSeasonId = await repo.upsert(
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
