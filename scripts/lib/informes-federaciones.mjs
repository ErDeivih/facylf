/*
 * ── QUÉ FEDERACIONES SE PUEDEN CONSULTAR EN LOS INFORMES ─────────────────────────────────────────────
 *
 * La lista sale de `config/federaciones-espana.json` (las 19 territoriales de la RFEF), no de la base: el
 * canónico tiene además federaciones de prueba (golden tests) que no deben aparecer en un informe.
 * Castilla y León sigue siendo la opción por defecto; «todas» se admite para buscar.
 *
 * Los informes no cruzan federaciones al identificar personas: una persona canónica nace dentro de UNA
 * federación (su código federativo sólo vale allí) y sólo una `identity_decision` puede unirla con otra.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Nombres cortos para pantalla; el oficial largo va en la configuración.
const CORTOS = {
  andalucia: 'Andalucía', aragon: 'Aragón', asturias: 'Asturias', baleares: 'Illes Balears', canarias: 'Canarias',
  cantabria: 'Cantabria', 'castilla-la-mancha': 'Castilla-La Mancha', 'castilla-leon': 'Castilla y León',
  cataluna: 'Cataluña', ceuta: 'Ceuta', extremadura: 'Extremadura', galicia: 'Galicia', madrid: 'Madrid',
  murcia: 'Región de Murcia', melilla: 'Melilla', navarra: 'Navarra', rioja: 'La Rioja',
  valencia: 'Comunitat Valenciana', euskadi: 'Euskadi',
  bizkaia: 'Bizkaia', gipuzkoa: 'Gipuzkoa', araba: 'Araba', laspalmas: 'Las Palmas', tenerife: 'Tenerife',
};

export const FEDERACION_POR_DEFECTO = 'castilla-leon';

let cache = null;
/**
 * Todas las fuentes de la configuración: las 19 autonómicas y las provinciales que dependen de una de ellas
 * (`pertenece_a`, 16/10/2026: Bizkaia, Gipuzkoa y Araba en Euskadi; Las Palmas y Tenerife en Canarias).
 */
function todasLasFuentes(raiz = resolve('.')) {
  if (cache) return cache;
  const config = JSON.parse(readFileSync(resolve(raiz, 'config', 'federaciones-espana.json'), 'utf8').replace(/^\uFEFF/, ''));
  cache = (config.fuentes ?? []).map((f) => ({
    codigo: f.codigo, nombre: CORTOS[f.codigo] ?? f.nombre, oficial: f.nombre, perteneceA: f.pertenece_a ?? null,
  }));
  return cache;
}

/** Las 19 federaciones autonómicas (las que se eligen en pantalla): [{codigo, nombre, oficial}]. */
export function federacionesReales(raiz) {
  return todasLasFuentes(raiz).filter((f) => !f.perteneceA).map(({ codigo, nombre, oficial }) => ({ codigo, nombre, oficial }));
}

/** Las provinciales que cuentan dentro de una autonómica (vacío si no tiene). */
export const federacionesDentroDe = (codigo, raiz) => todasLasFuentes(raiz).filter((f) => f.perteneceA === codigo).map((f) => f.codigo);
/** La autonómica a la que pertenece una federación (ella misma si ya lo es). */
export const autonomiaDe = (codigo, raiz) => todasLasFuentes(raiz).find((f) => f.codigo === codigo)?.perteneceA ?? codigo;

/** Todos los códigos válidos en el canónico: autonómicas y provinciales. */
export const codigosReales = (raiz) => todasLasFuentes(raiz).map((f) => f.codigo);
export const nombreFederacion = (codigo, raiz) => {
  const f = todasLasFuentes(raiz).find((x) => x.codigo === codigo);
  if (!f) return codigo;
  const madre = f.perteneceA ? todasLasFuentes(raiz).find((x) => x.codigo === f.perteneceA) : null;
  return madre ? `${f.nombre} (${madre.nombre})` : f.nombre;
};

/** Normaliza lo que llega por URL: una federación real, «todas», o la de por defecto si no se reconoce. */
export function federacionPedida(valor, raiz) {
  const v = String(valor ?? '').trim().toLowerCase();
  if (v === 'todas') return 'todas';
  // Se elige una AUTONOMÍA; sus provinciales van dentro (ver `codigosParaSql`).
  return federacionesReales(raiz).some((f) => f.codigo === v) ? v : FEDERACION_POR_DEFECTO;
}

/**
 * Lista de códigos para SQL (`= any($n::text[])`): una federación con las provinciales que tiene dentro, o todas.
 * Elegir Euskadi incluye Bizkaia, Gipuzkoa y Araba; elegir Canarias, Las Palmas y Tenerife.
 */
export const codigosParaSql = (federacion, raiz) => (federacion === 'todas'
  ? codigosReales(raiz)
  : [federacion, ...federacionesDentroDe(federacion, raiz)]);

/*
 * Provincia que declara el propio nombre del grupo («… Grupo Salamanca»). Sólo es una ayuda para el
 * filtro cuando la edición no la trae: nunca se deduce de otra cosa. Incluye las formas cooficiales.
 */
const PROVINCIAS = ['A Coruña', 'Coruña', 'Álava', 'Araba', 'Albacete', 'Alicante', 'Alacant', 'Almería', 'Asturias', 'Ávila',
  'Badajoz', 'Barcelona', 'Bizkaia', 'Vizcaya', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Castelló', 'Ceuta',
  'Ciudad Real', 'Córdoba', 'Cuenca', 'Gipuzkoa', 'Guipúzcoa', 'Girona', 'Gerona', 'Granada', 'Guadalajara', 'Huelva', 'Huesca',
  'Illes Balears', 'Jaén', 'La Rioja', 'Las Palmas', 'León', 'Lleida', 'Lérida', 'Lugo', 'Madrid', 'Málaga', 'Melilla',
  'Murcia', 'Navarra', 'Ourense', 'Orense', 'Palencia', 'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife', 'Tenerife',
  'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'València', 'Valladolid', 'Zamora', 'Zaragoza'];
const simple = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PATRONES = PROVINCIAS.map((nombre) => [nombre, new RegExp(`(^|[^a-z])${simple(nombre)}([^a-z]|$)`)])
  // Los nombres largos primero: «Santa Cruz de Tenerife» antes que «Tenerife», «A Coruña» antes que «Coruña».
  .sort((a, b) => b[0].length - a[0].length);

export function provinciaPublicada(grupo) {
  const texto = simple(grupo);
  return PATRONES.find(([, patron]) => patron.test(texto))?.[0] ?? '';
}
