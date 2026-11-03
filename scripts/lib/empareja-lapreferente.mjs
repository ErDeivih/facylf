/**
 * Emparejar un grupo de La Preferente con el grupo de la federación (o reconocer que no existe).
 *
 * Escrito por Claude el 25/10/2026 (`docs/plataforma-web/LA-PREFERENTE-PLAN-2026-10-25.md` §4). Sin dependencias.
 *
 * ── POR QUÉ NO BASTA EL NOMBRE ─────────────────────────────────────────────────────────────────────────────
 * La Preferente abrevia y quita la forma jurídica («San José de Soria», «Intern. Vista Alegre», «Cultural
 * Cebrereña») y la federación la pone y añade patrocinadores («C.D. San José», «C.D. Internacional Vista Alegre»,
 * «C. y D. Cebrereña», «C.F. Briviesca Morato Group»). Así que:
 *   1. los EQUIPOS se emparejan por parecido de palabras (con prefijos: «intern» = «internacional»), uno a uno;
 *   2. el GRUPO sólo se da por emparejado si, con esos equipos, los MARCADORES coinciden (≥ 90 % por defecto).
 *      Es la prueba fuerte: dos grupos distintos no comparten 200 resultados.
 * Lo que no pase queda «sin emparejar» y NO se mezcla: se queda como dato de La Preferente.
 */

const VACIAS = new Set(['cd', 'cf', 'ud', 'sd', 'ad', 'cp', 'cdf', 'ef', 'fc', 'sad', 'club', 'deportivo', 'deportiva', 'futbol', 'de',
  'del', 'la', 'el', 'los', 'las', 'y', 'c', 'd', 'u', 's', 'a', 'f', 'cyd', 'agrupacion', 'sociedad', 'asociacion', 'escuela', 'cultural']);

/** Palabras significativas de un nombre de equipo (sin tildes, sin forma jurídica). */
export function palabras(nombre) {
  return String(nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/["'`´«»]/g, ' ')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .split(' ')
    .filter((p) => p && !VACIAS.has(p));
}

const iguales = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

/**
 * Parecido 0-1 entre dos nombres: palabras comunes sobre las del nombre más corto.
 * Equipos filiales: «B», «C» o «Promesas» tienen que coincidir (si uno lo lleva y el otro no, baja a la mitad).
 */
export function parecido(a, b) {
  const pa = palabras(a);
  const pb = palabras(b);
  if (!pa.length || !pb.length) return 0;
  const usadas = new Set();
  let comunes = 0;
  for (const x of pa) {
    const j = pb.findIndex((y, k) => !usadas.has(k) && iguales(x, y));
    if (j >= 0) { usadas.add(j); comunes += 1; }
  }
  let s = comunes / Math.min(pa.length, pb.length);
  const filial = (n) => /(^|\s)["']?(b|c|d)["']?$|promesas|filial/i.test(String(n).trim());
  if (filial(a) !== filial(b)) s *= 0.5;
  return s;
}

/** Emparejamiento uno a uno, del par más parecido al menos parecido. */
export function emparejaEquipos(nombresLp, nombresFed, { minimo = 0.5 } = {}) {
  const pares = [];
  for (const a of nombresLp) for (const b of nombresFed) pares.push([parecido(a, b), a, b]);
  pares.sort((x, y) => y[0] - x[0]);
  const lp = new Map();
  const usadosFed = new Set();
  for (const [s, a, b] of pares) {
    if (s < minimo || lp.has(a) || usadosFed.has(b)) continue;
    lp.set(a, { federacion: b, parecido: Number(s.toFixed(2)) });
    usadosFed.add(b);
  }
  return lp;
}

/**
 * ¿Es el mismo grupo? partidos: [{ local, visitante, gl, gv }] con nombres de cada fuente.
 * Devuelve { emparejado, equipos, coinciden, comparables, diferentes: [...] }.
 */
export function emparejaGrupo(lp, fed, { umbral = 0.9 } = {}) {
  const eqLp = [...new Set(lp.flatMap((p) => [p.local, p.visitante]))];
  const eqFed = [...new Set(fed.flatMap((p) => [p.local, p.visitante]))];
  const mapa = emparejaEquipos(eqLp, eqFed);
  const clave = (l, v) => `${l}|${v}`;
  // Un mismo local|visitante puede repetirse (grupos cortos a tres o cuatro vueltas): se emparejan por orden de jornada.
  const porJornada = (a, b) => (a.jornada ?? 0) - (b.jornada ?? 0);
  const deFed = new Map();
  for (const p of [...fed].sort(porJornada)) {
    const k = clave(p.local, p.visitante);
    if (!deFed.has(k)) deFed.set(k, []);
    deFed.get(k).push(p);
  }
  const usados = new Map();
  let comparables = 0;
  let coinciden = 0;
  const diferentes = [];
  for (const p of [...lp].sort(porJornada)) {
    const l = mapa.get(p.local)?.federacion;
    const v = mapa.get(p.visitante)?.federacion;
    const k = l && v ? clave(l, v) : null;
    const n = k ? usados.get(k) ?? 0 : 0;
    if (k) usados.set(k, n + 1);
    if (p.gl == null || p.gv == null) continue;
    const q = k ? deFed.get(k)?.[n] ?? null : null;
    if (!q || q.gl == null) continue;
    comparables += 1;
    if (q.gl === p.gl && q.gv === p.gv) coinciden += 1;
    else diferentes.push({ local: l, visitante: v, lp: [p.gl, p.gv], federacion: [q.gl, q.gv] });
  }
  const cobertura = mapa.size / Math.max(eqLp.length, eqFed.length, 1);
  const parte = comparables ? coinciden / comparables : 0;
  return {
    emparejado: cobertura >= 0.9 && comparables >= Math.min(10, lp.length) && parte >= umbral,
    equipos: Object.fromEntries(mapa), cobertura: Number(cobertura.toFixed(2)),
    comparables, coinciden, parte: Number(parte.toFixed(3)), diferentes,
  };
}
