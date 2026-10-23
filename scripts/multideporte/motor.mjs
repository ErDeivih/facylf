/**
 * MOTOR COMÚN DE LOS RECOLECTORES MULTIDEPORTE (baloncesto, voleibol, balonmano, tenis, fútbol aficionado…).
 *
 * Idea: cada plataforma es un ADAPTADOR que sólo sabe dos cosas —qué páginas sembrar y cómo leer cada tipo
 * de página—; todo lo demás es común y está aquí, probado una vez:
 *
 *   · cola reanudable en SQLite (`paginas`), con prioridad, reintentos y re-visitas programadas;
 *   · ritmo respetuoso entre peticiones (por defecto 5-8 s al azar, como la flota de fútbol) y una sola
 *     petición a la vez por plataforma;
 *   · parada preventiva si el sitio empieza a responder 403/429/5xx seguidos (se anota y se vuelve en 1 h);
 *   · evidencia: cada página se guarda comprimida tal cual llegó, para poder reinterpretarla sin volver a pedirla;
 *   · registros genéricos (`registros`: partido, clasificación, equipo, competición…) con huella para saber si
 *     cambiaron, que luego importa el canónico cuando exista el modelo multideporte;
 *   · calendario sin publicar → espera creciente (la misma escalera que Cataluña: 48 h, 4 d, 8 d, 14 d).
 *
 * Contrato de un adaptador:
 *   { nombre, deporte, semillas(opciones) → [{tipo, url, prioridad?, contexto?}],
 *     tipos: { <tipo>: { interpreta(html, {url, contexto}) → { registros?, enlaces?, sinPublicar? },
 *                        revisitarHoras?: number } } }
 *   registros: [{ tipo, clave, datos }]  ·  enlaces: [{ tipo, url, prioridad?, contexto? }]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import { esperaSinPublicar } from '../lib/espera-publicacion.mjs';

export const AGENTE = 'FacylfBot/1.0 (proyecto personal; peticiones espaciadas)';
const ahoraIso = () => new Date().toISOString();

export function abreCola(ruta) {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec(`
    pragma journal_mode = wal; pragma synchronous = normal; pragma busy_timeout = 15000;
    create table if not exists paginas (
      clave text primary key, adaptador text not null, tipo text not null, url text not null,
      prioridad integer not null default 50, estado text not null default 'pendiente',
      intentos integer not null default 0, veces integer not null default 0,
      sin_publicar_seguidos integer not null default 0,
      siguiente_intento text, ultimo_error text, evidencia text, contexto text,
      creada_en text not null, actualizada_en text not null, ultima_hecha text);
    create index if not exists paginas_siguiente on paginas(adaptador, estado, prioridad, siguiente_intento);
    create table if not exists peticiones (
      id integer primary key, adaptador text, url text not null, iniciada_en text not null,
      ms integer, estado_http integer, resultado text, dia text);
    create index if not exists peticiones_dia on peticiones(adaptador, dia);
    create table if not exists registros (
      adaptador text not null, tipo text not null, clave text not null, datos text not null,
      huella text not null, url text, primera_vez text not null, actualizado_en text not null,
      cambios integer not null default 0, primary key (adaptador, tipo, clave));
    create table if not exists metadatos (clave text primary key, valor text);`);
  // Formularios (ASP.NET «postback»): la página se pide por POST con este cuerpo. Columna añadida el 01/10/2026.
  if (!db.prepare('pragma table_info(paginas)').all().some((c) => c.name === 'cuerpo')) db.exec('alter table paginas add column cuerpo text');
  return db;
}

/** `identidad` (opcional) sustituye a la huella del cuerpo: para formularios ASP.NET cuyo __VIEWSTATE cambia de
 *  una visita a otra aunque se pida lo mismo; así la misma página no se duplica en la cola. */
export const claveDePagina = (adaptador, tipo, url, cuerpo = null, identidad = null) =>
  `${adaptador}|${tipo}|${url}${identidad != null ? `|id:${identidad}`
    : cuerpo ? `|post:${createHash('sha1').update(cuerpo).digest('hex').slice(0, 16)}` : ''}`;

