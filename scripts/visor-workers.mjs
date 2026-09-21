#!/usr/bin/env node
/**
 * Visor local de los workers de recolección. Sirve en 127.0.0.1 (solo local) un panel que
 * muestra al momento el estado de cada federación (trabajos, actas, bloqueados, última petición)
 * y permite ejecutar acciones: arrancar, parar, pausar/reanudar y ver el log.
 *
 * Seguridad: se enlaza a 127.0.0.1 y sólo acepta nombres de federación del registro; las acciones
 * son comandos fijos (sin shell arbitrario). NO expongas este puerto a la red.
 *
 * Uso: node scripts/visor-workers.mjs  → http://127.0.0.1:3777/
 */
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, appendFileSync, mkdirSync, openSync, statfsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import os from 'node:os';

const RAIZ = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.VISOR_PORT || 3777);

/* Registro de incidencias: si algo falla, el visor NO debe morir ni quedarse mudo. */
const LOG_VISOR = join(RAIZ, 'visor.log');
const anota = (mensaje) => {
  try { appendFileSync(LOG_VISOR, `${new Date().toISOString()}  ${mensaje}\n`); } catch { /* sin log */ }
};
process.on('uncaughtException', (e) => anota(`EXCEPCION NO CAPTURADA: ${e?.stack ?? e}`));
process.on('unhandledRejection', (e) => anota(`PROMESA RECHAZADA: ${e?.stack ?? e}`));

/* ---------- Registro de territoriales (inventario de las 19) ---------- */
const NOMBRES_CORTOS = {
  'castilla-leon': 'Castilla y León', galicia: 'Galicia', asturias: 'Asturias', cantabria: 'Cantabria',
  aragon: 'Aragón', rioja: 'La Rioja', extremadura: 'Extremadura', navarra: 'Navarra', euskadi: 'Euskadi',
  'castilla-la-mancha': 'Castilla-La Mancha', andalucia: 'Andalucía', murcia: 'Región de Murcia',
  canarias: 'Canarias', ceuta: 'Ceuta', madrid: 'Madrid', valencia: 'Comunidad Valenciana',
  cataluna: 'Cataluña', baleares: 'Baleares', melilla: 'Melilla',
};

const CARPETA_SONDEO = join(RAIZ, 'descargas-federacion-sondeo');

/** Motivo verificado (2026-09-10) de por qué una territorial no se puede automatizar. */
const NOTAS_ESTADO = {
  baleares: 'Adaptador PNFG verificado: 13 temporadas y miles de competiciones descubiertas. Continúa el catálogo antes de jornadas y actas.',
  canarias: 'Adaptador PNFG activo. El conjunto publicado empieza en 2021-22 y las actas dudosas quedan en revisión.',
  cataluna: 'Captura en marcha: descubrimiento de temporadas, disciplinas, competiciones y grupos, y bajada de calendario, clasificación y actas por grupo. Prioridad por categoría (sénior catalana antes que base); una competición aparece en la web cuando termina TODAS sus actas.',
  melilla: 'Descubrimiento reintentable: conserva el inventario y vuelve a comprobar de forma espaciada las páginas que actualmente responden HTTP 500.',
};
const INVENTARIO = JSON.parse(readFileSync(join(RAIZ, 'config', 'federaciones-espana.json'), 'utf8').replace(/^\uFEFF/, ''));
const PERFILES = new Map();
for (const f of readdirSync(join(RAIZ, 'perfiles')).filter((x) => x.endsWith('.json'))) {
  const p = JSON.parse(readFileSync(join(RAIZ, 'perfiles', f), 'utf8').replace(/^\uFEFF/, ''));
  PERFILES.set(p.nombre, { ...p, archivo: join(RAIZ, 'perfiles', f) });
}

const REGISTRO = INVENTARIO.fuentes.map((f) => {
  const codigo = f.codigo;
  const base = {
    nombre: codigo, codigo,
    etiqueta: NOMBRES_CORTOS[codigo] ?? codigo,
    adaptador: f.adaptador, portal: f.portal, estadoInventario: f.estado,
  };
  // Cualquier variante de pnfg vale: el inventario usa nombres como `pnfg`, `pnfg-ffib`… y todas
  // comparten recolector. Exigir el nombre exacto dejaba a Baleares fuera: ingería desde su cola
  // pero el visor la mostraba como si no tuviera recolector.
  if (String(f.adaptador ?? '').startsWith('pnfg')) {
    const perfil = PERFILES.get(codigo);
    const carpeta = perfil?.carpeta ?? (codigo === 'castilla-leon' ? 'descargas-federacion' : `descargas-${codigo}`);
    return {
      ...base, tipo: 'cola', perfil: perfil?.archivo ?? null,
      carpeta: join(RAIZ, carpeta, 'recolector-local'),
      tarea: codigo === 'castilla-leon' ? 'FACyLF recolector' : `FACyLF recolector ${codigo}`,
      // Condición PowerShell que identifica los procesos de ESTA federación. Cada federación tiene
      // su propio filtro porque comparten el mismo fichero de recolector: sin él, parar una
      // federación cortaría la de Castilla y León, que es la única sin --perfil.
      proceso: codigo === 'castilla-leon'
        ? "($_.CommandLine -like '*recolector-local.mjs*') -and ($_.CommandLine -notlike '*--perfil*')"
        : `($_.CommandLine -like '*recolector-local.mjs*') -and ($_.CommandLine -like '*${codigo}.json*')`,
    };
  }
  if (f.adaptador === 'personalizado-isquad') {
    // iSquad se descubría sólo como catálogo, pero Valencia ya tiene además una cola real de datos
    // (API JSON, sin navegador). Si esa base existe, se muestra como una cola más: lo que interesa
    // ahora es cuántos trabajos quedan, no cuántas competiciones hay en el catálogo.
    const carpeta = join(RAIZ, `descargas-${codigo}`, 'recolector-local');
    const tieneCola = existsSync(join(carpeta, 'cola-v2.sqlite'));
    if (tieneCola) {
      return {
        ...base, tipo: 'cola', carpeta,
        tarea: `FACyLF recolector ${codigo}`,
        archivoSondeo: join(CARPETA_SONDEO, `${codigo}-isquad-sondeo.json`),
        proceso: `($_.CommandLine -like '*recolector-${codigo}.mjs*')`,
      };
    }
    return {
      ...base, tipo: 'catalogo', tarea: `FACyLF catalogo ${codigo}`,
      archivoSondeo: join(CARPETA_SONDEO, `${codigo}-isquad-sondeo.json`),
      proceso: `($_.CommandLine -like '*sondeo-isquad*') -and ($_.CommandLine -like '*${codigo}*')`,
    };
  }
  const archivoSondeo = join(CARPETA_SONDEO, `${codigo}-sondeo.json`);
  // Cataluña, Baleares y Melilla tienen tarea programada de sondeo de portal (o propia) aunque su
  // adaptador sea un inventario: así el visor puede arrancarlas y pararlas como las demás.
  const TAREAS_PORTAL = {
    cataluna: { tarea: 'FACyLF catalogo cataluna', proceso: "($_.CommandLine -like '*sondeo-portal*') -and ($_.CommandLine -like '*cataluna*')" },
    baleares: { tarea: 'FACyLF catalogo baleares', proceso: "($_.CommandLine -like '*sondeo-portal*') -and ($_.CommandLine -like '*baleares*')" },
    melilla: { tarea: 'FACyLF catalogo melilla', proceso: "($_.CommandLine -like '*sondeo-melilla*')" },
  };
  const extra = TAREAS_PORTAL[codigo] ?? { tarea: null, proceso: null };
  // Cataluña ya tiene cola propia en el esquema común: `recolector-cataluna-datos.mjs` vuelca ahí el
  // catálogo del selector de la FCF (mismos trabajos, grupos y actas que las demás federaciones).
  // Mientras exista esa base se muestra como una cola más, para ver cuánto queda y no cuántas
  // competiciones hay en el catálogo.
  if (codigo === 'cataluna' && existsSync(join(RAIZ, 'descargas-cataluna', 'recolector-local', 'cola-v2.sqlite'))) {
    return {
      ...base, tipo: 'cola',
      carpeta: join(RAIZ, 'descargas-cataluna', 'recolector-local'),
      // La tarea que se muestra es la del recolector (supervisor en bucle), no la del
      // descubrimiento: es la que está trabajando de forma continua. El filtro de procesos abarca
      // las dos, así que parar Cataluña desde el visor detiene también el descubrimiento.
      tarea: 'FACyLF recolector cataluna',
      proceso: "($_.CommandLine -like '*recolector-cataluna*')",
      archivoSondeo: existsSync(archivoSondeo) ? archivoSondeo : null,
    };
  }
  return {
    ...base, tipo: 'estado', tarea: extra.tarea, proceso: extra.proceso,
    archivoSondeo: existsSync(archivoSondeo) ? archivoSondeo : null,
  };
});
const porNombre = new Map(REGISTRO.map((f) => [f.nombre, f]));

/** Resumen de un fichero de sondeo (iSquad, pnfg o documental), sin abrir ninguna base.
 *  Se cachea unos segundos para no abrir el fichero constantemente: si el visor lo tuviera
 *  abierto justo al guardar el sondeo, en Windows el rename atómico fallaría con EPERM. */
const _cacheSondeo = new Map();
function estadoSondeo(archivo) {
  if (!archivo || !existsSync(archivo)) return { sinSondeo: true };
  const cacheado = _cacheSondeo.get(archivo);
  if (cacheado && Date.now() - cacheado.t < 8000) return cacheado.valor;
  try {
    const d = JSON.parse(readFileSync(archivo, 'utf8').replace(/^\uFEFF/, ''));
    const actualizado = d.actualizado_en ?? d.generadoEn ?? null;
    let valor;
    if (d.resumen) valor = { sinSondeo: false, ...d.resumen, actualizado };
    else if (Array.isArray(d.temporadas)) {
      const comps = d.temporadas.flatMap((t) => t.competiciones ?? []);
      valor = {
        sinSondeo: false, temporadas: d.temporadas.length, competiciones: comps.length,
        grupos: comps.reduce((n, c) => n + (c.grupos?.length ?? 0), 0), actualizado,
      };
    } else if (Array.isArray(d.paginas)) {
      valor = {
        sinSondeo: false, plataforma: d.plataforma ?? null,
        paginas: d.paginasDescubiertas ?? d.paginas.length,
        documentos: d.paginas.reduce((n, p) => n + (p.documentos?.length ?? 0), 0), actualizado,
      };
    } else valor = { sinSondeo: false, actualizado };
    _cacheSondeo.set(archivo, { t: Date.now(), valor });
    return valor;
  } catch (e) {
    return { sinSondeo: false, error: e.message };
  }
}

