/**
 * La Preferente, TODO (federado y no federado): catálogo por comunidad y temporada → calendario (una temporada
 * entera en una petición) → ficha de partido (opcional, por prioridad).
 *
 * Escrito por Claude el 25/10/2026. Plan, medidas y encargo: `docs/plataforma-web/LA-PREFERENTE-PLAN-2026-10-25.md`.
 *
 * ── NO ESTÁ ACTIVADO ───────────────────────────────────────────────────────────────────────────────────────
 * No está en `adaptadores-activos.json`. Es un SUPERCONJUNTO de `lapreferente` (no federado y veteranos): los dos
 * piden a www.lapreferente.com y el motor sólo espacia peticiones DENTRO de un proceso, así que **nunca deben
 * correr a la vez** (doblaría el ritmo a la web). Para activarlo (L1 del plan): quitar `lapreferente` de
 * `adaptadores-activos.json`, poner `lapreferente-federado`, y `reiniciar-multideporte.ps1` (o el equivalente del
 * servidor) para que el proceso viejo pare.
 *
 * ── QUÉ HACE ───────────────────────────────────────────────────────────────────────────────────────────────
 *  · region: la página de una competición de la comunidad trae en desplegables `grupoNN` TODAS las competiciones
 *    de esa comunidad y temporada, de todas las categorías (y las nacionales, que se repiten en todas: el motor
 *    las pide una vez porque la clave de página es la URL). Encola su CALENDARIO y las demás temporadas.
 *  · calendario: `index.php?comp={id}&accion=calendario` → todas las jornadas con sus partidos (lector en
 *    `_lapreferente-ficha.mjs`). Registros `competicion` y `partido`. Si `fichas` está activo y la competición
 *    pasa el filtro, encola las fichas disponibles de los partidos jugados.
 *  · ficha: el acta (alineaciones, cambios, goles, tarjetas, árbitro, estadio). Registro `ficha`.
 *  Baloncesto (grupos 28 y 29) fuera. Fútbol sala dentro (es fútbol).
 *
 * Datos personales: no se guarda la edad ni fotos ni escudos. Las fichas de categorías de base llevan
 * `menores: true` (la capa que publica no enseña nombres). Codificación windows-1252.
 */
import { calendario, fichaPartido } from './_lapreferente-ficha.mjs';
import { meta, temporadas, temporadaEnCurso, SEMILLAS } from './lapreferente.mjs';
import { decodificaEntidades, limpia } from './_html.mjs';
import { existsSync, readFileSync } from 'node:fs';

const BASE = 'https://www.lapreferente.com/';

