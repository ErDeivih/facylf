#!/usr/bin/env node
/*
 * ── MONITOR DE LA FLOTA: mira todo, lo deja escrito y avisa si algo va mal ──────────────────────────────
 *
 * Se ejecuta **en el host del servidor** (por `cron`, cada minuto) y escribe:
 *
 *   · `estado/facylf.json`       — la foto de ahora mismo, para mirarla o servirla
 *   · `estado/historial.jsonl`   — una línea por vuelta, para ver tendencias
 *   · `estado/alertas.log`       — lo que se ha avisado y cuándo
 *
 * y avisa por **ntfy** (que ya está montado en el servidor y ya usa RadioPV) y late a **Uptime-Kuma** si se le
 * da la URL de su monitor de tipo «push»: así, si el monitor se muere, Kuma lo dice.
 *
 * Por qué en el host y no en un contenedor: en el host ya están Docker y Node, así que no hay que construir ni
 * mantener una imagen más, y se ve la rebanada de memoria tal y como la ve el kernel. La comprobación de que la
 * flota sigue viva la hace el latido; la de que el disco no se llena, el propio monitor.
 *
 * Lo que decide (umbrales y alertas) vive en `lib/monitor-flota.mjs`, que es puro y tiene pruebas. Aquí sólo se
 * lee el sistema y se escribe.
 *
 * Uso:  node scripts/monitor-flota.mjs [--una-vez] [--cada-seg 60] [--sin-avisos] [--json]
 */
import { execFile } from 'node:child_process';
import { request as http } from 'node:http';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';

import { UMBRALES, decideAlertas, lineaDeHistorial, textoDeAlerta } from './lib/monitor-flota.mjs';
import { leeEstadoDeCola } from './lib/estado-cola.mjs';

const ejecuta = promisify(execFile);
const RAIZ = resolve(process.env.FACYLF_RAIZ ?? process.cwd());
const ESTADO = process.env.FACYLF_ESTADO_DIR ?? join(RAIZ, 'estado');
const CGROUP = process.env.FACYLF_CGROUP ?? '/sys/fs/cgroup/facylf.slice';
const NTFY = process.env.FACYLF_NTFY ?? 'http://127.0.0.1:8085/facylf';
const KUMA = process.env.FACYLF_KUMA_PUSH ?? '';
const SLICE_GB = Number(process.env.FACYLF_SLICE_GB ?? 10);

const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };
const unaVez = argumentos.includes('--una-vez');
const sinAvisos = argumentos.includes('--sin-avisos');
const cadaSeg = Number(arg('cada-seg', 60));
const soloJson = argumentos.includes('--json');

const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));
const gb = (bytes) => Number(bytes) / 1024 ** 3;

/*
 * Con `FACYLF_MONITOR_DEPURAR=1` cada sonda dice cuánto ha tardado. Un monitor que se cuelga es peor que no
 * tenerlo, así que cuando algo va lento hay que poder ver QUÉ sonda es sin adivinar (medido el 21/09/2026: en
 * el PC con la flota a pleno rendimiento la primera vuelta tardaba, y sin esto no había forma de saber dónde).
 */
const DEPURAR = process.env.FACYLF_MONITOR_DEPURAR === '1';
async function cronometra(nombre, tarea) {
  const antes = Date.now();
  try {
    return await tarea();
  } finally {
    if (DEPURAR) console.error(`  [monitor] ${nombre}: ${Date.now() - antes} ms`);
  }
}

function leeNumero(ruta) {
  try { return Number(readFileSync(ruta, 'utf8').trim()); } catch { return null; }
}

/** La rebanada de memoria: es el tope duro de 10 GB del proyecto entero. */
function leeRebanada() {
  const actual = leeNumero(join(CGROUP, 'memory.current'));
  const pico = leeNumero(join(CGROUP, 'memory.peak'));
  let oomKills = null;
  try {
    const eventos = readFileSync(join(CGROUP, 'memory.events'), 'utf8');
    const valor = (nombre) => Number(new RegExp(`^${nombre}\\s+(\\d+)$`, 'm').exec(eventos)?.[1] ?? 0);
    oomKills = valor('oom_kill');
    var oom = valor('oom');
    var alto = valor('high');
    var maximo = valor('max');
  } catch { /* sin cgroup legible: se informa de lo que haya */ }
  return {
    existe: actual !== null,
    memoriaGb: actual === null ? null : Number(gb(actual).toFixed(2)),
    picoGb: pico === null ? null : Number(gb(pico).toFixed(2)),
    topeGb: SLICE_GB,
    oomKills, oom, high: alto, max: maximo,
  };
}