/* ---------- Estado de una base ---------- */
/**
 * Caché con refresco en segundo plano ("stale-while-revalidate").
 *
 * Por qué no basta una caché corta: recalcular las 15 colas cuesta unos 7 s con el equipo
 * cargado, y si el refresco del navegador cae justo al caducar la caché, el visor parece caído
 * aunque esté vivo. Con esto la respuesta es siempre inmediata a partir de lo último calculado y
 * el recálculo ocurre por detrás, sin hacer esperar a nadie.
 */
const _cacheEstado = new Map();
// El índice trabajos_contexto permite recorrer las dieciséis bases con holgura. Quince segundos
// mantiene la fotografía muy próxima a las bases sin recalcular en cada refresco de dos segundos.
// Logs, estado de procesos y botones conservan su actualización rápida independiente.
const TTL_ESTADO_MS = 60_000;
const _colaCalculo = [];
const MAX_CALCULOS_SIMULTANEOS = 3;
let _calculosActivos = 0;

/**
 * Tira la fotografía cacheada de una federación, lanza su recálculo y espera a tenerla fresca.
 *
 *  Por qué hace falta: la caché dura 60 s, así que al pulsar «pausar», «reanudar», «parar» o
 *  «arrancar» el panel seguía enseñando el estado anterior hasta un minuto entero. Parecía que el
 *  botón no hacía nada (comprobado el 14/09/2026: se pausó Canarias y el visor siguió diciendo
 *  «sin pausa» durante 60 s, aunque el metadato ya estaba escrito en la base). La espera es corta y
 *  acotada: si el cálculo no llega a tiempo, se responde igual y el panel se corrige en el
 *  siguiente refresco de dos segundos.
 */
async function invalidaEstado(r) {
  if (!r || r.tipo !== 'cola') return;
  const dbPath = join(r.carpeta, 'cola-v2.sqlite');
  const cacheado = _cacheEstado.get(dbPath);
  if (!cacheado) return;
  cacheado.t = 0;
  if (!cacheado.calculando) {
    cacheado.calculando = true;
    agendaCalculo(dbPath);
  }
  const limite = Date.now() + 2500;
  while (Date.now() < limite) {
    await new Promise((seguir) => setTimeout(seguir, 100));
    const actual = _cacheEstado.get(dbPath);
    if (actual && actual.t > 0 && !actual.calculando) return;
  }
}

function procesaColaCalculos() {
  while (_calculosActivos < MAX_CALCULOS_SIMULTANEOS && _colaCalculo.length > 0) {
    const ruta = _colaCalculo.shift();
    _calculosActivos++;
    // Cada cálculo vive en un proceso auxiliar. DatabaseSync puede tardar varios segundos en una
    // base grande; sacarlo del proceso HTTP mantiene fluidos el panel, los logs y los botones.
    const hijo = spawn(process.execPath, [join(RAIZ, 'scripts', 'visor-workers.mjs'), '--estado-db', ruta],
      { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] });
    let salida = '';
    hijo.stdout?.on('data', (d) => (salida += d));
    const limite = setTimeout(() => hijo.kill(), 60_000);
    const termina = () => {
      _calculosActivos = Math.max(0, _calculosActivos - 1);
      setTimeout(procesaColaCalculos, 25);
    };
    hijo.on('exit', () => {
      clearTimeout(limite);
      try {
        const valor = JSON.parse(salida);
        valor.metricasActualizadasEn = new Date().toISOString();
        _cacheEstado.set(ruta, { t: Date.now(), valor, calculando: false, enCola: false });
      } catch (e) {
        // Una escritura larga de SQLite no debe borrar la última fotografía válida ni dejar la
        // tarjeta con error durante un minuto entero. Se conserva el dato anterior y se vuelve a
        // intentar dentro de cinco segundos.
        const anterior = _cacheEstado.get(ruta)?.valor;
        _cacheEstado.set(ruta, { t: Date.now() - TTL_ESTADO_MS + 5_000,
          valor: anterior && !anterior.error ? anterior : { cargando: true },
          calculando: false, enCola: false });
        anota(`no se pudo calcular el estado de ${ruta}: ${e?.message ?? e}`);
      }
      termina();
    });
    hijo.on('error', (e) => {
      clearTimeout(limite);
      _cacheEstado.set(ruta, { t: Date.now(), valor: { error: e.message }, calculando: false, enCola: false });
      termina();
    });
  }
}

function agendaCalculo(dbPath) {
  const entrada = _cacheEstado.get(dbPath);
  if (entrada?.enCola) return;
  if (entrada) entrada.enCola = true;
  _colaCalculo.push(dbPath);
  setTimeout(procesaColaCalculos, 0);
}

function estadoDeBD(dbPath) {
  if (!existsSync(dbPath)) return { sinBase: true };
  const ahora = Date.now();
  const cacheado = _cacheEstado.get(dbPath);
  if (cacheado) {
    // Se devuelve lo cacheado al instante y, si ya toca, se recalcula en segundo plano.
    if (ahora - cacheado.t >= TTL_ESTADO_MS && !cacheado.calculando) {
      cacheado.calculando = true;
      agendaCalculo(dbPath);
    }
    return cacheado.valor;
  }
  // La primera apertura no debe dejar el panel en blanco mientras se consultan quince bases que
  // además están siendo escritas. Se responde de inmediato y se precalcula cada tarjeta por detrás.
  const inicial = { t: 0, valor: { cargando: true }, calculando: true };
  _cacheEstado.set(dbPath, inicial);
  agendaCalculo(dbPath);
  return inicial.valor;
}