/** Categorías de LP (id del desplegable `grupoNN`), medidas el 25/10/2026. */
export const CATEGORIAS_LP = {
  1: { modalidad: 'futbol11', categoria: 'aficionados', genero: 'masculina' },
  2: { modalidad: 'futbol11', categoria: 'juvenil', genero: 'masculina' },
  3: { modalidad: 'futbol11', categoria: 'cadete', genero: 'masculina' },
  4: { modalidad: 'futbol11', categoria: 'infantil', genero: 'masculina' },
  6: { modalidad: 'futbol11', categoria: 'alevin', genero: 'masculina' },
  7: { modalidad: 'futbol11', categoria: 'benjamin', genero: 'masculina' },
  8: { modalidad: 'futbol11', categoria: 'prebenjamin', genero: 'masculina' },
  35: { modalidad: 'futbol11', categoria: 'prebenjamin', genero: 'masculina', nota: 'Bebé' },
  56: { modalidad: 'futbol11', categoria: 'infantil', genero: 'masculina', nota: 'S13' },
  57: { modalidad: 'futbol11', categoria: 'alevin', genero: 'masculina', nota: 'S11' },
  58: { modalidad: 'futbol11', categoria: 'benjamin', genero: 'masculina', nota: 'S9' },
  59: { modalidad: 'futbol11', categoria: 'cadete', genero: 'masculina', nota: 'S15' },
  9: { modalidad: 'futbol11', categoria: 'aficionados', genero: 'femenina' },
  42: { modalidad: 'futbol11', categoria: 'juvenil', genero: 'femenina' },
  10: { modalidad: 'futbol11', categoria: 'cadete', genero: 'femenina' },
  45: { modalidad: 'futbol11', categoria: 'infantil', genero: 'femenina' },
  23: { modalidad: 'futbol11', categoria: 'alevin', genero: 'femenina' },
  52: { modalidad: 'futbol11', categoria: 'benjamin', genero: 'femenina' },
  21: { modalidad: 'futbol11', categoria: 'veteranos', genero: 'masculina' },
  24: { modalidad: 'futbol11', categoria: 'aficionados', genero: 'masculina', nota: 'No Federado' },
  13: { modalidad: 'sala', categoria: 'aficionados', genero: 'masculina' },
  15: { modalidad: 'sala', categoria: 'juvenil', genero: 'masculina' },
  17: { modalidad: 'sala', categoria: 'cadete', genero: 'masculina' },
  18: { modalidad: 'sala', categoria: 'infantil', genero: 'masculina' },
  20: { modalidad: 'sala', categoria: 'alevin', genero: 'masculina' },
  16: { modalidad: 'sala', categoria: 'benjamin', genero: 'masculina' },
  14: { modalidad: 'sala', categoria: 'prebenjamin', genero: 'masculina' },
  46: { modalidad: 'sala', categoria: 'prebenjamin', genero: 'masculina', nota: 'Bebé' },
  12: { modalidad: 'sala', categoria: 'aficionados', genero: 'femenina' },
  49: { modalidad: 'sala', categoria: 'juvenil', genero: 'femenina' },
  27: { modalidad: 'sala', categoria: 'cadete', genero: 'femenina' },
  50: { modalidad: 'sala', categoria: 'infantil', genero: 'femenina' },
  48: { modalidad: 'sala', categoria: 'alevin', genero: 'femenina' },
  53: { modalidad: 'sala', categoria: 'benjamin', genero: 'femenina' },
  60: { modalidad: 'playa', categoria: 'cadete', genero: 'masculina' },
};
const FUERA = new Set([28, 29]);   // baloncesto
const DE_MENORES = new Set(['juvenil', 'cadete', 'infantil', 'alevin', 'benjamin', 'prebenjamin']);

/**
 * Todo el JSON que la página lleva en `onChangeTemporada(this,{…})`, no sólo lo que lee `meta()`.
 *
 * ── LA CLAVE PARA EMPAREJAR (medido el 26/10/2026) ─────────────────────────────────────────────────────────
 * `urlDataLoaderResultados` es la página de la FEDERACIÓN de la que LP carga esa competición:
 *   CyL 22615 → rfcylf.es …codtemporada=21&codcompeticion=22911132&codgrupo=22911133 (el grupo de nuestra cola);
 *   Valencia → resultadosffcv.isquad.es …id_competicion=…; Cataluña → fcf.cat/calendari/2526/…; RFEF → resultados.rfef.es.
 * Con eso el emparejado con la federación es EXACTO (por código), no por parecido de nombres. Sólo trae URL lo que LP
 * carga solo (temporadas recientes); lo viejo, no. `IDccaa = 0` y `nacional = 1` = competición nacional (RFEF).
 */
