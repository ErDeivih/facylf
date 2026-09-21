/**
 * Personas: con código federativo e identidad nominal (sin código).
 *
 *  · Con código: `person_source_identity(federación, código, contexto='')`. El código de la cola es
 *    único dentro de la federación (`personas.codigo` es su clave primaria), así que el contexto
 *    vacío es el correcto y no parte la persona por temporadas.
 *  · Sin código (árbitros y cuerpo técnico): `context_key` con el formato que verifica la migración
 *    0008, `identidad_nominal = true`, y `ambito=edicion` para árbitros y `ambito=equipo` para
 *    cuerpo técnico. Nunca `partido` ni `acta`.
 *  · Regla 6: un nombre igual NO une a dos personas. Aquí no se fusiona nada.
 */
import type { ClienteCanonico } from '../destino/pool.js';
import type { Repositorio } from '../destino/repositorio.js';
import type { Normalizador } from './contexto.js';
import { contextoNominal } from './contexto.js';
import { registraRef } from './catalogo.js';

export type PersonaResuelta = { personId: number; creada: boolean };

/** Persona con código federativo (jugadores en las fuentes PNFG). */
export async function resuelvePersonaConCodigo(
  cliente: ClienteCanonico,
  repo: Repositorio,
  datos: { federacionId: number; codigo: string; nombre: string; esMenor: boolean; primeraActa: string | null; ultimaActa: string | null },
): Promise<PersonaResuelta> {
  const { rows } = await cliente.query<{ person_id: string }>(
    `select person_id from core.person_source_identity
     where federation_id = $1 and codigo_externo = $2 and context_key = ''`,
    [datos.federacionId, datos.codigo],
  );
  if (rows[0]) {
    const personId = Number(rows[0].person_id);
    if (datos.esMenor) await cliente.query('update core.person set es_menor = true where id = $1 and es_menor = false', [personId]);
    await cliente.query(
      `update core.person_source_identity set
         ultima_acta = coalesce($2::text, ultima_acta),
         primera_acta = coalesce(primera_acta, $3::text)
       where person_id = $1::bigint and codigo_externo = $4::text`,
      [personId, datos.ultimaActa, datos.primeraActa, datos.codigo],
    );
    return { personId, creada: false };
  }

  const personId = await repo.inserta(
    'core.person',
    { nombre_mostrado: datos.nombre.trim(), es_menor: datos.esMenor, identidad_nominal: false, data_version: 1 },
  );
  await repo.upsert(
    'core.person_source_identity',
    {
      person_id: personId,
      federation_id: datos.federacionId,
      codigo_externo: datos.codigo,
      context_key: '',
      primera_acta: datos.primeraActa,
      ultima_acta: datos.ultimaActa,
    },
    ['federation_id', 'codigo_externo', 'context_key'],
    // El índice único con código es parcial (migración 0007): el árbitro del conflicto tiene que
    // declarar el mismo predicado.
    { predicado: 'codigo_externo is not null' },
  );
  await repo.upsert(
    'core.person_name',
    { person_id: personId, literal: datos.nombre.trim(), es_apodo: false, visto_desde: null, visto_hasta: null },
    ['person_id', 'literal'],
  );
  await registraRef(repo, {
    federacionId: datos.federacionId,
    entityType: 'persona',
    externalId: datos.codigo,
    contextKey: '',
    canonicalId: personId,
  });
  return { personId, creada: true };
}

/**
 * Persona sin código federativo, con identidad nominal.
 *
 * El `context_key` incluye rol, temporada y ámbito (edición o equipo) porque es lo único que impide
 * que todos los «GARCÍA LÓPEZ, JUAN» de una federación acaben siendo la misma fila.
 */
export async function resuelvePersonaNominal(
  cliente: ClienteCanonico,
  repo: Repositorio,
  normalizador: Normalizador,
  datos: {
    federacionId: number;
    etiquetaTemporada: string;
    nombre: string;
    rol: string;
    ambito: 'edicion' | 'equipo';
    ambitoId: number;
    /** Un menor sigue siendo menor aunque sólo se le conozca por su nombre. */
    esMenor?: boolean;
  },
): Promise<PersonaResuelta> {
  const nombre = datos.nombre.trim();
  const [nombreNorm, rolNorm] = await Promise.all([normalizador.normaliza(nombre), normalizador.normaliza(datos.rol)]);
  const contextKey = contextoNominal(rolNorm || 'sin rol', datos.etiquetaTemporada, datos.ambito, datos.ambitoId, nombreNorm || 'sin nombre');

  const { rows } = await cliente.query<{ person_id: string }>(
    'select person_id from core.person_source_identity where federation_id = $1 and codigo_externo is null and context_key = $2',
    [datos.federacionId, contextKey],
  );
  if (rows[0]) return { personId: Number(rows[0].person_id), creada: false };

  const personId = await repo.inserta(
    'core.person',
    { nombre_mostrado: nombre, es_menor: datos.esMenor ?? false, identidad_nominal: true, data_version: 1 },
  );
  await repo.upsert(
    'core.person_source_identity',
    {
      person_id: personId,
      federation_id: datos.federacionId,
      codigo_externo: null,
      context_key: contextKey,
      primera_acta: null,
      ultima_acta: null,
    },
    ['federation_id', 'context_key'],
    // Índice parcial de las personas SIN código (migración 0007).
    { predicado: 'codigo_externo is null' },
  );
  await repo.upsert(
    'core.person_name',
    { person_id: personId, literal: nombre, es_apodo: false, visto_desde: null, visto_hasta: null },
    ['person_id', 'literal'],
  );
  return { personId, creada: true };
}

/** Normaliza el rol del cuerpo técnico. El vocabulario medido y sus reglas viven en `roles.ts`. */
export { rolTecnicoNormalizado, resuelveRolTecnico, type RolResuelto } from './roles.js';