function calculaEstado(dbPath) {
  let db;
  try { db = new DatabaseSync(dbPath, { readOnly: true }); } catch (e) { return { error: e.message }; }
  try {
  // Una reparación local puede mantener una escritura larga. El visor no debe
  // quedarse esperando: muestra temporalmente el error y vuelve a probar a los 2 s.
  db.exec('pragma busy_timeout=1000');
  const r = (s, ...a) => db.prepare(s).get(...a);
  // UNA sola pasada sobre trabajos para todo (antes eran dos consultas completas y cada una
  // cuesta varios segundos cuando el equipo está cargado).
  const ahoraIso = new Date().toISOString();
  const trabajos = r(`SELECT count(*) total,
    coalesce(sum(estado='hecho'),0) hecho,
    -- «Pendiente» es lo que se va a hacer: el trabajo de temporadas fuera de la ventana de recolección
    -- (anterior a 2023-24) está aplazado a propósito y no debe contarse como cola viva.
    coalesce(sum(estado in ('pendiente','en_curso','bloqueado') and (siguiente_intento is null or siguiente_intento < '2090')),0) pend,
    coalesce(sum(estado='pendiente' and siguiente_intento >= '2090'),0) apartados,
    coalesce(sum(estado='en_curso'),0) enCurso,
    coalesce(sum(estado='bloqueado'),0) bloqueados,
    coalesce(sum(estado='cancelado'),0) cancelados,
    coalesce(sum(tipo='grupos' and estado='hecho'),0) gruposHecho,
    coalesce(sum(tipo='grupos' and estado in ('pendiente','en_curso')),0) gruposPend,
    coalesce(sum(tipo='indice_jornadas' and estado='hecho'),0) indiceHecho,
    coalesce(sum(tipo='indice_jornadas' and estado in ('pendiente','en_curso')),0) indicesPend,
    coalesce(sum(tipo IN ('catalogo_temporada','grupos','indice_jornadas','calendario','clasificacion')),0) f1Total,
    coalesce(sum(tipo IN ('catalogo_temporada','grupos','indice_jornadas','calendario','clasificacion') AND estado='hecho'),0) f1Hecho,
    coalesce(sum(tipo IN ('catalogo_temporada','grupos','indice_jornadas','calendario','clasificacion') AND estado='cancelado'),0) f1Cancelados,
    coalesce(sum(tipo IN ('jornada','acta')),0) f2Total,
    coalesce(sum(tipo IN ('jornada','acta') AND estado='hecho'),0) f2Hecho,
    coalesce(sum(tipo IN ('jornada','acta') AND estado='cancelado'),0) f2Cancelados,
    coalesce(sum(estado='pendiente' AND siguiente_intento IS NOT NULL AND siguiente_intento > ? AND siguiente_intento < '2090'),0) aplazados,
    coalesce(sum(estado='pendiente' AND siguiente_intento >= '2090'),0) apartados
    FROM trabajos`, ahoraIso);
  const { total, hecho, pend, enCurso, bloqueados, cancelados, gruposHecho, gruposPend,
    indiceHecho, indicesPend } = trabajos;
  // Una temporada está resuelta cuando no le queda trabajo vivo: lo 'cancelado' se descartó con
  // motivo (p. ej. una dirección sin contenido tras tres intentos) y no debe dejar la barra a medias.
  // OJO: cada fase descuenta SÓLO sus propios cancelados. Antes se restaba el total de cancelados a
  // las dos fases, así que las actas descartadas de la fase 2 (Euskadi tenía 856) se descontaban
  // también del descubrimiento de la fase 1 (3.447 trabajos): la barra de estructura salía al 100 %
  // cuando en realidad iba por el 84 %, y el número de «trabajos» que se veía no era el real.
  const fases = {
    total: trabajos.f1Total - trabajos.f1Cancelados, hecho: trabajos.f1Hecho,
    datosTotal: trabajos.f2Total - trabajos.f2Cancelados, datosHecho: trabajos.f2Hecho,
  };
  const pctDescubrimiento = fases.total > 0 ? Math.min(100, Math.round((fases.hecho / fases.total) * 100)) : 0;
  const pctDatos = fases.datosTotal > 0 ? Math.min(100, Math.round((fases.datosHecho / fases.datosTotal) * 100)) : 0;
  // Trabajos aplazados a futuro: ya vienen calculados en la consulta única de arriba (aplazados).
  const aplazados = trabajos.aplazados;
  const jornadasHechas = r("SELECT COUNT(*) n FROM jornadas WHERE archivo IS NOT NULL").n;
  const jornadasEsperadas = r("SELECT COALESCE(SUM(jornadas),0) n FROM grupos WHERE jornadas IS NOT NULL").n;
  const jornadasDescubiertas = r("SELECT COUNT(*) n FROM jornadas").n;
  const actas = r(`SELECT coalesce(sum(estado='hecha'),0) actasHechas,
    coalesce(sum(estado='pendiente'),0) actasPend,
    -- Fichas que la federación publica vacías (sin alineaciones ni cuerpo técnico): no son «hechas»
    -- ni quedan pendientes, así que se cuentan aparte para que la tarjeta no las esconda.
    coalesce(sum(estado='sin_datos'),0) actasSinDatos,
    coalesce(sum(estado='hecha' and calidad='correcta'),0) actasCorrectas,
    coalesce(sum(estado='hecha' and calidad='revisar'),0) actasRevisar FROM actas`);
  const { actasHechas, actasPend, actasSinDatos, actasCorrectas, actasRevisar } = actas;
  const ult = db.prepare("SELECT id, iniciada_en FROM peticiones ORDER BY id DESC LIMIT 1").get();
  // Progreso por temporada: cuántas van completas y cuántas quedan (el recolector trabaja por
  // prioridad, no estrictamente año a año, así que esto es el avance real de cada temporada).
  const porTemporada = db.prepare(`SELECT temporada t, COUNT(*) total,
    COALESCE(SUM(estado='hecho'),0) hecho,
    COALESCE(SUM(estado='cancelado'),0) cancelados,
    COALESCE(SUM(estado IN ('pendiente','en_curso','bloqueado') AND (siguiente_intento IS NULL OR siguiente_intento < '2090')),0) pend,
    COALESCE(SUM(estado='pendiente' AND siguiente_intento >= '2090'),0) apartados
    FROM trabajos WHERE temporada IS NOT NULL GROUP BY temporada
    ORDER BY CAST(temporada AS INTEGER) ASC`).all().map((x) => ({
      ...x,
      etiqueta: `${2004 + Number(x.t)}/${String(2005 + Number(x.t)).slice(-2)}`,
      pct: x.total > x.cancelados
        ? Math.min(100, Math.round((x.hecho / (x.total - x.cancelados)) * 100)) : 0,
    }));
  const temporadasCompletas = porTemporada.filter((t) => t.total > 0 && t.pend === 0 && t.apartados === 0).length;
  const temporadasEnCurso = porTemporada.filter((t) => t.pend > 0 && t.hecho > 0).length;
  const temporadasApartadas = porTemporada.filter((t) => t.total > 0 && t.pend === 0 && t.apartados > 0).length;
  const temporadasPendientes = porTemporada.filter((t) => t.hecho === 0 && t.pend > 0).length;
  const temporadaActual = porTemporada.length ? porTemporada[porTemporada.length - 1] : null;
  const pausaHasta = db.prepare("SELECT valor FROM metadatos WHERE clave='pausa_global_hasta'").get()?.valor;
  const pausado = !!(pausaHasta && new Date(pausaHasta).getTime() > Date.now());
  // El motivo importa tanto como el hecho: sin él, una federación parada parece averiada cuando en
  // realidad puede estar esperando respetuosamente porque su web dejó de responder.
  const pausaMotivo = pausado
    ? (db.prepare("SELECT valor FROM metadatos WHERE clave='pausa_global_motivo'").get()?.valor ?? null)
    : null;
  // Métricas de ritmo, errores, progreso y ETA (estas dos últimas para saber cuánto queda).
  const pet = r(`SELECT count(*) total,
    coalesce(sum(resultado in ('error','error_navegador')),0) errores,
    coalesce(sum(resultado='bloqueo'),0) bloqueos FROM peticiones`);
  const ritmo = (min) => r("SELECT count(*) n FROM peticiones WHERE iniciada_en >= ?", new Date(Date.now() - min * 60000).toISOString()).n / min;
  const ritmo5 = +ritmo(5).toFixed(1);
  const ritmo10 = +ritmo(10).toFixed(1);
  const ritmo15 = +ritmo(15).toFixed(1);
  const ultimas = db.prepare("SELECT iniciada_en FROM peticiones ORDER BY id DESC LIMIT 30").all();
  let segPorPeticion = null;
  if (ultimas.length >= 5) {
    const dif = (new Date(ultimas[0].iniciada_en).getTime() -
      new Date(ultimas[ultimas.length - 1].iniciada_en).getTime()) / (ultimas.length - 1) / 1000;
    if (dif > 0.5 && dif < 600) segPorPeticion = +dif.toFixed(1);
  }
  // Bloqueo: sólo cuando la web nos ha frenado de verdad (petición marcada 'bloqueo' o pausa
  // global por barrera). Un timeout de renderer NO cuenta como bloqueo.
  const ultBloqueo = db.prepare("SELECT detalle FROM peticiones WHERE resultado='bloqueo' ORDER BY id DESC LIMIT 1").get()?.detalle
    ?? db.prepare("SELECT detalle FROM eventos WHERE tipo='pausa_global' ORDER BY id DESC LIMIT 1").get()?.detalle ?? null;
  const pct = (a, b) => (a + b) > 0 ? Math.round((a / (a + b)) * 100) : 0;
  const progreso = pct(hecho, pend);
  const pctEstructura = pct(gruposHecho + indiceHecho, gruposPend + indicesPend);
  // Jornadas: denominador REAL (suma de las jornadas previstas de los grupos cuyo índice ya se leyó).
  const pctJornadas = jornadasEsperadas > 0 ? Math.round((jornadasHechas / jornadasEsperadas) * 100) : 0;
  // Estimación de actas POR ESTRUCTURA: partidos por jornada de cada grupo (según las jornadas ya
  // bajadas) × sus jornadas previstas. Mucho más fino que un ratio global entre categorías.
  const hayPartidos = !!r("SELECT 1 x FROM sqlite_master WHERE type='table' AND name='partidos'");
  const estructura = hayPartidos ? r(`WITH g AS (
      SELECT gr.jornadas jor,
        (SELECT COUNT(*) FROM jornadas j WHERE j.temporada=gr.temporada AND j.competicion=gr.competicion
          AND j.grupo=gr.codigo AND j.archivo IS NOT NULL) baj,
        (SELECT COUNT(*) FROM partidos p WHERE p.temporada=gr.temporada AND p.competicion=gr.competicion
          AND p.grupo=gr.codigo) par
      FROM grupos gr WHERE gr.jornadas IS NOT NULL)
    SELECT COALESCE(SUM(jor),0) esperadas, COALESCE(SUM(baj),0) bajadas, COALESCE(SUM(par),0) partidos,
      COALESCE(SUM(CASE WHEN baj>0 THEN jor*(par*1.0/baj) ELSE 0 END),0) estConDatos,
      COALESCE(SUM(CASE WHEN baj=0 THEN jor ELSE 0 END),0) jorSinDatos FROM g`)
    : { esperadas: 0, bajadas: 0, partidos: 0, estConDatos: 0, jorSinDatos: 0 };
  const partidosPorJornada = estructura.bajadas > 0 ? estructura.partidos / estructura.bajadas : 0;
  const gruposTotales = r("SELECT COUNT(*) n FROM grupos WHERE estado!='ausente_web'").n;
  const gruposConIndice = r("SELECT COUNT(*) n FROM grupos WHERE jornadas IS NOT NULL").n;
  const jornadasPorGrupo = gruposConIndice > 0 ? estructura.esperadas / gruposConIndice : 0;
  // Extrapola a los grupos cuyo índice aún no se ha leído con la media de jornadas/grupo.
  const jornadasEstimadasTotal = Math.round(estructura.esperadas +
    Math.max(0, gruposTotales - gruposConIndice) * jornadasPorGrupo);
  // Sólo se estima si hay base suficiente: con pocos índices leídos, extrapolar multiplica
  // cualquier error del catálogo (y hay catálogos sospechosos, p. ej. Galicia con 14.238 grupos).
  const pctIndicesLeidos = gruposTotales > 0 ? Math.round((gruposConIndice / gruposTotales) * 100) : 0;
  const nTemporadas = r("SELECT COUNT(*) n FROM temporadas").n || 1;
  const gruposPorTemporada = Math.round(gruposTotales / nTemporadas);
  // Muchas más agrupaciones por temporada de lo razonable apunta a que el descubrimiento capturó
  // filtros (delegación/provincia) como si fueran grupos. Se mantiene como AVISO, no como bloqueo:
  // desactivar la estimación sólo por el tamaño del catálogo castigaba federaciones grandes pero
  // correctas (Valencia tiene 736 grupos por temporada de verdad, entre fútbol, fútbol sala,
  // femenino, base y playa). Lo que de verdad hace fiable una estimación es que las medias salgan
  // de índices realmente leídos, y eso ya lo exige `pctIndicesLeidos`.
  const catalogoSospechoso = gruposPorTemporada > 1200;
  const baseSuficiente = pctIndicesLeidos >= 10 &&
    partidosPorJornada > 0 && jornadasEstimadasTotal > 0;
  const actasEstimadas = baseSuficiente ? Math.round(jornadasEstimadasTotal * partidosPorJornada) : null;
  // Parte de las actas "que faltan" son de jornadas AÚN NO JUGADAS (aplazadas a su fecha):
  // sin jugarse no existen sus actas. Se separa lo jugable de lo futuro.
  // Jornadas con fecha futura, en SQL (en JS era demasiado lento: leía todas las fechas en cada
  // consulta del visor). Soporta YYYY-MM-DD y DD-MM-YYYY.
  const hoyIso = new Date().toISOString().slice(0, 10);
  const jornadasFuturas = r(`SELECT COUNT(*) n FROM jornadas WHERE fecha IS NOT NULL AND (
      (fecha LIKE '____-__-__%' AND substr(fecha,1,10) > ?)
      OR (fecha LIKE '__-__-____' AND substr(fecha,7,4)||'-'||substr(fecha,4,2)||'-'||substr(fecha,1,2) > ?)
    )`, hoyIso, hoyIso).n;
  const actasFuturas = Math.round(jornadasFuturas * partidosPorJornada);
  const actasJugables = actasEstimadas != null ? Math.max(0, actasEstimadas - actasFuturas) : null;
  const pctActasJugables = actasJugables ? Math.min(100, Math.round((actasHechas / actasJugables) * 100)) : null;
  const actasConocidas = estructura.partidos;
  // Sin ningún índice de jornadas leído todavía no existe denominador: "de las actas que conozco,
  // cuántas he procesado" daría 100 % en una federación recién empezada, que es justo lo contrario
  // de lo que hay que comunicar. En ese caso se muestra «—» y se explica por qué.
  const pctActas = gruposConIndice === 0
    ? null
    : actasEstimadas
      ? Math.min(100, Math.round((actasHechas / actasEstimadas) * 100))
      : pct(actasHechas, actasPend);
  const etaSegundos = segPorPeticion ? Math.round(pend * segPorPeticion) : null;
  const tasaError = pet.total > 0 ? +((pet.errores / pet.total) * 100).toFixed(2) : 0;
  db.close();
  return {
    sinBase: false, total, hecho, pend, enCurso, bloqueados, cancelados, gruposHecho, gruposPend,
    indiceHecho, indicesPend, jornadasHechas, jornadasEsperadas, jornadasDescubiertas,
    actasHechas, actasPend, actasSinDatos, actasDescubiertas: actasHechas + actasPend + actasSinDatos,
    actasEstimadas, actasConocidas, actasCorrectas, actasRevisar,
    jornadasEstimadasTotal, partidosPorJornada: +partidosPorJornada.toFixed(1),
    jornadasPorGrupo: +jornadasPorGrupo.toFixed(1),
    gruposTotales, gruposConIndice, pctIndicesLeidos, gruposPorTemporada, catalogoSospechoso, baseSuficiente,
    porTemporada, temporadasCompletas, temporadasEnCurso, temporadasPendientes, temporadasApartadas, temporadaActual,
    fasesDescubrimiento: { total: fases.total, hecho: fases.hecho, pct: pctDescubrimiento },
    fasesDatos: { total: fases.datosTotal, hecho: fases.datosHecho, pct: pctDatos },
    aplazados, apartados: trabajos.apartados,
    jornadasFuturas, actasFuturas, actasJugables, pctActasJugables,
    ultimaEdad: ult ? Math.round((Date.now() - new Date(ult.iniciada_en).getTime()) / 1000) : null,
    pausado, pausaHasta: pausado ? pausaHasta : null, pausaMotivo,
    peticionesTotales: pet.total, errores: pet.errores, bloqueos: pet.bloqueos, tasaError,
    ritmo5, ritmo10, ritmo15, segPorPeticion, progreso, pctEstructura, pctJornadas, pctActas, etaSegundos,
    ultimoBloqueo: pausado && ultBloqueo ? String(ultBloqueo).slice(0, 80) : null,
  };
  } catch (e) {
    try { db.close(); } catch { /* cierre best-effort */ }
    return { error: e.message };
  }
}