/**
 * Los contenedores de facylf y su consumo.
 *
 * Dos formas, según dónde corra el monitor:
 *
 *   · **en el host del servidor**, con `docker stats` (lo más simple);
 *   · **dentro de un contenedor** —el servidor no tiene Node instalado, así que se usa `node:22-alpine`, que ya
 *     está descargada— hablando con el socket de Docker por HTTP. Es Node puro (`node:http` sobre el socket) y
 *     evita tener que meter el cliente de Docker en la imagen.
 */
async function leeContenedores() {
  /*
   * Si la variable está puesta, se usa ESA vía aunque `existsSync` diga que no existe: en Windows el socket de
   * Docker es una tubería con nombre (`//./pipe/docker_engine`) y `existsSync` no la ve — medido el 21/09/2026,
   * la primera versión se caía a `docker stats` por eso.
   */
  const declarado = process.env.FACYLF_DOCKER_SOCK;
  const socket = declarado ?? '/var/run/docker.sock';
  if (declarado || existsSync(socket)) {
    try { return await leeContenedoresPorSocket(socket); } catch (error) {
      return { longitud: null, totalGb: null, contenedores: [], detalle: `socket: ${error.message.slice(0, 140)}` };
    }
  }
  try {
    const { stdout } = await ejecuta('docker', ['stats', '--no-stream', '--format',
      '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.PIDs}}'], { timeout: 60_000 });
    return resume(sitaxisDeTexto(stdout));
  } catch (error) {
    return { longitud: null, totalGb: null, contenedores: [], detalle: error.message };
  }
}

/** Petición HTTP por el socket de Docker (funciona en Linux y en las tuberías con nombre de Windows). */
function pideAlSocket(socket, ruta) {
  return new Promise((listo, falla) => {
    const peticion = http.request({ socketPath: socket, path: ruta, method: 'GET' }, (respuesta) => {
      let cuerpo = '';
      respuesta.on('data', (trozo) => { cuerpo += trozo; });
      respuesta.on('end', () => {
        try { listo(JSON.parse(cuerpo)); } catch (error) { falla(new Error(`respuesta no JSON (${cuerpo.slice(0, 80)})`)); }
      });
    });
    peticion.setTimeout(20_000, () => peticion.destroy(new Error('timeout')));
    peticion.on('error', falla);
    peticion.end();
  });
}

