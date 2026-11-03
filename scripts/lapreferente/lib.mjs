/**
 * La Preferente → canónico: piezas comunes (Claude, 26/10/2026).
 * Plan: docs/plataforma-web/LA-PREFERENTE-PLAN-2026-10-25.md §4. Flujo:
 *   1. a-externo.mjs      registros del multideporte (lapreferente-federado) → externo.lp_*           (L2)
 *   2. empareja.mjs       cada competición de LP con su grupo de la federación → externo.lp_emparejado (L3a)
 *   3. cola-lp.mjs        lo que la federación NO tiene → una cola SQLite con el formato de recolector-local,
 *                         que se importa con el importador de siempre (importar-temporada.ps1 -Paquete …)
 *                         y FACYLF_ORIGEN=lapreferente                                                 (L3b)
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export const RAIZ = new URL('../../', import.meta.url);

/** IDccaa de La Preferente → federación (o familia de federaciones) del proyecto. Medido en su comboCCAA. */
export const CCAA_LP = {
  1: ['andalucia'], 2: ['aragon'], 3: ['asturias'], 4: ['baleares'], 5: ['canarias', 'laspalmas', 'tenerife'],
  6: ['cantabria'], 7: ['castilla-la-mancha'], 8: ['castilla-leon'], 9: ['cataluna'], 10: ['ceuta'], 11: ['valencia'],
  12: ['extremadura'], 13: ['galicia'], 14: ['rioja'], 15: ['madrid'], 16: ['melilla'], 17: ['murcia'], 18: ['navarra'],
  19: ['euskadi', 'bizkaia', 'gipuzkoa', 'araba'],
};
/** La federación «de la casa» de una comunidad: a la que se asigna lo que no se empareja con ninguna. */
export const federacionPrincipal = (ccaa) => CCAA_LP[Number(ccaa)]?.[0] ?? null;

/** Hosts de las URL de carga de LP → federación. Sale de config/federaciones-espana.json más los de iSquad y RFEF. */
export function federacionesPorHost(raiz = RAIZ) {
  const mapa = new Map([['resultadosffcv.isquad.es', 'valencia'], ['ffcv.es', 'valencia'], ['www.rffm.es', 'madrid'], ['rffm.es', 'madrid'],
    ['resultados.rfef.es', 'rfef'], ['marcadores.rfef.es', 'rfef'], ['www.fcf.cat', 'cataluna'], ['fcf.cat', 'cataluna']]);
  try {
    const cfg = JSON.parse(readFileSync(new URL('config/federaciones-espana.json', raiz), 'utf8'));
    for (const f of cfg.fuentes ?? []) { try { mapa.set(new URL(f.portal).host, f.codigo); } catch { /* sin URL */ } }
  } catch { /* sin fichero: sólo los fijos */ }
  return mapa;
}

/**
 * Lo que dice la URL de carga de LP sobre el grupo de la federación.
 *  · PNFG:   …NFG_VisCalendario_Vis?…codtemporada=21&codcompeticion=22911132&codgrupo=22911133
 *  · iSquad: resultadosffcv.isquad.es/total_partidos.php?id_temp=21&id_modalidad=…&id_competicion=29509433
 *  · FCF:    www.fcf.cat/calendari/2526/futbol-11/preferent-juvenils/grup-1
 */
export function grupoDeUrlFederacion(url, hosts = federacionesPorHost()) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  const q = (k) => [...u.searchParams.entries()].find(([n]) => n.toLowerCase() === k)?.[1] ?? null;
  const federacion = hosts.has(u.host) ? hosts.get(u.host) : null;
  if (/NFG_/i.test(u.pathname)) {
    return { plataforma: u.host === 'resultados.rfef.es' ? 'rfef' : 'pnfg', federacion, host: u.host,
      temporada: q('codtemporada'), competicion: q('codcompeticion'), grupo: q('codgrupo') };
  }
  if (/isquad/i.test(u.host)) return { plataforma: 'isquad', federacion, host: u.host, temporada: q('id_temp'), competicion: q('id_competicion'), grupo: q('id_grupo') };
  const fcf = /\/calendari\/(\d{4})\/([^/]+)\/([^/]+)\/([^/?#]+)/.exec(u.pathname);
  if (fcf) return { plataforma: 'fcf', federacion: 'cataluna', host: u.host, temporada: fcf[1], competicion: `${fcf[2]}/${fcf[3]}`, grupo: fcf[4] };
  return { plataforma: 'otra', federacion, host: u.host };
}

/** pg desde el paquete del canónico (pnpm no lo sube a la raíz). */
export function pg() {
  const requerir = createRequire(new URL('packages/canonico/package.json', RAIZ));
  return requerir('pg');
}

/** La URL de conexión: la variable, o la línea DATABASE_URL_PUBLICADOR del .env de la raíz. */
export function urlBase(raiz = RAIZ) {
  if (process.env.DATABASE_URL_PUBLICADOR) return process.env.DATABASE_URL_PUBLICADOR;
  const ruta = new URL('.env', raiz);
  if (existsSync(ruta)) {
    const m = /^DATABASE_URL_PUBLICADOR=(\S+)/m.exec(readFileSync(ruta, 'utf8'));
    if (m) return m[1];
  }
  throw new Error('Falta DATABASE_URL_PUBLICADOR (en el entorno o en .env).');
}

/** Los registros de lapreferente-federado en la cola del multideporte (sólo lectura). */
export function abreRegistros(ruta) {
  const db = new DatabaseSync(ruta, { readOnly: true, timeout: 10_000 });
  const lee = (tipo) => db.prepare('select clave, datos, url, actualizado_en from registros where adaptador = ? and tipo = ?')
    .all('lapreferente-federado', tipo).map((r) => ({ clave: r.clave, url: r.url, actualizado_en: r.actualizado_en, ...JSON.parse(r.datos) }));
  return {
    competiciones: () => lee('competicion'),
    partidos: () => lee('partido'),
    fichas: () => lee('ficha'),
    cierra: () => db.close(),
  };
}

/** «2025-26» a partir de «20252026», «2025-26» o un número. */
export function etiquetaTemporada(t) {
  const s = String(t ?? '');
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
  return null;
}