/* ---------- Log (últimas líneas) ---------- */
function rutaLog(f) {
  if (f.tipo === 'cola') return join(f.carpeta, 'worker-programado.log');
  if (f.tipo === 'catalogo') return join(CARPETA_SONDEO, `${f.nombre}-isquad.log`);
  return join(CARPETA_SONDEO, `${f.nombre}-portal.log`);
}

function ultimasLineas(ruta, n = 40) {
  if (!existsSync(ruta)) return { sinLog: true };
  const texto = readFileSync(ruta, 'utf8');
  const lineas = texto.split(/\r?\n/).filter(Boolean);
  return { lineas: lineas.slice(-n) };
}

/* ---------- Ejecutar un comando PowerShell (para tareas/parar) ---------- */
function ps(comando) {
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', comando], { stdio: 'ignore' });
    p.on('exit', (c) => resolve(c ?? 0));
    p.on('error', () => resolve(-1));
  });
}

let _cacheTareas = { t: 0, valor: [], calculando: false };
function refrescaTareas() {
  if (_cacheTareas.calculando) return;
  _cacheTareas.calculando = true;
  // best-effort; si falla (p. ej. sin permisos o no hay tareas), se omite.
  // Con caché: lanzar PowerShell en cada refresco costaba ~3 s por petición.
  // Se piden también la última y la próxima ejecución. Para una tarea que corre una vez al día,
  // «Ready» sólo significa «no está corriendo ahora», que es su estado normal y no dice nada de si
  // funciona: una tarea de catálogo que hizo su trabajo esta mañana parece averiada. Con estos dos
  // datos se puede escribir «última: hoy 12:46 · próxima: mañana 06:45».
  const p = spawn('powershell.exe', ['-NoProfile', '-Command',
    'Get-ScheduledTask | Where-Object TaskName -like "FACyLF*" | ForEach-Object { $i = $_ | Get-ScheduledTaskInfo; [pscustomobject]@{ TaskName = $_.TaskName; State = $_.State.ToString(); LastRun = $i.LastRunTime.ToString("yyyy-MM-dd HH:mm"); NextRun = $i.NextRunTime.ToString("yyyy-MM-dd HH:mm"); Result = $i.LastTaskResult } } | ConvertTo-Json -Compress'], { stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  p.stdout?.on('data', (d) => (out += d));
  p.on('exit', () => {
    let valor = _cacheTareas.valor;
    try { const j = JSON.parse(out); valor = Array.isArray(j) ? j : [j]; } catch { /* conserva el último estado válido */ }
    _cacheTareas = { t: Date.now(), valor, calculando: false };
  });
  p.on('error', () => { _cacheTareas.calculando = false; });
}
async function estadoTareas() {
  if (Date.now() - _cacheTareas.t >= 10000) refrescaTareas();
  return _cacheTareas.valor;
}

/* ---------- Acciones ---------- */
async function accion(fed, tipo) {
  const r = porNombre.get(fed);
  if (!r) return { ok: false, error: 'territorial desconocida' };
  if (!r.tarea) return { ok: false, error: 'esta territorial no tiene tarea automática' };

  if (tipo === 'pausar' || tipo === 'reanudar') {
    if (r.tipo !== 'cola') return { ok: false, error: 'la pausa solo aplica a los recolectores con cola' };
    await escribeMetadato(r, 'pausa_global_hasta', tipo === 'pausar' ? new Date(Date.now() + 86400000).toISOString() : '');
    await escribeMetadato(r, 'pausa_global_motivo', tipo === 'pausar' ? 'pausado desde visor' : '');
    return { ok: true };
  }
  if (tipo === 'arrancar') {
    // Limpia la pausa (si la hubiera) y habilita+arranca la tarea: un solo botón reanuda del todo.
    if (r.tipo === 'cola') {
      await escribeMetadato(r, 'pausa_global_hasta', '');
      await escribeMetadato(r, 'pausa_global_motivo', '');
    }
    const code = await ps(`Enable-ScheduledTask -TaskName '${r.tarea}' -ErrorAction SilentlyContinue; Start-ScheduledTask -TaskName '${r.tarea}'`);
    return { ok: code === 0, code };
  }
  if (tipo === 'parar') {
    // Se cortan SOLO los procesos de esta federación. El filtro es por federación y no por fichero
    // de script porque varias comparten el mismo: sin él, parar una cortaría las demás.
    const filtro = r.proceso ? `-and ${r.proceso}` : "-and 1 -eq 0";
    const code = await ps(`Stop-ScheduledTask -TaskName '${r.tarea}' -ErrorAction SilentlyContinue; Disable-ScheduledTask -TaskName '${r.tarea}' -ErrorAction SilentlyContinue; Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^node(\\.exe)?$' -and ${filtro} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`);
    return { ok: code === 0, code };
  }
  return { ok: false, error: 'acción desconocida' };
}

function escribeMetadato(r, clave, valor) {
  const db = new DatabaseSync(join(r.carpeta, 'cola-v2.sqlite'));
  try {
    db.prepare(`insert into metadatos(clave,valor) values(?,?) on conflict(clave) do update set valor=excluded.valor`).run(clave, String(valor));
    return Promise.resolve(true);
  } catch (e) {
    return Promise.reject(e);
  } finally {
    db.close();
  }
}

/* ---------- App web (Next) ---------- */
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3000';

async function estadoApp() {
  // La portada hace consultas agregadas y, con todos los recolectores trabajando, puede tardar
  // más de 2,5 s aunque Next esté perfectamente levantado. Para el semáforo sólo necesitamos
  // comprobar que el servidor escucha; abrir una conexión TCP es inmediato y no recalcula la web.
  const destino = new URL(APP_URL);
  const activa = await new Promise((resolveEstado) => {
    const socket = connect({ host: destino.hostname, port: Number(destino.port || 80) });
    const fin = (valor) => { socket.destroy(); resolveEstado(valor); };
    socket.setTimeout(1200, () => fin(false));
    socket.once('connect', () => fin(true));
    socket.once('error', () => fin(false));
  });
  return { activa, url: APP_URL };
}

async function arrancarApp() {
  if ((await estadoApp()).activa) return { ok: true, yaActiva: true, url: APP_URL };
  // La salida de la web se guarda en un fichero: se arrancaba con `stdio: 'ignore'` y, cuando el
  // servidor se cayó dos veces el 12/09/2026, no había ninguna forma de saber por qué.
  const registro = join(RAIZ, '.estado-workers', 'web-app.log');
  mkdirSync(dirname(registro), { recursive: true });
  const salida = openSync(registro, 'a');
  const p = spawn('cmd.exe', ['/c', 'pnpm', 'dev'], { cwd: RAIZ, detached: true, stdio: ['ignore', salida, salida] });
  p.unref();
  return { ok: true, url: APP_URL };
}

async function pararApp() {
  const code = await ps("Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }");
  return { ok: code === 0, code };
}

/* ---------- Sistema (RAM / procesos / disco) ---------- */
function psOut(comando) {
  return new Promise((res) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', comando], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout?.on('data', (d) => (out += d));
    p.on('exit', () => res(out));
    p.on('error', () => res(''));
  });
}

/** Espacio libre en el disco donde viven las descargas.
 *
 *  Se vigila a propósito: la CPU y la RAM se notan cuando van mal, pero el disco se llena en
 *  silencio y entonces la recolección empieza a fallar sin decir por qué. Medido el 12/09/2026, cada
 *  acta archivada ocupa ~91 KB de media y cada jornada ~114 KB, y el trabajo que queda son millones
 *  de ficheros: es el recurso que antes se puede agotar. */
function espacioDisco() {
  try {
    const e = statfsSync(RAIZ);
    const libre = (Number(e.bavail) * Number(e.bsize)) / 1073741824;
    const total = (Number(e.blocks) * Number(e.bsize)) / 1073741824;
    return { discoLibreGB: +libre.toFixed(1), discoTotalGB: +total.toFixed(1) };
  } catch {
    return {};
  }
}

let _sisCache = { t: 0, data: {} };
async function sistema() {
  const ramLibreGB = +(os.freemem() / 1073741824).toFixed(1);
  const ramTotalGB = +(os.totalmem() / 1073741824).toFixed(1);
  if (Date.now() - _sisCache.t > 10000) {
    const out = await psOut("$c=Get-Process chrome -ErrorAction SilentlyContinue; $n=Get-Process node -ErrorAction SilentlyContinue; \"$($c.Count)|$([math]::Round(($c|Measure-Object WorkingSet64 -Sum).Sum/1GB,2))|$($n.Count)|$([math]::Round(($n|Measure-Object WorkingSet64 -Sum).Sum/1GB,2))\"");
    const p = String(out).trim().split('|');
    _sisCache = { t: Date.now(), data: { chromeProc: Number(p[0]) || 0, chromeGB: Number(p[1]) || 0, nodeProc: Number(p[2]) || 0, nodeGB: Number(p[3]) || 0 } };
  }
  return { ramLibreGB, ramTotalGB, ...espacioDisco(), ..._sisCache.data };
}

// Modo auxiliar usado por el propio visor para que las consultas SQLite pesadas no bloqueen el
// servidor HTTP. No abre puertos ni ejecuta acciones: imprime un único JSON y termina.
if (process.argv[2] === '--estado-db') {
  process.stdout.write(JSON.stringify(calculaEstado(resolve(process.argv[3] ?? ''))));
  process.exit(0);
}

/* ---------- API ---------- */
const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const ruta = url.pathname;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (ruta === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(PAGINA);
      return;
    }
    if (ruta === '/api/estado' && req.method === 'GET') {
      const tareas = await estadoTareas();
      const mapaTarea = new Map(tareas.map((t) => [t.TaskName, t]));
      const datos = REGISTRO.map((f) => {
        const t = f.tarea ? mapaTarea.get(f.tarea) : null;
        // "1999" es la fecha que pone Windows a una tarea que aún no se ha ejecutado nunca.
        const ultima = t?.LastRun && !String(t.LastRun).startsWith('1999') ? t.LastRun : null;
        const comun = {
          nombre: f.nombre, etiqueta: f.etiqueta, codigo: f.codigo, tipo: f.tipo,
          adaptador: f.adaptador, estadoInventario: f.estadoInventario, portal: f.portal,
          nota: NOTAS_ESTADO[f.nombre] ?? null,
          tarea: f.tarea, tareaEstado: t?.State ?? null,
          tareaUltima: ultima, tareaProxima: t?.NextRun ?? null, tareaResultado: t?.Result ?? null,
        };
        if (f.tipo === 'cola') {
          return { ...comun, ...estadoDeBD(join(f.carpeta, 'cola-v2.sqlite')) };
        }
        return { ...comun, ...estadoSondeo(f.archivoSondeo) };
      });
      res.end(JSON.stringify(datos));
      return;
    }
    const mLog = ruta.match(/^\/api\/estado\/([^/]+)\/log$/);
    if (mLog && req.method === 'GET') {
      const f = porNombre.get(mLog[1]);
      if (!f) { res.statusCode = 404; res.end(JSON.stringify({ error: 'no existe' })); return; }
      res.end(JSON.stringify(ultimasLineas(rutaLog(f))));
      return;
    }
    if (ruta === '/api/app/estado' && req.method === 'GET') { res.end(JSON.stringify(await estadoApp())); return; }
    if (ruta === '/api/app/arrancar' && req.method === 'POST') { res.end(JSON.stringify(await arrancarApp())); return; }
    if (ruta === '/api/app/parar' && req.method === 'POST') { res.end(JSON.stringify(await pararApp())); return; }
    if (ruta === '/api/sistema' && req.method === 'GET') { res.end(JSON.stringify(await sistema())); return; }
    const mAccion = ruta.match(/^\/api\/([^/]+)\/(arrancar|parar|pausar|reanudar)$/);
    if (mAccion && req.method === 'POST') {
      const r = await accion(mAccion[1], mAccion[2]);
      // La acción acaba de cambiar la base (o la tarea): se refresca esa federación antes de
      // contestar, para que el panel lo enseñe de inmediato y no hasta un minuto después.
      await invalidaEstado(porNombre.get(mAccion[1]));
      res.end(JSON.stringify(r));
      return;
    }
    res.statusCode = 404; res.end(JSON.stringify({ error: 'ruta desconocida' }));
  } catch (e) {
    anota(`ERROR en ${req.method} ${ruta}: ${e?.stack ?? e}`);
    if (!res.headersSent) {
      res.statusCode = 500;
      try { res.end(JSON.stringify({ error: e.message })); } catch { /* conexion cortada */ }
    } else {
      try { res.end(); } catch { /* conexion cortada */ }
    }
  }
});

