#!/usr/bin/env node
/*
 * ── SUPERVISOR ÚNICO DE LA FLOTA EN EL PC ──────────────────────────────────────────────────────────────
 *
 * Sustituye a las 19 cadenas de Windows que sostenían la flota en este equipo:
 *
 *     antes:  Programador → wscript → powershell → cmd → node   (× 19 federaciones)
 *     ahora:  Programador → wscript → node                      (× 1, con 19 hijos)
 *
 * El motivo está medido: esas cadenas costaban 18 `wscript` (464 MB residentes), 20 `powershell` (671 MB
 * residentes, 1 454 MB privados) y 19 `cmd`; más de un giga **para lanzar** la flota, más que todos los
 * navegadores juntos y sin recolectar nada. Aquí las 19 federaciones se lanzan desde un solo proceso que
 * ocupa ~60 MB.
 *
 * LO QUE NO CAMBIA, Y ES LO IMPORTANTE:
 *
 *   · cada federación sigue con SU guion, SUS argumentos, SU cola y SU carpeta de estado;
 *   · sigue habiendo una sola instancia viva por federación (comprobación de worker ajeno);
 *   · se limpian los mismos navegadores huérfanos y las mismas cachés antes de arrancar;
 *   · la espera tras cada tanda se calcula con los mismos guiones (`proximo-trabajo.mjs`,
 *     `contar-pendientes.mjs`) y con la ventana de cada federación (Madrid topaba en 5 min, no en 1 h);
 *   · los registros van a los MISMOS ficheros `worker-programado.log` y con el mismo formato;
 *   · el entorno (`FACYLF_MEMORIA_GB`, `FACYLF_RESERVA_GB`, `FACYLF_TURNO_PLAZA_MIN`, `FACYLF_CHROME_HEADLESS`)
 *     se lee de `scripts/entorno-flota.ps1`, la misma fuente de verdad que usaban los supervisores.
 *
 * ── POR QUÉ SE ABRE EL REGISTRO UNA SOLA VEZ ───────────────────────────────────────────────────────────
 *
 * Los supervisores antiguos dejaban que `cmd` abriera el `worker-programado.log` para redirigir ahí la salida
 * del worker. Medido el 21/09/2026: mientras el worker corre, ese fichero queda **bloqueado** y cualquier
 * intento de añadir una línea desde fuera falla con `EBUSY`. Por eso aquí se abre UNA vez por federación, se
 * mantiene abierto todo el rato y se usa el mismo descriptor para las líneas del supervisor y para la salida
 * del hijo. Si el registro está en uso (por ejemplo, porque el supervisor antiguo sigue vivo durante la
 * migración) no se fuerza nada: se espera y se reintenta.
 *
 * La lógica de decisión vive en `lib/plan-flota.mjs` (puro y probado). Aquí sólo se ejecuta.
 *
 * Uso:  node scripts/supervisor-flota.mjs [--una-vuelta] [--federacion <nombre>]
 */
import { execFile, spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, writeSync, unlinkSync } from 'node:fs';
import { EOL } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import {
  planDeFederaciones, esperaTrasTanda, entornoParaHijos, lineaDeRegistro,
  huerfanosDeFederacion, conDescendientes, workerAjeno, supervisorAntiguoVivo, nombreLegible,
} from './lib/plan-flota.mjs';
import { configuracionFlotaLocal } from './lib/configuracion-flota.mjs';

const ejecuta = promisify(execFile);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
const CANDADO = join(RAIZ, '.supervisor-flota.lock');
const REGISTRO = join(RAIZ, 'registros', 'supervisor-flota.log');

const argumentos = process.argv.slice(2);
const unaVuelta = argumentos.includes('--una-vuelta');
const soloFederacion = (() => {
  const i = argumentos.indexOf('--federacion');
  return i >= 0 ? argumentos[i + 1] : null;
})();

const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));