export function encola(db, adaptador, { tipo, url, prioridad = 50, contexto = null, cuerpo = null, identidad = null }) {
  const t = ahoraIso();
  db.prepare(`insert into paginas(clave, adaptador, tipo, url, prioridad, contexto, creada_en, actualizada_en, cuerpo)
    values (?,?,?,?,?,?,?,?,?)
    on conflict(clave) do update set prioridad = min(excluded.prioridad, paginas.prioridad),
      contexto = coalesce(excluded.contexto, paginas.contexto), cuerpo = coalesce(excluded.cuerpo, paginas.cuerpo)`)
    .run(claveDePagina(adaptador, tipo, url, cuerpo, identidad), adaptador, tipo, url, prioridad,
      contexto == null ? null : JSON.stringify(contexto), t, t, cuerpo);
}

export function siguiente(db, adaptador, ahora = ahoraIso()) {
  return db.prepare(`select * from paginas where adaptador=? and estado='pendiente'
    and (siguiente_intento is null or siguiente_intento <= ?) order by prioridad, creada_en limit 1`).get(adaptador, ahora);
}

export function guardaRegistro(db, adaptador, r, url) {
  const datos = JSON.stringify(r.datos);
  const huella = createHash('sha1').update(datos).digest('hex');
  const t = ahoraIso();
  db.prepare(`insert into registros(adaptador, tipo, clave, datos, huella, url, primera_vez, actualizado_en)
    values (?,?,?,?,?,?,?,?)
    on conflict(adaptador, tipo, clave) do update set
      cambios = registros.cambios + (registros.huella <> excluded.huella),
      datos = excluded.datos, huella = excluded.huella, url = excluded.url,
      actualizado_en = case when registros.huella <> excluded.huella then excluded.actualizado_en else registros.actualizado_en end`)
    .run(adaptador, r.tipo, String(r.clave), datos, huella, url, t, t);
}

export function pausa(db, adaptador) {
  const v = db.prepare('select valor from metadatos where clave=?').get(`pausa|${adaptador}`)?.valor;
  return v && new Date(v) > new Date() ? v : null;
}

/** Texto de la respuesta: UTF-8 salvo que el adaptador declare otra codificación (p. ej. La Preferente, ISO-8859-1). */
export const textoDe = (adaptador, bruto) => (adaptador.codificacion ? new TextDecoder(adaptador.codificacion).decode(bruto) : bruto.toString('utf8'));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** DNI/NIE y correos fuera de cualquier texto que se guarde como evidencia (en JSON, valor a valor). */
const RE_DNI = /\b[XYZ]?\d{7,8}[A-HJ-NP-TV-Z]\b/g;
// Longitudes acotadas (RFC: 64 antes de la @, 63 por etiqueta): sin cotas, un texto largo sin espacios (p. ej.
// una respuesta en base64 de 1 MB) hacía la búsqueda cuadrática y colgaba el recolector media hora (01/10/2026).
const RE_CORREO = /[\w.%+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){0,6}\.[a-z]{2,24}/gi;
const limpiaTexto = (t) => {
  const s = t.replace(RE_DNI, '[dni retirado]');
  return s.includes('@') ? s.replace(RE_CORREO, '[correo retirado]') : s;
};
export function retiraIdentificadores(texto) {
  const t = String(texto);
  if (/^\s*[[{]/.test(t)) {
    try {
      const recorre = (o) => typeof o === 'string' ? limpiaTexto(o) : Array.isArray(o) ? o.map(recorre)
        : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, recorre(v)])) : o;
      return JSON.stringify(recorre(JSON.parse(t)));
    } catch { /* no era JSON válido: se trata como texto */ }
  }
  return limpiaTexto(t);
}