servidor.on('clientError', (e, socket) => {
  // Un cliente local que cierra la conexion a mitad (recarga del navegador, sondeo de
  // salud) no es una incidencia del visor: se ignora para que el registro siga siendo util.
  const texto = String(e?.message ?? e);
  if (!/ECONNRESET|EPIPE|aborted/i.test(texto)) anota(`clientError: ${texto}`);
  try { socket.destroy(); } catch { /* ya cerrado */ }
});

servidor.listen(PORT, '127.0.0.1', () => {
  console.log(`Visor de workers en  http://127.0.0.1:${PORT}/`);
  anota(`visor iniciado en http://127.0.0.1:${PORT}/ (pid ${process.pid})`);
});

/* ---------- Página (dashboard) ---------- */
const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Workers · Estado</title>
<style>
 *{box-sizing:border-box}
 body{font-family:system-ui,Segoe UI,Roboto,sans-serif;background:radial-gradient(circle at 15% 0,#172554 0,#0f172a 32%,#090f1d 100%);color:#e2e8f0;margin:0;padding:20px;min-height:100vh}
 h1{font-size:24px;margin:0}.cabecera{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:0 0 14px}.subtitulo{font-size:12px;color:#94a3b8;margin:4px 0 0}
 .panel-superior{background:rgba(15,23,42,.88);border:1px solid #334155;border-radius:14px;padding:12px;margin-bottom:14px;backdrop-filter:blur(8px)}
 .barra{display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap}.barra:last-child{margin-bottom:0}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}
 .tarjeta{background:rgba(30,41,59,.92);border:1px solid #334155;border-radius:14px;padding:14px;box-shadow:0 10px 28px rgba(0,0,0,.18)}
 .tarjeta.prioritaria{border-color:#2563eb;box-shadow:0 0 0 1px rgba(37,99,235,.2),0 10px 28px rgba(0,0,0,.18)}
 .tarjeta.oculta{display:none}
 .tarjeta h2{font-size:16px;margin:0 0 6px;display:flex;justify-content:space-between}
 .chip{font-size:11px;padding:2px 8px;border-radius:999px;background:#334155}
 .run{background:#16a34a} .ready{background:#ca8a04} .off{background:#7f1d1d}
 .cuando{font-size:10px;color:#64748b;margin-left:8px;white-space:nowrap;flex:0 0 auto}
 .cuando.aviso{color:#f87171;font-weight:600}
 .datos{font-size:12px;color:#cbd5e1;line-height:1.6}
 .nums{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
 .num{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:6px 8px;text-align:center;font-size:11px}
 .num b{display:block;font-size:15px;color:#fff}
 .barra-p{display:flex;align-items:center;gap:6px;margin:3px 0;font-size:11px}
 .barra-p .etq{width:132px;color:#94a3b8}
 .barra-p .pista{flex:1;height:8px;background:#0f172a;border:1px solid #334155;border-radius:999px;overflow:hidden}
 .barra-p .relleno{display:block;height:100%}
 .barra-p .pct{width:34px;text-align:right;color:#cbd5e1}
 .temporadas{display:flex;gap:2px;flex-wrap:wrap;margin:4px 0}
 .tblock{flex:1 1 auto;min-width:32px;text-align:center;font-size:9px;color:#fff;border-radius:3px;padding:2px 1px}
 .ayuda{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#cbd5e1}
 .ayuda summary{cursor:pointer;font-weight:600;color:#e2e8f0}
 .ayuda dt{font-weight:600;color:#fff;margin-top:6px}
 .ayuda dd{margin:0 0 2px 0;color:#a7b0ba}
 .fase{margin:8px 0;padding:7px 9px;border-left:3px solid #38bdf8;background:#0f172a;font-size:12px}
 .vista-rapida{margin-top:8px}.detalle{border-top:1px solid #334155;margin-top:10px;padding-top:8px}.detalle summary{cursor:pointer;color:#93c5fd;font-size:12px;font-weight:650;list-style:none}.detalle summary:after{content:' ＋';float:right}.detalle[open] summary:after{content:' −'}.detalle-contenido{padding-top:6px}
 .filtros{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 14px}.filtros input,.filtros select{background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:7px 10px;font-size:12px}.filtros input{min-width:220px;flex:1}.filtros label{font-size:11px;color:#94a3b8}
 .global-kpis{display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));gap:8px;width:100%}.global-kpi{background:#111c30;border:1px solid #334155;border-radius:10px;padding:9px}.global-kpi b{font-size:20px;display:block}.global-kpi span{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}
 .botones{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
 button{cursor:pointer;border:0;border-radius:8px;padding:7px 10px;font-size:12px;color:#fff}
 .b-arrancar{background:#2563eb}.b-parar{background:#b91c1c}.b-pausar{background:#7c3aed}.b-log{background:#334155}
 .log{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:8px;font-family:monospace;font-size:11px;max-height:220px;overflow:auto;white-space:pre-wrap;display:none}
 .actualiza{color:#94a3b8;font-size:12px}
 @media(max-width:720px){body{padding:12px}.global-kpis{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.cabecera{align-items:flex-start;flex-direction:column}}
</style></head><body>
<header class="cabecera"><div><h1>Centro de ingesta</h1><p class="subtitulo">19 federaciones · estado vivo de colas, cobertura y calidad</p></div><span class="actualiza" id="act"></span></header>
<div class="panel-superior">
<div class="barra"><button class="b-parar" id="bparar">Parar recolectores</button>
<button class="b-arrancar" id="barrancar">Arrancar recolectores</button></div>
<div class="barra"><strong>Web de datos</strong> <span class="chip off" id="appestado">…</span>
<button class="b-arrancar" id="bapparrancar">Lanzar app</button>
<button class="b-parar" id="bapparar">Parar app</button>
<a id="bappabrir" href="http://localhost:3000" target="_blank" style="background:#334155;border-radius:8px;padding:7px 10px;font-size:12px;color:#fff;text-decoration:none">Abrir</a>
<span class="actualiza" id="appmsg"></span></div>
<div class="barra"><strong>RAM libre</strong> <span class="chip" id="ram">…</span> <span class="actualiza" id="ramdet"></span> <strong>Disco</strong> <span class="chip" id="disco">…</span></div>
</div>
<div class="panel-superior" id="globalbarra"><span class="actualiza">calculando visión global…</span></div>
<div class="actualiza" style="margin:-6px 0 12px"><b>REAL</b> = contado en la base (índices, jornadas descargadas, cola). <b>ESTIMACIÓN</b> = media propia de cada federación (sus partidos/jornada × sus jornadas previstas).</div>
<details class="ayuda"><summary>¿Qué significa cada dato? (pulsa para abrir)</summary>
<dl>
<dt>trabajos</dt><dd>Unidades de trabajo en la cola. Cada trabajo es <b>una página a descargar</b>: un índice de jornadas, una jornada, un calendario, una clasificación o un acta.</dd>
<dt>hechos / pendientes</dt><dd>Trabajos ya completados / que quedan por hacer en la cola actual.</dd>
<dt>grupos / índices</dt><dd>Grupos descubiertos y cuántos tienen ya leído su <b>índice de jornadas</b> (la página que lista todas las jornadas de ese grupo). Sin ese índice no se sabe cuántas jornadas ni partidos tiene.</dd>
<dt>jornadas</dt><dd>Páginas de jornada descargadas. Una jornada contiene los partidos de esa ronda y enlaza sus actas.</dd>
<dt>actas</dt><dd>Fichas de partido (una por partido). <b>hechas</b> = descargadas y analizadas con sus datos (alineaciones, goles, tarjetas…). <b>conocidas</b> = partidos ya vistos en las jornadas descargadas.</dd>
<dt>estructura (real)</dt><dd>% de índices de jornadas leídos respecto al total de grupos. Respaldo: <i>grupos con índice leído / total</i>.</dd>
<dt>jornadas (real)</dt><dd>% de jornadas descargadas respecto a las previstas de los grupos cuyo índice ya se leyó.</dd>
<dt>actas (estim.)</dt><dd>% de actas analizadas sobre una <b>estimación</b> del total: jornadas previstas de la federación × sus partidos por jornada. Si no hay base suficiente se muestra <b>"actas (descub.)"</b>, que es solo «de las actas que ya conozco, cuántas he procesado» (no es progreso real).</dd>
<dt>cola (real)</dt><dd>% de la cola de trabajos ya hecha. Puede <b>bajar</b> cuando se descubre trabajo nuevo.</dd>
<dt>ETA</dt><dd>Tiempo estimado para terminar la <b>cola actual</b>: segundos por petición (medidos en las últimas 30) × trabajos pendientes. Es una estimación; sube si el ritmo baja o si aparece trabajo nuevo.</dd>
<dt>ritmo 5m / 10m / 15m</dt><dd>Peticiones por minuto en los últimos 5, 10 y 15 minutos.</dd>
<dt>bloqueados / BLOQUEO</dt><dd>Trabajos detenidos porque la web nos frenó de verdad (captcha, acceso denegado, límite explícito). Un aviso <b>BLOQUEO</b> solo aparece si ha ocurrido.</dd>
<dt>descartados</dt><dd>Trabajos abandonados <b>sin ser un bloqueo</b>: la misma dirección devolvió una página vacía o sin contenido tres veces. Se guardan con su motivo para poder recuperarlos, y no cuentan como trabajo pendiente.</dd>
<dt>calidad</dt><dd>Actas <b>correctas</b> (datos completos) y <b>a revisar</b> (incidencia detectada; se conserva para reprocesar).</dd>
<dt>temporadas</dt><dd>Avance por temporada: verde = completada, azul = en curso, rojo = sin empezar. Pasa el ratón por cada bloque para ver el detalle.</dd>
</dl></details>
<div class="filtros"><label>Mostrar
<select id="filtroestado"><option value="todos">Todas</option><option value="activas">En marcha</option><option value="colas">Con cola</option><option value="catalogos">En descubrimiento</option><option value="atencion">Requieren atención</option></select></label>
<input id="buscarfed" type="search" placeholder="Buscar federación…"><span class="actualiza" id="conteovisible"></span></div>
<div class="grid" id="grid"></div>
<script>
	 let cache=[], firma='', cargandoEstado=false;
	 async function cargar(){
	  if(cargandoEstado) return;
	  cargandoEstado=true;
  try{
   const r=await fetch('/api/estado'); if(!r.ok) throw new Error('HTTP '+r.status);
   cache=await r.json();
   const prioridad={ 'castilla-leon':0, madrid:1, valencia:2 };
   cache.sort(function(a,b){ return (prioridad[a.nombre]??10)-(prioridad[b.nombre]??10)||a.etiqueta.localeCompare(b.etiqueta,'es'); });
   pintar(); pintaGlobal(); aplicaFiltros();
   document.getElementById('act').textContent='actualizado '+new Date().toLocaleTimeString();
	  }catch(e){ document.getElementById('act').textContent='error: '+e.message; }
	  finally{ cargandoEstado=false; }
 }
 function chip(s){ if(!s) return '<span class="chip off">sin tarea</span>';
   const m={Running:'run',Ready:'ready',Disabled:'off'}; return '<span class="chip '+(m[s]||'ready')+'">'+s+'</span>'; }
 function num(v,l){ return '<span class="num"><b>'+v+'</b>'+l+'</span>'; }
 function fmtEta(s){ if(s==null) return '—'; if(s<3600) return Math.round(s/60)+' min'; if(s<86400) return (s/3600).toFixed(1)+' h'; return (s/86400).toFixed(1)+' d'; }
 function barra(etq,pct){
   // pct === null significa "todavía no hay denominador", no "0 %": se dibuja vacía y con «—».
   if(pct===null||pct===undefined) return '<div class="barra-p"><span class="etq">'+etq+'</span><span class="pista"></span><span class="pct">—</span></div>';
   const p=Math.max(0,Math.min(100,pct)); const col=p>=100?'#16a34a':p>=50?'#2563eb':'#ca8a04';
  return '<div class="barra-p"><span class="etq">'+etq+'</span><span class="pista"><span class="relleno" style="width:'+p+'%;background:'+col+'"></span></span><span class="pct">'+p+'%</span></div>'; }
 function tiraTemporadas(ts){
  if(!ts||!ts.length) return '';
  return '<div class="temporadas">'+ts.map(function(t){
   const col=t.pct>=100?'#16a34a':t.pct>0?'#2563eb':'#7f1d1d';
   return '<span class="tblock" style="background:'+col+'" title="'+t.etiqueta+': '+t.hecho+'/'+t.total+' trabajos ('+t.pct+'%)">'+t.etiqueta.slice(2)+'</span>';
  }).join('')+'</div>';
 }
 function resumen(f){
  if(f.tipo==='catalogo'){
   if(f.sinSondeo) return '<div class="datos">Sin catálogo descubierto todavía.</div>';
   const pctCat = f.competiciones ? Math.round(((f.competiciones_con_grupos||0)/f.competiciones)*100) : 0;
   return '<div class="fase">Catálogo · adaptador iSquad (aún sin jornadas ni actas)</div>'
    +'<div class="nums">'+num(f.temporadas||0,'temporadas')+num(f.competiciones||0,'competiciones')+num(f.grupos||0,'grupos')+'</div>'
    +barra('catálogo (real)',pctCat)
    +'<div class="datos">competiciones con grupos '+(f.competiciones_con_grupos||0).toLocaleString('es-ES')+'/'+(f.competiciones||0).toLocaleString('es-ES')+' ('+pctCat+'%)</div>'
    +'<div class="datos">este adaptador descubre temporadas, competiciones y grupos; <b>falta la capa de jornadas y actas</b></div>'
    +(f.actualizado?'<div class="datos">actualizado '+new Date(f.actualizado).toLocaleString('es-ES')+'</div>':'')
    +(f.portal?'<div class="datos"><a href="'+f.portal+'" target="_blank" rel="noreferrer">Fuente oficial ↗</a></div>':'');
  }
  if(f.tipo==='estado'){
   return '<div class="fase">'+(f.adaptador||'adaptador propio')+'</div>'
    +'<div class="datos">estado: <b>'+(f.estadoInventario||'—')+'</b></div>'
    +(f.nota?'<div class="datos" style="color:#fbbf24">'+f.nota+'</div>':'')
    +(f.paginas!=null?'<div class="datos">páginas descubiertas '+f.paginas+(f.documentos!=null?' · documentos '+f.documentos:'')+'</div>':'')
    +(f.sinSondeo?'<div class="datos">sin sondeo todavía</div>':'')
    +(f.actualizado?'<div class="datos">actualizado '+new Date(f.actualizado).toLocaleString('es-ES')+'</div>':'')
    +(f.portal?'<div class="datos"><a href="'+f.portal+'" target="_blank" rel="noreferrer">Fuente oficial ↗</a></div>':'');
  }
  if(f.cargando) return '<div class="fase">Leyendo la base…</div><div class="datos">El panel sigue operativo mientras prepara estas métricas.</div>';
  if(f.sinBase) return '<div class="datos">Sin base aun (haz el sondeo inicial).</div>';
  if(f.error) return '<div class="fase" style="border-color:#ef4444">No se pudo leer el estado</div><div class="datos">'+f.error+'</div>';
  const fase=f.gruposPend?'Descubriendo competiciones y grupos':f.indicesPend?'Recorriendo grupos y jornadas':'Procesando actas y actualizaciones';
  const actasTxt=f.actasEstimadas!=null
    ? f.actasHechas.toLocaleString('es-ES')+' / ~'+f.actasEstimadas.toLocaleString('es-ES')+' (estimado por estructura)'
    : f.actasHechas.toLocaleString('es-ES')+' / '+f.actasDescubiertas.toLocaleString('es-ES')+' (descubiertas)';
  const baseTxt = f.baseSuficiente
    ? 'base ~'+f.jornadasEstimadasTotal.toLocaleString('es-ES')+' jornadas × '+f.partidosPorJornada+' p/j ('+f.pctIndicesLeidos+'% de índices leídos)'
    : 'sin base suficiente: '+f.pctIndicesLeidos+'% de índices leídos (estimación desactivada)';
  // Sin ritmo, la tarjeta tiene que decir POR QUÉ en la parte que se ve sin desplegar nada. Antes esa
  // explicación vivía dentro del detalle plegado, así que una federación que sólo está esperando
  // (todo lo pendiente aplazado a la fecha de sus jornadas, como Canarias) parecía atascada.
  const edadMetricas = f.metricasActualizadasEn
    ? Math.round((Date.now() - Date.parse(f.metricasActualizadasEn)) / 60000) : null;
  let avisoRitmo = '';
  if (f.ritmo5 === 0 && f.pend > 0) {
    if (f.pausado) avisoRitmo = '<div class="datos" style="color:#fbbf24"><b>⏸ EN PAUSA</b> hasta '+String(f.pausaHasta).slice(11,16)+' h · no está atascada: se aparta por respeto a la fuente</div>';
    else if (f.aplazados != null && f.aplazados >= f.pend) avisoRitmo = '<div class="datos" style="color:#93c5fd"><b>⏸ sin ritmo ahora mismo, y es normal</b>: los '+f.pend.toLocaleString('es-ES')+' pendientes están aplazados a la fecha de sus jornadas (aún no jugadas)</div>';
    else avisoRitmo = '<div class="datos" style="color:#fbbf24"><b>⚠️ sin ritmo</b> con '+f.pend.toLocaleString('es-ES')+' pendientes que NO están aplazados: esta tarjeta sí puede estar atascada</div>';
  }
  const avisoMetricas = edadMetricas != null && edadMetricas >= 3
    ? '<div class="datos" style="color:#fbbf24">métricas de hace '+edadMetricas+' min: el panel no ha podido recalcular esta base (el equipo va cargado); los números son los últimos buenos</div>'
    : '';
  return '<div class="vista-rapida"><div class="fase">'+fase+'</div>'
   +'<div class="nums">'+num(f.hecho.toLocaleString('es-ES'),'hechos')+num(f.pend.toLocaleString('es-ES'),'pendientes')+num(f.actasHechas.toLocaleString('es-ES'),'actas')+'</div>'
   +barra('estructura',f.pctEstructura)+barra('jornadas',f.pctJornadas)+barra('cola',f.progreso)
   +'<div class="datos">ETA <b>'+fmtEta(f.etaSegundos)+'</b> · '+f.ritmo5+'/min · calidad '+f.actasCorrectas.toLocaleString('es-ES')+' correctas</div>'
   +avisoRitmo+avisoMetricas+'</div>'
   +'<details class="detalle"><summary>Ver métricas y temporadas</summary><div class="detalle-contenido">'
   +'<div class="datos">fase 1 descubrimiento <b>'+f.fasesDescubrimiento.pct+'%</b> ('+f.fasesDescubrimiento.hecho.toLocaleString('es-ES')+'/'+f.fasesDescubrimiento.total.toLocaleString('es-ES')
   +') · fase 2 datos <b>'+f.fasesDatos.pct+'%</b> ('+f.fasesDatos.hecho.toLocaleString('es-ES')+'/'+f.fasesDatos.total.toLocaleString('es-ES')+')</div>'
   +'<div class="nums">'+num(f.total,'trabajos')+num(f.hecho,'hechos')+num(f.actasHechas,'actas')
   +'<span class="num" style="color:#f87171"><b>'+f.bloqueados+'</b>bloqueados</span>'+num(f.enCurso,'en curso')
   +(f.cancelados>0?'<span class="num" style="color:#fbbf24"><b>'+f.cancelados.toLocaleString('es-ES')+'</b>descartados</span>':'')+'</div>'
   +barra('estructura (real)',f.pctEstructura)+barra('jornadas (real)',f.pctJornadas)
   // La barra de actas sólo se dibuja cuando hay un denominador de verdad (la estimación por
   // estructura). Sin él, «analizadas / descubiertas» daría 100 % en una federación que acaba de
   // empezar, que es justo lo contrario de lo que hay que comunicar: en ese caso se muestran los
   // recuentos en texto y ninguna barra.
   +(f.baseSuficiente?barra('actas (estim.)',f.pctActas):'')
   +barra('cola (real)',f.progreso)
   +'<div class="datos">grupos con indice leido <b>'+f.gruposConIndice.toLocaleString('es-ES')+'</b>/'+f.gruposTotales.toLocaleString('es-ES')
   +' ('+f.pctIndicesLeidos+'%)'
   +(f.indiceHecho !== f.gruposConIndice ? ' · indices de jornadas hechos '+f.indiceHecho+'/'+(f.indiceHecho+f.indicesPend) : '')
   +'</div>'
   +(f.baseSuficiente
     ? ''
     : '<div class="datos" style="color:#8A8E91">actas: sin barra. Sólo se dibuja cuando hay un denominador real, y aquí todavía no lo hay ('+f.pctIndicesLeidos+'% de índices leídos). Los recuentos de abajo son los reales.</div>')
   +'<div class="datos">jornadas '+f.jornadasHechas.toLocaleString('es-ES')+'/'+f.jornadasEsperadas.toLocaleString('es-ES')
   +' · partidos conocidos '+f.actasConocidas.toLocaleString('es-ES')+'</div>'
   +'<div class="datos">temporadas: <b>'+f.temporadasCompletas+' completas</b> · '+f.temporadasEnCurso+' en curso · '+f.temporadasPendientes+' sin empezar'
   +(f.temporadasApartadas>0?' · <span style="color:#93c5fd">'+f.temporadasApartadas+' aplazadas (anteriores a 2023-24)</span>':'')
   +(f.temporadaActual?' · actual '+f.temporadaActual.etiqueta+' al '+f.temporadaActual.pct+'% (quedan '+f.temporadaActual.pend.toLocaleString('es-ES')+' trabajos)':'')+'</div>'
   +tiraTemporadas(f.porTemporada)
   +'<div class="datos">actas '+actasTxt+'</div>'
   +(f.actasSinDatos > 0
     ? '<div class="datos" style="color:#93c5fd">'+f.actasSinDatos.toLocaleString('es-ES')+' fichas publicadas sin datos por la federación (tablas de alineaciones vacías): no cuentan como hechas ni bloquean a su grupo</div>'
     : '')
   +(f.actasFuturas > 0
     ? '<div class="datos">de lo YA JUGABLE: <b>'+(f.pctActasJugables!=null?f.pctActasJugables+'%':'—')+'</b> ('+f.actasHechas.toLocaleString('es-ES')+'/'+(f.actasJugables!=null?f.actasJugables.toLocaleString('es-ES'):'?')
       +') · ~'+f.actasFuturas.toLocaleString('es-ES')+' actas son de <b>'+f.jornadasFuturas.toLocaleString('es-ES')+' jornadas aún no jugadas</b></div>'
     : '')
   +'<div class="datos"'+(f.catalogoSospechoso?' style="color:#fbbf24"':'')+'>'+baseTxt+'</div>'
   +'<div class="datos" style="color:#8A8E91">media propia: '+f.partidosPorJornada+' partidos/jornada · '+f.jornadasPorGrupo+' jornadas/grupo</div>'
   +'<div class="datos">'+(f.ultimaEdad!=null?'ultima peticion hace '+f.ultimaEdad+'s':'sin peticiones')
   +(f.ritmo5===0&&f.aplazados>0?' · <b style="color:#fbbf24">sin trabajo disponible ahora: '+f.aplazados.toLocaleString('es-ES')+' trabajos aplazados a futuro</b>':'')+'</div>'
   +(f.pausado?'<div class="datos" style="color:#fbbf24"><b>EN PAUSA hasta '+String(f.pausaHasta).slice(11,16)+'</b> por respeto a la web: '+String(f.pausaMotivo??'').replace(/</g,'&lt;').slice(0,120)+'</div>':'')
   +'<div class="datos">ETA <b>'+fmtEta(f.etaSegundos)+'</b> · ritmo 5m='+f.ritmo5+'/min · 10m='+f.ritmo10+'/min · 15m='+f.ritmo15+'/min ('+f.segPorPeticion+'s/pet)</div>'
   +'<div class="datos">peticiones '+f.peticionesTotales+' · errores '+f.errores+' ('+f.tasaError+'%)</div>'
   +(f.ultimoBloqueo?'<div class="datos" style="color:#f87171"><b>BLOQUEO</b>: '+f.ultimoBloqueo+'</div>':'')
   +'<div class="datos">calidad: '+f.actasCorrectas+' correctas · '+f.actasRevisar+' para revisar</div></div></details>';
 }
 function pintaGlobal(){
  const con=cache.filter(f=>f.tipo==='cola' && !f.sinBase && !f.error);
  const cat=cache.filter(f=>f.tipo==='catalogo' && !f.sinSondeo);
  const h=con.reduce((n,f)=>n+(f.hecho||0),0);
  const p=con.reduce((n,f)=>n+(f.pend||0),0);
  const actas=con.reduce((n,f)=>n+(f.actasHechas||0),0);
  const gruposCat=cat.reduce((n,f)=>n+(f.grupos||0),0);
  const pct=(h+p)>0?Math.round(h/(h+p)*100):0;
  const activas=con.filter(f=>f.tareaEstado==='Running').length;
  const revisar=con.reduce((n,f)=>n+(f.actasRevisar||0),0);
  document.getElementById('globalbarra').innerHTML='<div class="global-kpis">'
   +'<div class="global-kpi"><b>'+activas+'/'+con.length+'</b><span>recolectores activos</span></div>'
   +'<div class="global-kpi"><b>'+pct+'%</b><span>cola conocida hecha</span></div>'
   +'<div class="global-kpi"><b>'+actas.toLocaleString('es-ES')+'</b><span>actas analizadas</span></div>'
   +'<div class="global-kpi"><b>'+p.toLocaleString('es-ES')+'</b><span>trabajos pendientes</span></div>'
   +'<div class="global-kpi"><b>'+revisar.toLocaleString('es-ES')+'</b><span>actas a revisar</span></div></div>'
   +'<div class="actualiza" style="margin-top:8px">'+h.toLocaleString('es-ES')+' trabajos hechos · catálogos sin cola '+cat.length+' ('+gruposCat.toLocaleString('es-ES')+' grupos)</div>';
 }
 function pintar(){
  const g=document.getElementById('grid');
  const nuevaFirma=cache.map(f=>f.nombre).join('|');
  if(firma!==nuevaFirma){
   firma=nuevaFirma; g.innerHTML='';
   for(const f of cache){
    const e=document.createElement('div'); e.className='tarjeta'+(['castilla-leon','madrid','valencia'].includes(f.nombre)?' prioritaria':''); e.id='fed-'+f.nombre;
    e.dataset.tipo=f.tipo;
    const acciones = f.tarea
      ? '<button class="b-arrancar" data-fed="'+f.nombre+'" data-a="arrancar">Arrancar</button>'
        +'<button class="b-parar" data-fed="'+f.nombre+'" data-a="parar">Parar</button>'
        +(f.tipo==='cola'
          ? '<button class="b-pausar" data-fed="'+f.nombre+'" data-a="pausar">Pausar</button>'
            +'<button class="b-pausar" data-fed="'+f.nombre+'" data-a="reanudar">Reanudar</button>'
          : '')
        +'<button class="b-log" data-fed="'+f.nombre+'" data-a="log">Log</button>'
      : '<span class="actualiza">sin tarea automática (adaptador propio)</span>';
    e.innerHTML='<h2><span class="etiqueta"></span><span class="estado"></span><span class="cuando"></span></h2><div class="resumen"></div>'
     +'<div class="botones">'+acciones+'</div>'
     +'<div class="log" id="log-'+f.nombre+'" data-abierto="0"></div>';
    g.appendChild(e);
   }
  }
  for(const f of cache){
   const e=document.getElementById('fed-'+f.nombre); if(!e) continue;
   const detalleAbierto=e.querySelector('.detalle')?.open;
   e.querySelector('.etiqueta').textContent=f.etiqueta;
   e.querySelector('.estado').innerHTML=chip(f.tareaEstado);
   // "Ready" a secas no informa: para una tarea diaria es su estado normal. Con la última y la
   // próxima ejecución se entiende de un vistazo si ha trabajado y cuándo vuelve a hacerlo. Y si es
   // un recolector (trabajo continuo) y NO está corriendo, eso sí es un aviso.
   //
   // El elemento se crea UNA vez, en la plantilla de la tarjeta, y aquí sólo se ACTUALIZA. Antes se
   // añadía con insertAdjacentHTML en cada refresco y el texto se acumulaba cada 15 s hasta llenar
   // la tarjeta y tapar todo lo demás.
   //
   // En la cabecera se muestra lo mínimo para no robarla espacio al nombre: el aviso si está parada
   // y, si no, cuándo vuelve a ejecutarse en formato corto. El detalle completo (última ejecución,
   // próxima y resultado) va en el tooltip.
    const corto=(iso)=>{ if(!iso) return ''; const m=/^([0-9]{4})-([0-9]{2})-([0-9]{2})[ T]([0-9]{2}):([0-9]{2})/.exec(String(iso)); return m?m[3]+'/'+m[2]+' '+m[4]+':'+m[5]:String(iso).slice(0,16); };
   const parada=f.tipo==='cola'&&f.tarea&&f.tareaEstado!=='Running';
   const elCuando=e.querySelector('.cuando');
   if(elCuando){
     elCuando.textContent = parada ? '⚠️ PARADA'
       : f.tareaProxima ? 'próx. '+corto(f.tareaProxima) : (f.tarea?'' :'');
     elCuando.className = 'cuando'+(parada?' aviso':'');
     elCuando.title = f.tarea
       ? ['tarea: '+f.tarea,
         f.tareaUltima?'última ejecución: '+f.tareaUltima:'sin ejecutar todavía',
         f.tareaProxima?'próxima: '+f.tareaProxima:'',
         f.tareaResultado!=null?'último resultado: '+f.tareaResultado:''].filter(Boolean).join('\\n')
       : '';
   }
   e.querySelector('.resumen').innerHTML=resumen(f);
   const detalle=e.querySelector('.detalle'); if(detalle&&detalleAbierto) detalle.open=true;
  }
 }
 function aplicaFiltros(){
  const estado=document.getElementById('filtroestado').value;
  const q=document.getElementById('buscarfed').value.trim().toLocaleLowerCase('es');
  let visibles=0;
  for(const f of cache){
   const coincideTexto=!q||f.etiqueta.toLocaleLowerCase('es').includes(q);
   const coincideEstado=estado==='todos'||(estado==='activas'&&f.tareaEstado==='Running')
    ||(estado==='colas'&&f.tipo==='cola')||(estado==='catalogos'&&f.tipo!=='cola')
    ||(estado==='atencion'&&((f.error||f.actasRevisar>0||f.bloqueados>0)||f.tareaEstado==='Disabled'));
   const e=document.getElementById('fed-'+f.nombre); if(!e) continue;
   e.classList.toggle('oculta',!(coincideTexto&&coincideEstado)); if(coincideTexto&&coincideEstado) visibles++;
  }
  document.getElementById('conteovisible').textContent=visibles+' de '+cache.length;
 }
 async function accion(nombre, tipo, refrescar=true){
  try{
   const r=await (await fetch('/api/'+nombre+'/'+tipo,{method:'POST'})).json();
   document.getElementById('act').textContent = (r && r.ok===false)
     ? ('FALLO '+tipo+' '+nombre+(r.code!=null?' (code '+r.code+')':''))
     : (tipo+' ok: '+nombre);
  }catch(e){ document.getElementById('act').textContent='error '+tipo+' '+nombre+': '+e.message; }
  if(refrescar) cargar();
 }
	 async function actualizaLog(nombre){
	  const div=document.getElementById('log-'+nombre); if(!div) return;
	  if(div.dataset.actualizando==='1') return; div.dataset.actualizando='1';
	  const alFinal=div.scrollHeight-div.scrollTop-div.clientHeight<24, posicion=div.scrollTop;
	  try{ const d=await (await fetch('/api/estado/'+nombre+'/log')).json();
	    div.textContent=(d.lineas||[]).join('\\n')||'(sin log)'; }catch(e){ div.textContent='error log'; }
	  div.scrollTop=alFinal?div.scrollHeight:posicion; div.dataset.actualizando='0';
 }
 async function verLog(nombre){
  const div=document.getElementById('log-'+nombre); if(!div) return;
  const abrir=div.dataset.abierto!=='1'; div.dataset.abierto=abrir?'1':'0';
  div.style.display=abrir?'block':'none'; if(abrir) await actualizaLog(nombre);
 }
 function actualizaLogs(){
  for(const div of document.querySelectorAll('.log[data-abierto="1"]')) actualizaLog(div.id.slice(4));
 }
 document.getElementById('grid').addEventListener('click', function(ev){
  const b=ev.target.closest('button'); if(!b) return;
  const fed=b.dataset.fed, a=b.dataset.a;
  if(a==='log') verLog(fed); else accion(fed, a);
 });
 async function accionTodos(tipo){ await Promise.all(cache.filter(f=>f.tipo==='cola'&&f.tarea).map(f=>accion(f.nombre,tipo,false))); await cargar(); }
 document.getElementById('bparar').addEventListener('click', function(){ accionTodos('parar'); });
 document.getElementById('barrancar').addEventListener('click', function(){ accionTodos('arrancar'); });
 document.getElementById('filtroestado').addEventListener('change', aplicaFiltros);
 document.getElementById('buscarfed').addEventListener('input', aplicaFiltros);
 async function appEstado(){
  try{ const d=await (await fetch('/api/app/estado')).json(); const el=document.getElementById('appestado');
    el.textContent=d.activa?'activa':'parada'; el.className='chip '+(d.activa?'run':'off'); }catch(e){}
 }
 document.getElementById('bapparrancar').addEventListener('click', async function(){
  document.getElementById('appmsg').textContent='lanzando…';
  try{ const r=await (await fetch('/api/app/arrancar',{method:'POST'})).json();
    document.getElementById('appmsg').textContent=r.yaActiva?'ya estaba activa':'lanzada (tarda unos segundos)'; }catch(e){ document.getElementById('appmsg').textContent='error al lanzar'; }
  setTimeout(appEstado,5000);
 });
 document.getElementById('bapparar').addEventListener('click', async function(){
  document.getElementById('appmsg').textContent='parando…';
  try{ await fetch('/api/app/parar',{method:'POST'}); }catch(e){}
  setTimeout(appEstado,1500);
 });
 async function sistemaUI(){
  try{ const d=await (await fetch('/api/sistema')).json();
   const el=document.getElementById('ram');
   el.textContent=d.ramLibreGB+' / '+d.ramTotalGB+' GB';
   el.className='chip '+(d.ramLibreGB<2?'off':d.ramLibreGB<4?'ready':'run');
   const disco=document.getElementById('disco');
   if(disco && d.discoLibreGB!=null){
     // El disco es lo que se agota en silencio: por debajo de 15 GB se avisa en rojo, y por debajo de
     // 30 GB en ámbar, porque cada acta archivada pesa ~91 KB y el trabajo que queda son millones.
     disco.textContent=d.discoLibreGB+' GB libres';
     disco.className='chip '+(d.discoLibreGB<15?'off':d.discoLibreGB<30?'ready':'run');
     disco.title='de '+d.discoTotalGB+' GB en el disco de las descargas';
   }
   document.getElementById('ramdet').textContent=(d.chromeProc!=null?('chrome '+d.chromeProc+' proc '+d.chromeGB+' GB'):'')+(d.nodeProc!=null?(' · node '+d.nodeProc+' proc '+d.nodeGB+' GB'):'');
  }catch(e){}
 }
 // Sólo se refresca cuando la pestaña está a la vista. Con el equipo al 100 % de CPU, dejar el panel
 // pidiendo /api/estado (52 KB) cada 2 s en una pestaña de fondo gasta el turno de CPU que necesitan
 // los recolectores; al volver a la pestaña se refresca de inmediato, así que no se pierde nada.
 const latido=(fn,ms)=>{ let id=null;
   const arranca=()=>{ if(id==null) id=setInterval(()=>{ if(!document.hidden) fn(); },ms); };
   const para=()=>{ if(id!=null){ clearInterval(id); id=null; } };
   document.addEventListener('visibilitychange',()=>{ if(document.hidden) para(); else { fn(); arranca(); } });
   arranca();
 };
 appEstado(); latido(appEstado, 5000);
 sistemaUI(); latido(sistemaUI, 5000);
 cargar(); latido(cargar, 2000); latido(actualizaLogs, 2000);
</script></body></html>`;