/** Nombres y consumo de los contenedores de facylf, preguntando a Docker por su socket. */
async function leeContenedoresPorSocket(socket) {
  const lista = await pideAlSocket(socket, '/containers/json?all=0');
  const nuestros = (Array.isArray(lista) ? lista : [])
    .map((c) => ({ id: c.Id, nombre: (c.Names?.[0] ?? '').replace(/^\//, '') }))
    .filter((c) => /facylf/i.test(c.nombre));
  const contenedores = [];
  for (const c of nuestros) {
    try {
      const s = await pideAlSocket(socket, `/containers/${c.id}/stats?stream=false`);
      const memoria = Number(s.memory_stats?.usage ?? s.memory_stats?.stats?.cache ? (s.memory_stats.usage - (s.memory_stats.stats?.cache ?? 0)) : (s.memory_stats?.usage ?? 0));
      const limite = Number(s.memory_stats?.limit ?? 0);
      contenedores.push({
        nombre: c.nombre,
        memoriaMb: Math.round(memoria / 1048576),
        memoriaPct: limite ? `${((memoria / limite) * 100).toFixed(1)}%` : null,
        pids: Number(s.pids_stats?.current ?? 0),
      });
    } catch { /* un contenedor que se acaba de morir no puede tumbar la medida */ }
  }
  return resume(contenedores);
}

/** Convierte la salida de `docker stats` a la misma forma que la vía del socket. */
function sitaxisDeTexto(salida) {
  return salida.trim().split('\n').filter(Boolean).map((linea) => {
    const [nombre, cpu, memoria, memoriaPct, pids] = linea.split('\t');
    const usadaMb = Number((/([\d.]+)\s*MiB/.exec(memoria ?? '')?.[1]) ?? 0);
    return { nombre, cpuPct: Number((cpu ?? '0').replace('%', '')) || 0, memoriaMb: Math.round(usadaMb), memoriaPct, pids: Number(pids) || 0 };
  });
}

/** El resumen común: cuántos contenedores nuestros hay y cuánta memoria suman. */
function resume(contenedores) {
  const nuestras = contenedores.filter((f) => /facylf/i.test(f.nombre));
  const totalMb = nuestras.reduce((a, f) => a + (f.memoriaMb ?? 0), 0);
  return { longitud: nuestras.length, totalGb: Number((totalMb / 1024).toFixed(2)), contenedores: nuestras };
}

/**
 * El estado de cada federación.
 *
 * ── POR QUÉ HAY DOS VELOCIDADES ────────────────────────────────────────────────────────────────────────
 *
 * Leer el estado COMPLETO de las 19 colas (cuántos trabajos quedan, cuántos disponibles, aplazados…) son varios
 * barridos sobre tablas de cientos de miles de filas por cola. Medido el 21/09/2026: hacerlo entero en cada
 * vuelta del monitor lo dejaba por encima de los siete minutos, que es lo mismo que no tener monitor.
 *
 * Así que se separa:
 *
 *   · **señales ligeras, todas las federaciones, en cada vuelta** — última petición, peticiones y fallos de la
 *     ventana, plaza ocupada y la última línea del registro. Todas van por índice o por fichero: milisegundos.
 *   · **estado completo de la cola, en rotación** — unas pocas federaciones por vuelta (`FACYLF_COLAS_POR_VUELTA`,
 *     4 por defecto). Se guarda en `estado/colas.json` y se reutiliza: cada cola se relee entera cada ~5 minutos.
 *
 * Y el estado de la cola lo lee `lib/estado-cola.mjs`, el MISMO criterio que usan el supervisor de cada
 * federación y `ajustar-flota.mjs`: no hay dos formas de contestar la misma pregunta.
 */
function leeFederaciones(desde, { completas = new Set(), cache = {} } = {}) {
  const federaciones = [];
  let directorios = [];
  try { directorios = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-')); } catch { return federaciones; }

  for (const dir of directorios) {
    const federacion = dir.replace('descargas-', '');
    const carpeta = join(RAIZ, dir, 'recolector-local');
    const baseDatos = join(carpeta, 'cola-v2.sqlite');
    if (!existsSync(baseDatos)) continue;
    const empezado = Date.now();

    const previo = cache[federacion] ?? {};
    const completo = completas.has(federacion);
    const estadoCola = completo ? leeEstadoDeCola(baseDatos) : null;
    const datos = {
      hechos: previo.hechos ?? null,
      pendientes: completo ? (estadoCola.legible ? estadoCola.pendientes : null) : (previo.pendientes ?? null),
      disponibles: completo ? (estadoCola.legible ? estadoCola.listos : null) : (previo.disponibles ?? null),
      aplazados: completo ? (estadoCola.legible ? estadoCola.aplazados : null) : (previo.aplazados ?? null),
      colaLegible: completo ? estadoCola.legible : (previo.colaLegible ?? null),
      motivoCola: completo ? (estadoCola.motivo ?? null) : (previo.motivoCola ?? null),
      pausaHasta: completo ? (estadoCola.pausaHasta ?? null) : (previo.pausaHasta ?? null),
      usadasHoy: completo ? (estadoCola.usadasHoy ?? null) : (previo.usadasHoy ?? null),
      limiteDiario: completo ? (estadoCola.limiteDiario ?? null) : (previo.limiteDiario ?? null),
      salidaMotivo: completo ? (estadoCola.salidaMotivo ?? null) : (previo.salidaMotivo ?? null),
      colaLeidaEn: completo ? new Date().toISOString() : (previo.colaLeidaEn ?? null),
      enPausa: completo ? Boolean(estadoCola.enPausa) : Boolean(previo.enPausa),
      peticionesVentana: 0,
      fallosVentana: 0,
      ultimaPeticion: null,
      ultimoError: null,
    };

    try {
      const db = new DatabaseSync(baseDatos, { readOnly: true });
      const uno = (sql, ...a) => { try { return Object.values(db.prepare(sql).get(...a) ?? {})[0] ?? null; } catch { return null; } };
      if (completo) datos.hechos = uno("select count(*) from trabajos where estado = 'hecho'");
      // Las consultas de ritmo van SIEMPRE con la ventana delante: el índice de `dia_madrid` y el de la clave
      // primaria hacen el trabajo.
      datos.peticionesVentana = uno('select count(*) from peticiones where iniciada_en >= ?', desde) ?? 0;
      datos.fallosVentana = uno("select count(*) from peticiones where iniciada_en >= ? and resultado like 'error%'", desde) ?? 0;
      /*
       * La última petición se busca POR `id` (clave primaria, índice inmediato) y no con `max(iniciada_en)`:
       * esa consulta no tiene índice y es un barrido completo de la tabla — medido el 21/09/2026 en la cola de
       * Murcia, 379 MB y 35 749 peticiones, **9,9 s** por federación; entre las 19, tres minutos y medio de
       * monitor para nada. El `id` es monótono, así que la última fila es la última petición.
       */
      datos.ultimaPeticion = uno('select iniciada_en from peticiones order by id desc limit 1');
      datos.ultimoError = uno("select detalle from peticiones where iniciada_en >= ? and resultado like 'error%' order by iniciada_en desc limit 1", desde);
      db.close();
    } catch (error) {
      datos.motivoCola = `no se pudo leer el ritmo: ${error.message}`;
    }

    // La plaza de navegador: si hay ficha viva, esta federación tiene navegador abierto.
    let plaza = null;
    try {
      const slots = join(RAIZ, '.estado-workers', 'slots-chrome');
      if (existsSync(slots)) {
        const ficha = join(slots, `${federacion}.lock`);
        if (existsSync(ficha)) plaza = { desde: statSync(ficha).mtime.toISOString(), contenido: readFileSync(ficha, 'utf8').trim().slice(0, 120) };
      }
    } catch { /* sin ficha */ }

    // La última línea del registro dice por qué está parada, si lo está. Se lee SÓLO su final (ver abajo).
    let ultimaLinea = null;
    let registroModificado = null;
    try {
      const registro = join(carpeta, 'worker-programado.log');
      if (existsSync(registro)) {
        registroModificado = statSync(registro).mtime.toISOString();
        ultimaLinea = ultimaLineaDe(registro);
      }
    } catch { /* sin registro */ }

    const minutosSinPedir = datos.ultimaPeticion
      ? Math.round((Date.now() - Date.parse(datos.ultimaPeticion)) / 60_000)
      : null;
    const texto = `${ultimaLinea ?? ''}`.toLowerCase();
    const estado = datos.colaLegible === false ? 'ilegible'
      : /esperando para abrir chrome|reserva es/.test(texto) ? 'memoria'
        : /esperando turno|no hay nadie esperando/.test(texto) ? 'turno'
          : datos.enPausa ? 'pausa'
            : (datos.disponibles === 0 ? 'sin-trabajo' : 'trabajando');

    federaciones.push({ federacion, ...datos, minutosSinPedir, plaza, ultimaLinea, registroModificado, estado });
    if (DEPURAR) {
      const ms = Date.now() - empezado;
      if (ms > 1000) console.error(`  [monitor]   ${federacion}: ${ms} ms${completo ? ' (completa)' : ''}`);
    }
  }
  return federaciones.sort((a, b) => a.federacion.localeCompare(b.federacion));
}

/** Qué federaciones tocan esta vuelta para la lectura COMPLETA de su cola (rotación con estado en disco). */
export function siguienteRotacion(federaciones, cursor, cuantas) {
  const nombres = federaciones.map((f) => f.federacion).sort();
  if (!nombres.length) return { completas: new Set(), cursor: 0 };
  const inicio = cursor % nombres.length;
  const elegidas = new Set();
  for (let i = 0; i < Math.min(cuantas, nombres.length); i++) elegidas.add(nombres[(inicio + i) % nombres.length]);
  return { completas: elegidas, cursor: (inicio + cuantas) % nombres.length };
}

/**
 * El canónico y el importador, preguntados al contenedor (no hace falta cliente de PostgreSQL en el host).
 *
 * El vocabulario de `ops.batch.estado` es el del importador: `validado` (lote aplicado y validado) y
 * `revertido` (lote deshecho a propósito). Un lote **sin `terminado_en`** es el que de verdad importa vigilar:
 * o está corriendo ahora mismo o se quedó a medias.
 */
async function leeCanonicoEImportador() {
  const salida = { canonico: { responde: false, detalle: 'no se pudo preguntar' }, importador: null };

  /*
   * Dos vías, por el mismo motivo que los contenedores: si el monitor corre DENTRO de un contenedor no tiene el
   * cliente de Docker ni el de PostgreSQL. En ese caso el `cron` del host deja la respuesta en
   * `estado/canonico.txt` (una línea por dato) y aquí sólo se lee. En el host, se pregunta directamente.
   */
  const fichero = process.env.FACYLF_CANONICO_TXT;
  try {
    let lineas;
    if (fichero) {
      lineas = readFileSync(fichero, 'utf8').trim().split('\n').map((l) => l.trim());
    } else {
      const { stdout } = await ejecuta('docker', ['exec', 'facylf-postgres', 'psql', '-U', 'facylf_admin', '-d', 'facylf', '-Atc',
        'select pg_size_pretty(pg_database_size(current_database())); '
        + 'select count(*) from ops.batch; '
        + "select count(*) from ops.batch where estado = 'validado'; "
        + 'select count(*) from ops.batch where terminado_en is null;'],
      { timeout: 60_000 });
      lineas = stdout.trim().split('\n').map((l) => l.trim());
    }
    const [tamano, lotes, validados, sinTerminar] = lineas;
    salida.canonico = { responde: true, tamano, lotes: Number(lotes) || 0, lotesValidados: Number(validados) || 0 };
    salida.importador = {
      lotes: Number(lotes) || 0,
      validados: Number(validados) || 0,
      sinTerminar: Number(sinTerminar) || 0,
      lotesFallidosSeguidos: 0,
    };
  } catch (error) {
    salida.canonico = { responde: false, detalle: error.message.slice(0, 200) };
  }
  return salida;
}

/** El disco donde viven las colas: sin disco se rompe lo único irrecuperable. */
async function leeDisco() {
  try {
    const { stdout } = await ejecuta('df', ['-k', '--output=size,avail', RAIZ], { timeout: 30_000 });
    const [total, libre] = stdout.trim().split('\n')[1].trim().split(/\s+/).map(Number);
    return { totalGb: Number((total / 1024 ** 2).toFixed(1)), libreGb: Number((libre / 1024 ** 2).toFixed(1)), libreProporcion: libre / total };
  } catch (error) {
    return { detalle: error.message.slice(0, 200) };
  }
}

async function instantanea() {
  const [contenedores, canonico] = await Promise.all([
    cronometra('docker stats', () => leeContenedores()),
    cronometra('postgres', () => leeCanonicoEImportador()),
  ]);
  const disco = await cronometra('disco', () => leeDisco());

  // La rotación de la lectura completa de colas: se guarda en disco para que cada vuelta continúe donde iba.
  const cache = leerJson(join(ESTADO, 'colas.json'), {});
  const cursor = Number(leerJson(join(ESTADO, 'colas-cursor.json'), { cursor: 0 }).cursor) || 0;
  const desde = new Date(Date.now() - UMBRALES.minutosVentanaFallos * 60_000).toISOString();
  const { completas, cursor: nuevoCursor } = rotacionDeColas(desde, cursor);

  const federaciones = await cronometra('colas', async () => leeFederaciones(desde, { completas, cache }));
  const nuevoCache = Object.fromEntries(federaciones.map((f) => [f.federacion, f]));
  mkdirSync(ESTADO, { recursive: true });
  writeFileSync(join(ESTADO, 'colas.json'), JSON.stringify(nuevoCache, null, 2), 'utf8');
  writeFileSync(join(ESTADO, 'colas-cursor.json'), JSON.stringify({ cursor: nuevoCursor }), 'utf8');

  return {
    cuando: new Date().toISOString(),
    rebanada: leeRebanada(),
    contenedores,
    federaciones,
    disco,
    ...canonico,
  };
}

/** Qué federaciones toca leer enteras en esta vuelta (4 por vuelta: cada cola, completa, cada ~5 minutos). */
function rotacionDeColas(desde, cursor) {
  let nombres = [];
  try {
    nombres = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
      .map((n) => n.replace('descargas-', ''))
      .filter((f) => existsSync(join(RAIZ, `descargas-${f}`, 'recolector-local', 'cola-v2.sqlite')))
      .sort();
  } catch { /* sin colas que leer */ }
  /*
   * Cuántas colas se leen enteras por vuelta. Medido en el PC con la flota a pleno rendimiento (21/09/2026):
   * con las colas frías —el equipo tiene 1,5 GB libres, así que sus 6,5 GB de SQLite no caben en caché—, releer
   * las 19 costaba 150 s. Con 3 por vuelta, cada vuelta mira tres colas completas y el resto lo reutiliza: la
   * flota entera queda releída cada ~7 minutos, que para «¿queda trabajo?» es de sobra. En el servidor, con 16 GB
   * y las colas calientes, esto es mucho más rápido.
   */
  const cuantas = Math.max(1, Number(process.env.FACYLF_COLAS_POR_VUELTA ?? 3));
  const paso = siguienteRotacion(nombres.map((federacion) => ({ federacion })), cursor, cuantas);
  return { completas: paso.completas, cursor: paso.cursor };
}

function leerJson(ruta, porDefecto) {
  try { return JSON.parse(readFileSync(ruta, 'utf8')); } catch { return porDefecto; }
}

/**
 * La última línea NO vacía de un fichero, leyendo sólo su final.
 *
 * Esto era lo que hacía lento al monitor: leer el registro entero de cada federación (`worker-programado.log`
 * llega a decenas de MB) para quedarse con su última línea costaba, con el disco apretado del PC, minutos entre
 * las 19 federaciones. Se leen los últimos 8 KB y punto.
 */
function ultimaLineaDe(ruta, bytes = 8192) {
  let descriptor;
  try {
    const tamano = statSync(ruta).size;
    if (tamano === 0) return null;
    const desde = Math.max(0, tamano - bytes);
    descriptor = openSync(ruta, 'r');
    const bufer = Buffer.alloc(Math.min(bytes, tamano));
    const leidos = readSync(descriptor, bufer, 0, bufer.length, desde);
    const lineas = bufer.subarray(0, leidos).toString('utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    // Si el trozo no empieza en el byte 0, su primera línea puede estar cortada: se descarta.
    return (desde > 0 ? lineas.slice(1) : lineas).pop()?.slice(0, 300) ?? null;
  } catch {
    return null;
  } finally {
    try { if (descriptor !== undefined) closeSync(descriptor); } catch { /* ya cerrado */ }
  }
}

async function avisa(alerta) {
  const texto = textoDeAlerta(alerta);
  try {
    await fetch(NTFY, {
      method: 'POST',
      headers: {
        Title: `facylf: ${alerta.titulo}`,
        Priority: alerta.nivel === 'critico' ? 'urgent' : (alerta.nivel === 'alto' ? 'high' : 'default'),
        Tags: alerta.nivel === 'critico' ? 'rotating_light' : 'warning',
      },
      body: texto,
    });
  } catch (error) {
    appendFileSync(join(ESTADO, 'alertas.log'), `${new Date().toISOString()}  no se pudo avisar por ntfy: ${error.message}\n`);
  }
  appendFileSync(join(ESTADO, 'alertas.log'), `${new Date().toISOString()}  [${alerta.nivel}] ${alerta.titulo} — ${alerta.detalle}\n`);
}

async function late(instantanea, alertas) {
  if (!KUMA) return;
  const parametros = new URLSearchParams({
    status: alertas.some((a) => a.nivel === 'critico') ? 'down' : 'up',
    msg: `${instantanea.contenedores.longitud ?? '?'} contenedores · `
      + `${instantanea.rebanada.memoriaGb ?? '?'} GB · ${alertas.length} avisos`,
  });
  try { await fetch(`${KUMA}?${parametros}`, { method: 'GET' }); } catch { /* si Kuma no está, no pasa nada */ }
}

function imprime(instantanea, alertas) {
  const r = instantanea.rebanada;
  console.log(`═══ facylf · ${instantanea.cuando}`);
  console.log(`  memoria: ${r.memoriaGb ?? '?'} GB de ${r.topeGb} GB (pico ${r.picoGb ?? '?'} GB)`
    + `${r.oomKills ? ` · OOM KILLS: ${r.oomKills}` : ''}`
    + ` · contenedores: ${instantanea.contenedores.longitud ?? '?'} (${instantanea.contenedores.totalGb ?? '?'} GB)`);
  console.log(`  disco: ${instantanea.disco.libreGb ?? '?'} GB libres · canónico: `
    + `${instantanea.canonico.responde ? `${instantanea.canonico.tamano}, ${instantanea.canonico.lotes} lotes` : 'NO RESPONDE'}`);
  console.log('  federación            estado      pidiendo  fallos  pendientes  disp.  min.sin.pedir');
  for (const f of instantanea.federaciones) {
    console.log(`  ${f.federacion.padEnd(20)} ${String(f.estado).padEnd(11)} ${String(f.peticionesVentana).padStart(8)}`
      + ` ${String(f.fallosVentana).padStart(7)} ${String(f.pendientes).padStart(11)} ${String(f.disponibles).padStart(6)}`
      + ` ${String(f.minutosSinPedir ?? '—').padStart(13)}`);
  }
  if (alertas.length) {
    console.log(`\n  ⚠ ${alertas.length} aviso(s):`);
    for (const a of alertas) console.log(`    [${a.nivel}] ${a.titulo}: ${a.detalle}`);
  } else {
    console.log('\n  sin avisos');
  }
}

async function unaVuelta(estadoPrevio) {
  const datos = await instantanea();
  const { alertas, estado } = decideAlertas(datos, estadoPrevio);
  mkdirSync(ESTADO, { recursive: true });
  writeFileSync(join(ESTADO, 'facylf.json'), JSON.stringify(datos, null, 2), 'utf8');
  appendFileSync(join(ESTADO, 'historial.jsonl'), `${JSON.stringify(lineaDeHistorial(datos))}\n`, 'utf8');
  writeFileSync(join(ESTADO, 'alertas-estado.json'), JSON.stringify(estado, null, 2), 'utf8');
  if (!sinAvisos) { for (const alerta of alertas) await avisa(alerta); }
  await late(datos, alertas);
  if (soloJson) console.log(JSON.stringify(datos, null, 2)); else imprime(datos, alertas);
  return estado;
}

async function main() {
  mkdirSync(ESTADO, { recursive: true });
  let estadoPrevio = { claves: {} };
  try { estadoPrevio = JSON.parse(readFileSync(join(ESTADO, 'alertas-estado.json'), 'utf8')); } catch { /* primera vuelta */ }

  if (unaVez) { await unaVuelta(estadoPrevio); return; }
  for (;;) {
    try { estadoPrevio = await unaVuelta(estadoPrevio); } catch (error) {
      // Un fallo del monitor no puede tumbar la vigilancia: se anota y se sigue.
      appendFileSync(join(ESTADO, 'alertas.log'), `${new Date().toISOString()}  error del monitor: ${error.message}\n`);
      console.error(`error del monitor: ${error.message}`);
    }
    await dormir(cadaSeg * 1000);
  }
}

await main();