/** Petición real (Node 22 trae fetch). Devuelve { estado, tipo, bruto }. */
export async function pedirHttp(url, { cuerpo = null, cabeceras = null } = {}) {
  const r = await fetch(url, {
    method: cuerpo ? 'POST' : 'GET', body: cuerpo ?? undefined,
    headers: { 'user-agent': AGENTE, accept: 'text/html,application/json,*/*',
      // Formularios de ASP.NET o APIs JSON (MyGol, Playooz…): se distingue por el primer carácter.
      ...(cuerpo ? { 'content-type': /^\s*[[{]/.test(cuerpo) ? 'application/json' : 'application/x-www-form-urlencoded' } : {}),
      // Cabeceras propias del adaptador (p. ej. Playooz identifica la liga por X-Tenant-Host, como hace su web).
      ...(cabeceras ?? {}) },
    redirect: 'follow', signal: AbortSignal.timeout(45_000) });
  return { estado: r.status, tipo: r.headers.get('content-type'), bruto: Buffer.from(await r.arrayBuffer()) };
}

/**
 * Una sesión: hasta `max` páginas, con el ritmo indicado. Devuelve el recuento.
 * `pedir` y `esperar` se inyectan en las pruebas.
 */
/**
 * Una sesión: hasta `max` páginas de la cola.
 *
 * ── CARRILES (02/10/2026) ─────────────────────────────────────────────────────────────────────────────────
 * Un adaptador puede cubrir muchos sitios distintos (ServerSports: una liga por dominio; Gesdeportiva: una
 * federación por dominio). Con un solo carril, el histórico de ServerSports eran semanas. Con `carriles: N`
 * (en el adaptador) se piden hasta N páginas a la vez, pero **nunca dos al mismo sitio**, y cada sitio y cada
 * carril siguen esperando min-max segundos entre una petición y la siguiente: ningún sitio recibe más que
 * antes. Un carril (lo de siempre) se comporta exactamente igual que la versión anterior.
 */
export async function ejecutaSesion({ db, adaptador, max = 200, minSeg = 5, maxSeg = 8, dirEvidencias = null,
  pedir = pedirHttp, esperar = dormir, log = console.log, carriles = adaptador.carriles ?? 1 }) {
  const cuenta = { hechas: 0, fallidas: 0, descartadas: 0, sinPublicar: 0, registros: 0, enlaces: 0, parada: null };
  const p = pausa(db, adaptador.nombre);
  if (p) { cuenta.parada = `en pausa hasta ${p}`; return cuenta; }
  const malasPorSitio = new Map();
  const ocupados = new Set();          // sitios con una petición en marcha (o esperando su turno) ahora mismo
  const proximoPorSitio = new Map();   // sitio → instante (ms) a partir del cual se le puede volver a pedir
  const sitioDe = (u) => { try { return new URL(u).host; } catch { return ''; } };
  const hueco = () => (minSeg + Math.random() * (maxSeg - minSeg)) * 1000;
  let restantes = max;
  let terminado = false;

  /** La primera página de la cola cuyo sitio esté libre (y, si puede ser, ya en su turno). */
  const elige = () => {
    const filas = db.prepare(`select * from paginas where adaptador=? and estado='pendiente'
      and (siguiente_intento is null or siguiente_intento <= ?) order by prioridad, creada_en limit ?`)
      .all(adaptador.nombre, ahoraIso(), carriles > 1 ? 400 : 1);
    if (!filas.length) return null;
    let mejor = null;
    for (const f of filas) {
      const s = sitioDe(f.url);
      if (ocupados.has(s)) continue;
      const listo = proximoPorSitio.get(s) ?? 0;
      if (listo <= Date.now()) return { pag: f, sitio: s };
      if (!mejor || listo < mejor.listo) mejor = { pag: f, sitio: s, listo };
    }
    return mejor ?? { ocupado: true };
  };

  async function procesa(pag, sitio) {
    const lector = adaptador.tipos[pag.tipo];
    if (!lector) { marca(db, pag.clave, 'descartada', `tipo desconocido: ${pag.tipo}`); return; }
    const inicio = Date.now();
    let r;
    try { r = await pedir(pag.url, { cuerpo: pag.cuerpo, cabeceras: adaptador.cabeceras?.(pag) ?? null }); } catch (e) { r = { estado: 0, error: String(e?.message ?? e) }; }
    db.prepare(`insert into peticiones(adaptador, url, iniciada_en, ms, estado_http, resultado, dia) values (?,?,?,?,?,?,?)`)
      .run(adaptador.nombre, pag.url, new Date(inicio).toISOString(), Date.now() - inicio, r.estado,
        r.error ? 'error' : String(r.estado), new Date(inicio).toISOString().slice(0, 10));

    if (r.estado === 404 || r.estado === 410) { marca(db, pag.clave, 'descartada', `HTTP ${r.estado}`); cuenta.descartadas += 1; return; }
    /*
     * Respuestas malas: se cuentan POR SITIO. Un adaptador puede cubrir decenas de dominios (ServerSports: una
     * liga por dominio) y uno caído no debe parar a los demás: tres seguidas del mismo sitio aplazan una hora
     * sólo sus páginas. Si el adaptador tiene un único sitio, es lo mismo que parar la plataforma.
     */
    if (!r.estado || r.estado === 403 || r.estado === 429 || r.estado >= 500) {
      malasPorSitio.set(sitio, (malasPorSitio.get(sitio) ?? 0) + 1);
      reintenta(db, pag, `HTTP ${r.estado || r.error}`);
      cuenta.fallidas += 1;
      if (malasPorSitio.get(sitio) >= 3) {
        const hasta = new Date(Date.now() + 3_600_000).toISOString();
        const aplazadas = db.prepare(`update paginas set siguiente_intento=? where adaptador=? and estado='pendiente'
          and (url like ? or url like ?) and (siguiente_intento is null or siguiente_intento < ?)`)
          .run(hasta, adaptador.nombre, `http://${sitio}/%`, `https://${sitio}/%`, hasta).changes;
        malasPorSitio.set(sitio, 0);
        cuenta.sitiosAplazados = [...(cuenta.sitiosAplazados ?? []), sitio];
        log(`  ⛔ ${sitio}: tres respuestas malas seguidas (${r.estado || r.error}); ${aplazadas} páginas suyas esperan hasta ${hasta}`);
      }
      return;
    }
    malasPorSitio.set(sitio, 0);

    let evidencia = null;
    if (dirEvidencias) {
      // Las páginas por POST (p. ej. cada temporada de ServerSports) comparten URL: se nombran por su clave.
      const h = createHash('sha1').update(pag.cuerpo ? pag.clave : pag.url).digest('hex');
      evidencia = join(pag.tipo, h.slice(0, 2), `${h}.gz`);
      mkdirSync(join(dirEvidencias, dirname(evidencia)), { recursive: true });
      // Ni DNI ni correos en la evidencia (no hacen falta para nada y alguna API los publica, ver sondeo del 01/10).
      const esTexto = !/pdf|octet|image|zip/i.test(r.tipo ?? '');
      const guardar = esTexto ? Buffer.from(retiraIdentificadores(textoDe(adaptador, r.bruto))) : r.bruto;
      writeFileSync(join(dirEvidencias, evidencia), gzipSync(guardar));
    }
    try {
      const contexto = pag.contexto ? JSON.parse(pag.contexto) : null;
      // `bruto` (los bytes tal cual) para los lectores de binarios, p. ej. las actas PDF de balonmano.
      const res = lector.interpreta(textoDe(adaptador, r.bruto), { url: pag.url, contexto, tipoContenido: r.tipo, bruto: r.bruto }) ?? {};
      db.exec('begin');
      for (const reg of res.registros ?? []) { guardaRegistro(db, adaptador.nombre, reg, pag.url); cuenta.registros += 1; }
      for (const e of res.enlaces ?? []) { encola(db, adaptador.nombre, e); cuenta.enlaces += 1; }
      if (res.sinPublicar) {
        const racha = pag.sin_publicar_seguidos + 1;
        const espera = esperaSinPublicar({ racha, esTemporadaActual: false, anioInicio: null, nombreCompeticion: null });
        db.prepare(`update paginas set estado='pendiente', sin_publicar_seguidos=?, siguiente_intento=?, evidencia=?,
          ultimo_error='sin publicar', actualizada_en=? where clave=?`).run(racha, espera.hasta.toISOString(), evidencia, ahoraIso(), pag.clave);
        cuenta.sinPublicar += 1;
      } else {
        // El adaptador puede decidirlo página a página (p. ej. sólo la temporada en curso y con partidos abiertos).
        const rev = res.revisitarHoras !== undefined ? res.revisitarHoras : lector.revisitarHoras;
        db.prepare(`update paginas set estado=?, siguiente_intento=?, evidencia=?, ultimo_error=null, veces=veces+1,
          sin_publicar_seguidos=0, ultima_hecha=?, actualizada_en=? where clave=?`)
          .run(rev ? 'pendiente' : 'hecha', rev ? new Date(Date.now() + rev * 3_600_000).toISOString() : null,
            evidencia, ahoraIso(), ahoraIso(), pag.clave);
        cuenta.hechas += 1;
      }
      db.exec('commit');
    } catch (e) {
      try { db.exec('rollback'); } catch {}
      reintenta(db, pag, `lectura: ${e?.message ?? e}`);
      cuenta.fallidas += 1;
    }
  }

  async function carril() {
    let ultima = 0;
    while (!terminado && restantes > 0) {
      const e = elige();
      if (!e) {
        if (!ocupados.size) { cuenta.parada = 'sin trabajo'; terminado = true; break; }
        await dormir(500); continue;            // otro carril aún puede encolar enlaces nuevos
      }
      if (e.ocupado) { await dormir(500); continue; } // todo lo disponible es de sitios en uso
      restantes -= 1;
      ocupados.add(e.sitio);
      try {
        // Turno del carril (como siempre) y turno del sitio (para que dos carriles no se lo pisen).
        const espera = Math.max(ultima ? ultima + hueco() - Date.now() : 0, (proximoPorSitio.get(e.sitio) ?? 0) - Date.now());
        if (espera > 0) await esperar(espera);
        ultima = Date.now();
        await procesa(e.pag, e.sitio);
      } finally {
        proximoPorSitio.set(e.sitio, Date.now() + hueco());
        ocupados.delete(e.sitio);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, carriles) }, () => carril()));
  return cuenta;
}

function marca(db, clave, estado, error) {
  db.prepare('update paginas set estado=?, ultimo_error=?, actualizada_en=?, intentos=intentos+1 where clave=?')
    .run(estado, error, ahoraIso(), clave);
}

/** 1.º fallo: 1 h · 2.º: 6 h · 3.º: 24 h · luego se da por fallida (queda para revisar, no se borra). */
function reintenta(db, pag, error) {
  const n = pag.intentos + 1;
  if (n >= 4) { marca(db, pag.clave, 'fallida', error); return; }
  const horas = [1, 6, 24][n - 1];
  db.prepare(`update paginas set intentos=?, ultimo_error=?, siguiente_intento=?, actualizada_en=? where clave=?`)
    .run(n, error, new Date(Date.now() + horas * 3_600_000).toISOString(), ahoraIso(), pag.clave);
}

export function resumen(db, adaptador) {
  const porEstado = db.prepare(`select tipo, estado, count(*) n from paginas where adaptador=? group by 1,2 order by 1,2`).all(adaptador);
  const registros = db.prepare(`select tipo, count(*) n from registros where adaptador=? group by 1 order by 1`).all(adaptador);
  const hoy = db.prepare(`select count(*) n from peticiones where adaptador=? and dia=?`).get(adaptador, ahoraIso().slice(0, 10)).n;
  const errores = {};
  for (const f of db.prepare(`select url, ultimo_error from paginas where adaptador=? and ultimo_error is not null`).all(adaptador)) {
    const clave = `${new URL(f.url).host} · ${String(f.ultimo_error).slice(0, 60)}`;
    errores[clave] = (errores[clave] ?? 0) + 1;
  }
  return { porEstado, registros, peticionesHoy: hoy, pausa: pausa(db, adaptador), errores };
}