export function metaCompleta(html) {
  const m = /onChangeTemporada\(this,(\{[\s\S]*?\}),/.exec(html);
  if (!m) return null;
  let j;
  try { j = JSON.parse(decodificaEntidades(m[1])); } catch { return null; }
  const url = decodificaEntidades(String(j.urlDataLoaderResultados ?? '')).replace(/\\\//g, '/').trim() || null;
  return {
    id: j.ID ?? null, nombre: j.nombre ?? null, nombre_completo: j.nombreCompleto ?? null, temporada: j.temporada ?? null,
    id_ccaa: j.IDccaa ?? null, ccaa_grupo: j.ccaa ?? null, nacional: String(j.nacional ?? '') === '1' || String(j.IDccaa ?? '') === '0',
    organizador: j.organizador || null, linea: j.IDgrupo ?? null, grupo: j.grupo ?? null, id_division: j.IDdivision ?? null,
    division: j.division ?? null, id_categoria: j.IDcategoria ?? null, categoria: j.categoria ?? null, deporte: j.deporte ?? null,
    num_jornadas: j.numJornadas ?? null, estado: j.estado ?? null, url_federacion: url,
    carga_automatica: String(j.flagDataLoader ?? '') === '1', carga_actas: String(j.flagDataLoaderActas ?? '') === '1',
  };
}

/**
 * Qué competiciones piden sus FICHAS (L4 del plan). Se lee de `scripts/multideporte/lapreferente-fichas.json`
 * en cada calendario, así que se cambia sin tocar código ni reiniciar:
 *   { "ccaa": [9, 1, …] | "todas", "nacionales": true, "desde": "2010-11", "hasta": null,
 *     "por_ccaa": { "9": { "hasta": "2024-25" } },          ventana propia de una comunidad
 *     "en_curso": [15, 0],                                 comunidades (0 = nacionales) con fichas de la temporada en curso
 *     "primero": [9, 15, 1, 13, 0],                        las que van antes (prioridad 60-69; el resto, 70-79)
 *     "excluidas": [12345, …] }                            competiciones de LP que la federación ya cubre con actas
 *                                                          (lo escribe scripts/lapreferente/elige-fichas.mjs)
 * Sin fichero, ninguna ficha (sólo calendario).
 */
const RUTA_FICHAS = new URL('../lapreferente-fichas.json', import.meta.url);
let cacheFichas = { t: 0, cfg: null };
function leeFichas(ruta) {
  // Se relee como mucho cada minuto (un calendario puede encolar cientos de fichas).
  if (ruta === RUTA_FICHAS && Date.now() - cacheFichas.t < 60_000) return cacheFichas.cfg;
  let cfg = null;
  try { if (existsSync(ruta)) cfg = JSON.parse(readFileSync(ruta, 'utf8')); } catch { cfg = null; }
  if (cfg && Array.isArray(cfg.excluidas)) cfg._excluidas = new Set(cfg.excluidas.map(String));
  if (ruta === RUTA_FICHAS) cacheFichas = { t: Date.now(), cfg };
  return cfg;
}
const ccaaDe = (comp) => (comp.nacional ? '0' : String(comp.ccaa_lp ?? ''));
export function prioridadFichasDesdeFichero(ruta = RUTA_FICHAS) {
  return (comp) => {
    const cfg = leeFichas(ruta);
    if (!cfg) return false;
    const ccaa = ccaaDe(comp);
    const propia = cfg.por_ccaa?.[ccaa] ?? {};
    const desde = propia.desde ?? cfg.desde;
    const hasta = propia.hasta ?? cfg.hasta;
    if (desde && comp.temporada && comp.temporada < desde) return false;
    if (hasta && comp.temporada && comp.temporada > hasta) return false;
    if (cfg._excluidas?.has(String(comp.id))) return false;
    if (Array.isArray(cfg.en_curso) && comp.temporada && esTemporadaEnCurso(comp.temporada)
      && !cfg.en_curso.map(String).includes(ccaa)) return false;
    if (comp.nacional) return Boolean(cfg.nacionales);
    if (cfg.ccaa === 'todas') return ccaa !== '' && ccaa !== '0';
    return (cfg.ccaa ?? []).map(String).includes(ccaa);
  };
}
const esTemporadaEnCurso = (etiquetaT) => Number(String(etiquetaT).slice(0, 4)) * 10000 + Number(String(etiquetaT).slice(0, 4)) + 1 >= temporadaEnCurso();

/**
 * Fichas: después de todos los calendarios (60+). Las comunidades de `primero` van en 60-69 y el resto en 70-79; dentro
 * de cada tramo, de la temporada más reciente a la más vieja.
 */
export const prioridadFicha = (temporada, comp = null, ruta = RUTA_FICHAS) => {
  const anio = Number(/^(\d{4})/.exec(String(temporada ?? ''))?.[1] ?? 0);
  if (!anio) return 99;
  const cfg = comp ? leeFichas(ruta) : null;
  const tramo = cfg?.primero && !cfg.primero.map(String).includes(ccaaDe(comp)) ? 70 : 60;
  return tramo + Math.min(9, Math.max(0, new Date().getFullYear() - anio));
};
/** Etiquetas de grupo (optgroup) que delatan la comunidad de una página de semilla. Medido el 26/10/2026 (22365 = Cataluña). */
const ETIQUETAS_CCAA = [[9, /\bcatalan|\bcatalun/i], [13, /futgal|\bgallega/i], [1, /andaluc/i], [15, /\bmadrid|rffm/i],
  [11, /valencian|ffcv/i], [8, /castilla y le[oó]n|\bcyl\b/i], [3, /asturfutbol|asturian/i], [6, /c[aá]ntabra/i]];
export function ccaaDeEtiquetas(html) {
  const etiquetas = [...String(html).matchAll(/<optgroup[^>]*label="([^"]*)"/g)].map((x) => x[1]).join(' | ');
  for (const [ccaa, re] of ETIQUETAS_CCAA) if (re.test(etiquetas)) return ccaa;
  return null;
}
/** Comunidades cuyo HISTÓRICO de calendarios va antes que el del resto (`calendarios_primero` de lapreferente-fichas.json). */
export function ccaaPrimero(ruta = RUTA_FICHAS) {
  try { return new Set((JSON.parse(readFileSync(ruta, 'utf8')).calendarios_primero ?? []).map(String)); } catch { return new Set(); }
}
const compDeUrl = (url) => Number(/comp=(\d+)/.exec(url)?.[1] ?? /C(\d+)-\d+\//.exec(url)?.[1] ?? 0);
const numT = (e) => { const m = /^(\d{4})-(\d{2})$/.exec(String(e ?? '')); return m ? Number(m[1]) * 10000 + Number(m[1]) + 1 : Number(String(e ?? '').slice(0, 8)) || 0; };
const etiqueta = (t) => { const s = String(t ?? ''); return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(6, 8)}` : null; };

/**
 * opciones:
 *  · desde: primera temporada (AAAAAAAA) que se recorre; 20102011 por defecto (L2b). 19291930 para el histórico (L2c).
 *  · fichas: false por defecto (L1 = sólo calendario). Una función (contextoCompeticion) → boolean decide qué
 *    competiciones piden sus fichas (prioridades L3/L4 del plan).
 */
export function creaAdaptadorLaPreferenteFederado({ semillas = SEMILLAS, desde = 20102011, fichas = false } = {}) {
  const quiereFichas = typeof fichas === 'function' ? fichas : () => Boolean(fichas);
  const esPasada = (t) => { const n = Number(String(t ?? '').slice(0, 8)); return n > 0 && n < temporadaEnCurso(); };
  return {
    nombre: 'lapreferente-federado', deporte: 'futbol', codificacion: 'windows-1252',
    semillas: () => semillas.map((id) => ({ tipo: 'region', url: `${BASE}C${id}-1/x/widget.html`, prioridad: 5, contexto: { semilla: id } })),
    tipos: {
      region: {
        interpreta(html) {
          const m = meta(html);
          const temporada = m?.temporada ?? null;
          const enlaces = [];
          const vistos = new Set();
          const primero = ccaaPrimero();
          // La página de una semilla lista las nacionales y las de UNA comunidad, pero su meta dice IDccaa 0: la comunidad
          // se reconoce por las etiquetas de sus grupos («Primera Catalana»…).
          const ccaaPagina = ccaaDeEtiquetas(html);
          const sube = primero.has(String(ccaaPagina ?? '')) || primero.has(String(m?.id_ccaa ?? ''));
          for (const sel of html.matchAll(/<select[^>]*id="grupo(\d+)"[^>]*>([\s\S]*?)<\/select>/g)) {
            const cat = Number(sel[1]);
            if (FUERA.has(cat)) continue;
            for (const o of sel[2].matchAll(/<option[^>]*value="(C(\d+)-\d+\/[^"]*)"[^>]*>([^<]*)/g)) {
              const id = Number(o[2]);
              if (!id || vistos.has(id)) continue;
              vistos.add(id);
              enlaces.push({ tipo: 'calendario', url: `${BASE}index.php?comp=${id}&accion=calendario`, prioridad: !esPasada(temporada) ? 10 : sube ? 15 : 20,
                contexto: { competicion: id, nombre: limpia(decodificaEntidades(o[3])), categoria_lp: cat, ...(CATEGORIAS_LP[cat] ?? {}),
                  temporada: etiqueta(temporada), ccaa_lp: ccaaPagina ?? m?.id_ccaa ?? null } });
            }
          }
          for (const t of temporadas(html).filter((x) => x.temporada >= desde && String(x.temporada) !== String(temporada))) {
            enlaces.push({ tipo: 'region', url: t.url, prioridad: 6, contexto: { temporada: etiqueta(t.temporada) } });
          }
          return { enlaces, revisitarHoras: esPasada(temporada) ? 24 * 90 : 24 * 7 };
        },
      },
      calendario: {
        interpreta(html, { contexto = {}, url }) {
          const id = compDeUrl(url) || contexto.competicion;
          const m = meta(html);
          const mc = metaCompleta(html);
          const jornadas = calendario(html, id);
          if (!jornadas.length) return { sinPublicar: true };
          const temporada = etiqueta(m?.temporada) ?? contexto.temporada ?? null;
          const comp = { id, nombre: m?.nombre ?? contexto.nombre ?? null, temporada, categoria_lp: contexto.categoria_lp ?? null,
            categoria: contexto.categoria ?? null, modalidad: contexto.modalidad ?? null, genero: contexto.genero ?? null,
            division: m?.division ?? null, grupo: m?.grupo ?? null, ccaa_lp: m?.id_ccaa ?? contexto.ccaa_lp ?? null,
            nacional: mc?.nacional ?? false, organizador: mc?.organizador ?? null, linea: mc?.linea ?? null, ccaa_grupo: mc?.ccaa_grupo ?? null,
            url_federacion: mc?.url_federacion ?? null, carga_automatica: mc?.carga_automatica ?? false, nombre_completo: mc?.nombre_completo ?? null };
          const registros = [{ tipo: 'competicion', clave: String(id), datos: { ...comp, jornadas: jornadas.length } }];
          const enlaces = [];
          const fichasSi = quiereFichas(comp);
          let pendientes = 0;
          for (const j of jornadas) {
            for (const p of j.partidos) {
              const clave = p.partido_id ? `P${p.partido_id}` : `${id}|${j.jornada}|${p.local.id}|${p.visitante.id}`;
              registros.push({ tipo: 'partido', clave, datos: { competicion: id, temporada, jornada: j.jornada, fecha_jornada: j.fecha, descansa: j.descansa, ...p } });
              if (!p.jugado) pendientes += 1;
              if (fichasSi && p.jugado && p.ficha_disponible && p.ficha_url) {
                enlaces.push({ tipo: 'ficha', url: BASE + p.ficha_url, prioridad: prioridadFicha(temporada, comp), contexto: { competicion: id, temporada, jornada: j.jornada, clave, categoria: comp.categoria } });
              }
            }
          }
          // Pasada: una vez cada 90 días (por si LP completa algo). En curso: cada 2 días mientras queden partidos.
          return { registros, enlaces, revisitarHoras: esPasada(m?.temporada ?? numT(temporada)) ? 24 * 90 : (pendientes ? 48 : 24 * 7) };
        },
      },
      ficha: {
        interpreta(html, { contexto = {}, url = '' }) {
          const f = fichaPartido(html);
          if (!f.equipos.length) return { sinPublicar: true };
          return { registros: [{ tipo: 'ficha', clave: contexto.clave ?? (/P(\d+)C\d+\//.exec(url) ? `P${/P(\d+)C\d+\//.exec(url)[1]}` : url), datos: { ...f, competicion: contexto.competicion ?? null, temporada: contexto.temporada ?? null,
            jornada: contexto.jornada ?? null, menores: DE_MENORES.has(contexto.categoria) } }] };
        },
      },
    },
  };
}
// Por defecto: fichas según `lapreferente-fichas.json` (sin fichero, ninguna).
export default creaAdaptadorLaPreferenteFederado({ fichas: prioridadFichasDesdeFichero() });
