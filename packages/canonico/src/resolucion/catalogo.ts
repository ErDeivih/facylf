/**
 * Catálogo: edición de competición, grupo y jornada. Es lo primero que se resuelve en un lote,
 * porque todo lo demás cuelga de ahí.
 */
import type { ClienteCanonico } from '../destino/pool.js';
import type { Repositorio } from '../destino/repositorio.js';
import type { FilaCompeticion, FilaGrupo, FilaJornada } from '../origen/cola.js';
import {
  ambitoDesdeNombre, categoriaDesdeNombre, generoDesdeNombre, modalidadDesdeNombre, fechaIso,
} from '../origen/vocabularios.js';
import { contextoDe, type Normalizador } from './contexto.js';

/** Referencia externa contextualizada: la tupla completa, nunca una parte suelta (ADR-0002). */
export async function registraRef(
  repo: Repositorio,
  datos: { federacionId: number; entityType: string; externalId: string; contextKey: string; canonicalId: number },
): Promise<void> {
  await repo.upsert(
    'source.external_ref',
    {
      federation_id: datos.federacionId,
      entity_type: datos.entityType,
      external_id: datos.externalId,
      context_key: datos.contextKey,
      canonical_id: datos.canonicalId,
    },
    ['federation_id', 'entity_type', 'external_id', 'context_key'],
  );
}

export async function leeRef(
  cliente: ClienteCanonico,
  datos: { federacionId: number; entityType: string; externalId: string; contextKey: string },
): Promise<number | null> {
  const { rows } = await cliente.query<{ canonical_id: string | null }>(
    `select canonical_id from source.external_ref
     where federation_id = $1 and entity_type = $2 and external_id = $3 and context_key = $4`,
    [datos.federacionId, datos.entityType, datos.externalId, datos.contextKey],
  );
  const id = rows[0]?.canonical_id;
  return id === null || id === undefined ? null : Number(id);
}

function estadoEdicion(fechas: Array<string | null>, hoy = new Date()): string {
  const validas = fechas.map((f) => fechaIso(f)).filter((f): f is string => f !== null);
  if (validas.length === 0) return 'prevista';
  const futuras = validas.filter((f) => new Date(`${f}T23:59:59`).getTime() >= hoy.getTime());
  return futuras.length > 0 ? 'activa' : 'finalizada';
}

export type EntradaEdicion = {
  federacionId: number;
  seasonId: number;
  etiquetaTemporada: string;
  competicion: FilaCompeticion;
  fechas: Array<string | null>;
};

export async function resuelveEdicion(
  cliente: ClienteCanonico,
  repo: Repositorio,
  normalizador: Normalizador,
  entrada: EntradaEdicion,
): Promise<number> {
  const { federacionId, seasonId, etiquetaTemporada, competicion } = entrada;
  const contextKey = contextoDe({ etiquetaTemporada });
  const existente = await leeRef(cliente, {
    federacionId, entityType: 'competition_edition', externalId: competicion.codigo, contextKey,
  });
  const nombre = competicion.nombre.trim();
  const ambito = ambitoDesdeNombre(nombre);
  const modalidad = modalidadDesdeNombre(nombre);
  const genero = generoDesdeNombre(nombre);
  const categoria = categoriaDesdeNombre(nombre);
  const confianza = Math.min(ambito.confianza, 1) * 0.5 + categoria.confianza * 0.5;
  const id = await repo.upsert(
    'core.competition_edition',
    {
      federation_id: federacionId,
      season_id: seasonId,
      competition_id: null,
      codigo_externo: competicion.codigo,
      nombre_publicado: nombre,
      ambito: ambito.ambito,
      modalidad: modalidad.modalidad,
      genero: genero.genero,
      categoria: categoria.categoria,
      provincia: null,
      nivel: null,
      estado: estadoEdicion(entrada.fechas),
      classification_confidence: Number(confianza.toFixed(2)),
      data_version: 1,
    },
    ['federation_id', 'season_id', 'codigo_externo'],
  );
  await registraRef(repo, { federacionId, entityType: 'competition_edition', externalId: competicion.codigo, contextKey, canonicalId: id });
  if (existente === null) await normalizador.normaliza(nombre);
  return id;
}

export async function resuelveGrupo(
  cliente: ClienteCanonico,
  repo: Repositorio,
  datos: {
    federacionId: number;
    etiquetaTemporada: string;
    competicion: string;
    edicionId: number;
    grupo: FilaGrupo;
    orden: number;
  },
): Promise<number> {
  const contextKey = contextoDe({ etiquetaTemporada: datos.etiquetaTemporada, competicion: datos.competicion });
  const tipo = /copa|eliminatoria|fase|ascenso|promoci/i.test(datos.grupo.nombre) ? 'fase' : 'liga';
  const id = await repo.upsert(
    'core.phase_group',
    {
      competition_edition_id: datos.edicionId,
      codigo_externo: datos.grupo.codigo,
      nombre: datos.grupo.nombre.trim(),
      tipo,
      orden: datos.orden,
      jornadas_previstas: datos.grupo.jornadas ?? null,
      data_version: 1,
    },
    ['competition_edition_id', 'codigo_externo'],
  );
  await registraRef(repo, {
    federacionId: datos.federacionId,
    entityType: 'phase_group',
    externalId: datos.grupo.codigo,
    contextKey,
    canonicalId: id,
  });
  return id;
}

export async function resuelveJornada(
  cliente: ClienteCanonico,
  repo: Repositorio,
  datos: { federacionId: number; etiquetaTemporada: string; competicion: string; grupo: string; jornada: FilaJornada; phaseGroupId: number },
): Promise<number> {
  const fecha = fechaIso(datos.jornada.fecha);
  const id = await repo.upsert(
    'core.matchday',
    {
      phase_group_id: datos.phaseGroupId,
      numero: datos.jornada.numero,
      codigo_externo: String(datos.jornada.numero),
      fecha_prevista: fecha,
      cerrada: fecha !== null && new Date(`${fecha}T23:59:59`).getTime() < Date.now(),
    },
    ['phase_group_id', 'numero'],
  );
  await registraRef(repo, {
    federacionId: datos.federacionId,
    entityType: 'matchday',
    externalId: String(datos.jornada.numero),
    contextKey: contextoDe({
      etiquetaTemporada: datos.etiquetaTemporada,
      competicion: datos.competicion,
      grupo: datos.grupo,
    }),
    canonicalId: id,
  });
  return id;
}