function anota(mensaje) {
  const linea = lineaDeRegistro(mensaje);
  try {
    mkdirSync(dirname(REGISTRO), { recursive: true });
    appendFileSync(REGISTRO, `${linea}${EOL}`, 'utf8');
  } catch { /* si no se puede escribir el registro propio, la flota sigue igual */ }
  console.log(linea);
}

/** El flujo de registro de una federación: un descriptor abierto una vez y compartido con el hijo. */
function flujoDe(entrada) {
  const registro = join(RAIZ, entrada.carpeta, 'worker-programado.log');
  mkdirSync(dirname(registro), { recursive: true });
  return { registro, fd: null };
}

/** Escribe una línea del supervisor en el registro de la federación (sin volver a abrir el fichero). */
function anotaEn(flujo, mensaje) {
  if (flujo.fd === null) return;
  try {
    writeSync(flujo.fd, `${lineaDeRegistro(mensaje)}${EOL}`);
  } catch (error) {
    anota(`No se pudo escribir en ${flujo.registro}: ${error.message}`);
  }
}

/** Abre el registro de la federación si aún no lo está. Devuelve `false` si está en uso por otro proceso. */
function abreRegistro(flujo) {
  if (flujo.fd !== null) return true;
  try {
    flujo.fd = openSync(flujo.registro, 'a');
    return true;
  } catch {
    return false;
  }
}

/**
 * La lista de procesos del equipo, con caché.
 *
 * Antes la consultaba cada supervisor de PowerShell por su cuenta, en bucle. Aquí se pide una vez cada 30 s
 * como mucho y sólo cuando hay que decidir algo: un `powershell` efímero de vez en cuando en lugar de 20
 * permanentes.
 *
 * Si la consulta falla se devuelve `null` y quien llama ESPERA: no poder comprobar si hay un worker ajeno no
 * puede convertirse en lanzar un duplicado.
 */
let cacheProcesos = { cuando: 0, procesos: null };
async function leeProcesos(maxEdadMs = 30_000) {
  const ahora = Date.now();
  if (cacheProcesos.procesos && ahora - cacheProcesos.cuando < maxEdadMs) return cacheProcesos.procesos;
  try {
    const { stdout } = await ejecuta('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress',
    ], { maxBuffer: 96 * 1024 * 1024, timeout: 60_000, windowsHide: true });
    const datos = JSON.parse(stdout.trim() || '[]');
    const procesos = Array.isArray(datos) ? datos : [datos];
    cacheProcesos = { cuando: ahora, procesos };
    return procesos;
  } catch (error) {
    anota(`No se pudo leer la lista de procesos (${error.message}); se espera en vez de arriesgar un duplicado.`);
    cacheProcesos = { cuando: ahora, procesos: null };
    return null;
  }
}

/** Retira los procesos indicados; devuelve cuántos se pudieron cerrar. */
function retiraProcesos(ids) {
  let cerrados = 0;
  for (const id of ids) {
    try { process.kill(id); cerrados += 1; } catch { /* ya no estaba */ }
  }
  return cerrados;
}

/**
 * La limpieza previa, la misma que hacían los supervisores de PowerShell: navegadores huérfanos de SU perfil
 * (nunca de otra federación, nunca del usuario) y las cachés recreables del perfil.
 */
function limpia(entrada, procesos, flujo) {
  const raices = huerfanosDeFederacion(entrada, procesos);
  if (raices.length) {
    const cerrados = retiraProcesos(conDescendientes(raices, procesos));
    anotaEn(flujo, `Se cerraron ${cerrados} procesos huerfanos del navegador del recolector.`);
  }

  if (entrada.limpieza !== 'pnfg') return;
  const perfil = join(RAIZ, entrada.carpeta, 'perfil-chrome');
  for (const relativa of ['Default/Cache', 'Default/Code Cache', 'Default/GPUCache', 'GrShaderCache', 'ShaderCache']) {
    const ruta = join(perfil, relativa);
    if (!ruta.startsWith(perfil)) continue;
    try { rmSync(ruta, { recursive: true, force: true }); } catch { /* en uso o inexistente */ }
  }
}

/** La espera que pide el guion de planificación de esta federación (o nada si no contesta). */
async function consultaEspera(entrada, entorno) {
  const guion = join(RAIZ, entrada.espera.guion);
  const baseDatos = join(RAIZ, entrada.carpeta, 'cola-v2.sqlite');
  if (!existsSync(guion) || !existsSync(baseDatos)) return null;
  try {
    const { stdout } = await ejecuta(NODE, [guion, baseDatos], { timeout: 60_000, windowsHide: true, env: entorno });
    return String(stdout).split(/\r?\n/)[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Lanza un paso del recolector y espera a que termine, con su salida en el registro de la federación. */
function lanza(entrada, paso, contexto, flujo) {
  return new Promise((terminado) => {
    const hijo = spawn(NODE, [join(RAIZ, entrada.guion), ...paso], {
      cwd: RAIZ, env: contexto.entorno, windowsHide: true, stdio: ['ignore', flujo.fd, flujo.fd],
    });
    contexto.hijos.add(hijo.pid);
    anotaEn(flujo, `[supervisor] pid ${hijo.pid}: ${entrada.guion} ${paso.join(' ')}`);
    hijo.on('error', (error) => {
      anotaEn(flujo, `[supervisor] no se pudo lanzar: ${error.message}`);
      contexto.hijos.delete(hijo.pid);
      terminado(null);
    });
    hijo.on('close', (codigo) => {
      contexto.hijos.delete(hijo.pid);
      terminado(codigo);
    });
  });
}

/** El bucle de UNA federación: comprobar, abrir el registro, limpiar, lanzar, esperar y repetir. */
async function vigilaFederacion(entrada, contexto) {
  const flujo = flujoDe(entrada);
  contexto.flujos.add(flujo);
  let presentado = false;

  while (!contexto.parando) {
    const procesos = await leeProcesos();
    if (!procesos) { await dormir(60_000); continue; }

    const antiguo = supervisorAntiguoVivo(entrada, procesos);
    if (antiguo) {
      // Durante la migración el registro lo tiene abierto el supervisor viejo: no se toca nada todavía.
      if (abreRegistro(flujo)) {
        if (!presentado) { anotaEn(flujo, `Supervisor iniciado (federacion ${nombreLegible(entrada.federacion)}) .`); presentado = true; }
        anotaEn(flujo, `Sigue vivo el supervisor antiguo (PID ${antiguo.ProcessId}); se espera para no duplicarlo.`);
      }
      await dormir(60_000);
      continue;
    }

    const ajeno = workerAjeno(entrada, procesos, contexto.hijos);
    if (ajeno) {
      if (abreRegistro(flujo)) {
        if (!presentado) { anotaEn(flujo, `Supervisor iniciado (federacion ${nombreLegible(entrada.federacion)}) .`); presentado = true; }
        anotaEn(flujo, `Ya hay un worker activo (PID ${ajeno.ProcessId}); se espera para no duplicarlo.`);
      }
      await dormir(60_000);
      continue;
    }

    if (!abreRegistro(flujo)) {
      anota(`El registro de ${entrada.federacion} está en uso por otro proceso; se reintenta en 60 s.`);
      await dormir(60_000);
      continue;
    }
    if (!presentado) { anotaEn(flujo, `Supervisor iniciado (federacion ${nombreLegible(entrada.federacion)}) .`); presentado = true; }

    limpia(entrada, procesos, flujo);

    for (const paso of [entrada.pasoPrevio, entrada.argumentos]) {
      if (!paso) continue;
      await lanza(entrada, paso, contexto, flujo);
      if (contexto.parando) return;
    }

    const espera = esperaTrasTanda(entrada.espera, await consultaEspera(entrada, contexto.entorno));
    anotaEn(flujo, `El worker termino; siguiente intento en ${espera.segundos} s (${espera.motivo}).`);
    if (unaVuelta) return;
    await dormir(espera.segundos * 1000);
  }
}

/** Un solo supervisor: si ya hay otro vivo, esta copia termina sin tocar nada. */
function tomaElCandado() {
  try {
    if (existsSync(CANDADO)) {
      const previo = JSON.parse(readFileSync(CANDADO, 'utf8'));
      if (previo?.pid && previo.pid !== process.pid) {
        try {
          process.kill(previo.pid, 0);
          anota(`Ya hay un supervisor de la flota vivo (PID ${previo.pid}); esta copia termina.`);
          return false;
        } catch { /* el proceso anterior ya no existe: el candado quedó viejo */ }
      }
    }
    writeFileSync(CANDADO, JSON.stringify({ pid: process.pid, iniciado: new Date().toISOString() }), 'utf8');
    return true;
  } catch (error) {
    anota(`No se pudo tomar el candado del supervisor (${error.message}); se sigue con una sola copia.`);
    return true;
  }
}

function sueltaElCandado() {
  try {
    const previo = JSON.parse(readFileSync(CANDADO, 'utf8'));
    if (previo?.pid === process.pid) unlinkSync(CANDADO);
  } catch { /* nada que soltar */ }
}

async function main() {
  if (!tomaElCandado()) process.exit(0);

  const configuracion = configuracionFlotaLocal(RAIZ);
  const entorno = entornoParaHijos(configuracion);
  let plan = planDeFederaciones({ excluidas: configuracion.excluidas });
  if (soloFederacion) plan = plan.filter((e) => e.federacion === soloFederacion);
  if (!plan.length) {
    anota(`No hay ninguna federación que se llame «${soloFederacion}» en el plan.`);
    process.exit(1);
  }

  const contexto = { entorno, hijos: new Set(), flujos: new Set(), parando: false };
  anota(`Supervisor unico de la flota: ${plan.length} federaciones, ${configuracion.memoriaGb} GB declarados`
    + ` (${configuracion.origen}), reserva ${configuracion.reservaGb} GB, turno ${configuracion.turnoMin} min`
    + `${configuracion.chromeHeadless ? `, headless ${configuracion.chromeHeadless}` : ''}`
    + `${configuracion.excluidas?.length ? ` · excluidas (las recolecta el servidor): ${configuracion.excluidas.join(', ')}` : ''}.`);

  const para = (senal) => {
    if (contexto.parando) return;
    anota(`Señal ${senal}: se cierran los recolectores hijos y los registros.`);
    contexto.parando = true;
    for (const pid of contexto.hijos) { try { process.kill(pid); } catch { /* ya no estaba */ } }
    for (const flujo of contexto.flujos) { if (flujo.fd !== null) { try { closeSync(flujo.fd); } catch { /* ya cerrado */ } } }
    sueltaElCandado();
    process.exit(0);
  };
  process.on('SIGINT', () => para('SIGINT'));
  process.on('SIGTERM', () => para('SIGTERM'));

  await Promise.all(plan.map((entrada) => vigilaFederacion(entrada, contexto)));

  contexto.parando = true;
  for (const flujo of contexto.flujos) { if (flujo.fd !== null) { try { closeSync(flujo.fd); } catch { /* ya cerrado */ } } }
  sueltaElCandado();
  anota('Supervisor unico de la flota: terminado.');
}

/*
 * Arranque sólo si se ejecuta como programa (y no al importarlo desde una prueba). Se compara con
 * `pathToFileURL` porque en Windows la ruta lleva la letra de unidad y las barras invertidas: montar la URL
 * a mano (`file://` + ruta) no coincide con `import.meta.url` y `main()` no llegaría a ejecutarse.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
