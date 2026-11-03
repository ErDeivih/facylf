#!/usr/bin/env node
/**
 * ENLACE PARA CLAUDE — deja cada 10 minutos una foto del PC y del servidor en `estado/claude/`, y ejecuta
 * las consultas que Claude haya dejado en `estado/claude/peticiones/`.
 *
 * Por qué existe: Claude trabaja desde un entorno que ve la carpeta del proyecto pero NO llega a la red de
 * casa (ni ssh al servidor ni los procesos de Windows). Este guion, lanzado por el Programador de tareas del
 * PC, hace de puente: el PC sí llega a todo, y deja el resultado en ficheros que Claude lee.
 *
 * Qué hace en cada pasada (una sola vez y termina; la repetición la pone la tarea):
 *   1. `estado/claude/pc.txt`        · memoria, procesos node/chrome, tareas FACyLF, registros y colas del PC.
 *   2. `estado/claude/servidor.txt`  · la foto de scripts/servidor/foto-para-revision.sh (sólo lee).
 *   3. `estado/claude/peticiones/*.sh`  → se ejecutan EN EL SERVIDOR; `*.ps1` → en el PC. La salida va a
 *      `estado/claude/respuestas/<nombre>.txt` y la petición pasa a `peticiones/hechas/`.
 *      Salvaguarda: sólo se ejecuta una petición cuya primera línea con texto sea `# claude: solo-lectura`
 *      (o `<# claude: solo-lectura #>` en PowerShell). Lo que cambia cosas lo lanza David a mano.
 *
 * Sin comillas de PowerShell de por medio: node llama a ssh/scp con los argumentos en lista.
 * Uso a mano: node scripts/claude/enlace-claude.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, statfsSync, writeFileSync, unlinkSync } from 'node:fs';
import { hostname, freemem, totalmem, uptime } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(RAIZ, 'estado', 'claude');
const PETICIONES = join(DIR, 'peticiones');
const HECHAS = join(PETICIONES, 'hechas');
const RESPUESTAS = join(DIR, 'respuestas');
const ALIAS = process.env.FACYLF_SSH_ALIAS || 'servidor';
for (const d of [DIR, PETICIONES, HECHAS, RESPUESTAS]) mkdirSync(d, { recursive: true });

// Un cerrojo sencillo: si la pasada anterior sigue viva (ssh colgado), ésta no se solapa.
const CERROJO = join(DIR, '.en-curso');
if (existsSync(CERROJO) && Date.now() - statSync(CERROJO).mtimeMs < 35 * 60_000) process.exit(0);
writeFileSync(CERROJO, String(process.pid));

function ejecuta(orden, args, { timeoutMs = 120_000, entrada = null } = {}) {
  return new Promise((listo) => {
    let salida = '';
    let hijo;
    try { hijo = spawn(orden, args, { windowsHide: true, stdio: [entrada ? 'pipe' : 'ignore', 'pipe', 'pipe'] }); }
    catch (e) { listo({ codigo: -1, salida: `no se pudo lanzar ${orden}: ${e.message}` }); return; }
    // Al cortar se mata el ÁRBOL entero (powershell → node…): matando sólo al padre, el nieto seguía vivo con
    // las tuberías abiertas, «close» no llegaba nunca y la pasada entera se quedaba colgada (01/10/2026).
    let resuelto = false;
    const fin = (r) => { if (!resuelto) { resuelto = true; listo(r); } };
    const reloj = setTimeout(() => {
      salida += `\n[cortado a los ${timeoutMs / 1000} s]`;
      try {
        if (process.platform === 'win32') spawn('taskkill', ['/PID', String(hijo.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        else hijo.kill('SIGKILL');
      } catch {}
      setTimeout(() => fin({ codigo: -2, salida }), 10_000);
    }, timeoutMs);
    hijo.stdout.on('data', (d) => { salida += d.toString('utf8'); });
    hijo.stderr.on('data', (d) => { salida += d.toString('utf8'); });
    if (entrada) { hijo.stdin.end(entrada); }
    hijo.on('error', (e) => { clearTimeout(reloj); fin({ codigo: -1, salida: `${salida}\n${e.message}` }); });
    hijo.on('close', (codigo) => { clearTimeout(reloj); fin({ codigo, salida }); });
  });
}

const SSH = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10'];
/** Ejecuta un .sh en el servidor: se sube a /tmp (quitando CR) y se lanza con bash. */
async function enServidor(rutaSh, timeoutMs = 240_000) {
  const destino = `/tmp/claude-${basename(rutaSh).replace(/[^\w.-]/g, '_')}`;
  const contenido = readFileSync(rutaSh, 'utf8').replace(/\r/g, '');
  // Se pasa por la entrada estándar: sin scp y sin ficheros intermedios con CRLF.
  const r = await ejecuta('ssh', [...SSH, ALIAS, `cat > ${destino} && bash ${destino}; rm -f ${destino}`],
    { timeoutMs, entrada: contenido });
  return r;
}

function powershell(comando, timeoutMs = 60_000) {
  return ejecuta('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${comando}`], { timeoutMs });
}

function cola(ruta, n = 3) {
  try {
    const t = readFileSync(ruta, 'utf8');
    return t.slice(-4000).split(/\r?\n/).filter(Boolean).slice(-n).map((l) => l.slice(0, 220));
  } catch { return []; }
}
const hora = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(5, 16);

async function fotoPc() {
  const l = [];
  l.push(`════ PC ${hostname()} · ${new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })} ════`);
  l.push(`encendido ${Math.round(uptime() / 3600)} h · memoria libre ${(freemem() / 2 ** 30).toFixed(1)} de ${(totalmem() / 2 ** 30).toFixed(1)} GB`);
  const procesos = await powershell(`Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'node.exe','chrome.exe' } | ` +
    `Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,CreationDate,CommandLine | ConvertTo-Json -Depth 2 -Compress`);
  try {
    const lista = [].concat(JSON.parse(procesos.salida.trim() || '[]'));
    const chrome = lista.filter((p) => p.Name === 'chrome.exe');
    const nodo = lista.filter((p) => p.Name === 'node.exe');
    const deChromedriver = chrome.filter((p) => /--remote-debugging|--test-type|automation/i.test(p.CommandLine ?? ''));
    l.push(`chrome: ${chrome.length} procesos (${deChromedriver.length} de automatización) · ` +
      `${Math.round(chrome.reduce((s, p) => s + (p.WorkingSetSize ?? 0), 0) / 2 ** 20)} MB`);
    l.push(`node: ${nodo.length} procesos`);
    for (const p of nodo) {
      const cmd = String(p.CommandLine ?? '').replace(/"/g, '').replace(/\s+/g, ' ');
      l.push(`  ${String(p.ProcessId).padStart(6)} ${String(Math.round((p.WorkingSetSize ?? 0) / 2 ** 20)).padStart(5)} MB  ${cmd.slice(0, 200)}`);
    }
  } catch { l.push(`procesos: no se pudieron leer (${procesos.salida.slice(0, 300)})`); }

  const tareas = await powershell(`Get-ScheduledTask -TaskName 'FACyLF*' | ForEach-Object { $i = $_ | Get-ScheduledTaskInfo; ` +
    `'{0}|{1}|{2}|{3}|{4}' -f $_.TaskName, $_.State, $i.LastRunTime.ToString('MM-dd HH:mm'), $i.LastTaskResult, $i.NextRunTime }`);
  l.push('', '── tareas programadas FACyLF (nombre | estado | última | resultado | siguiente) ──');
  for (const x of tareas.salida.split(/\r?\n/).filter(Boolean)) l.push(`  ${x}`);

  l.push('', '── recolectores del PC: última escritura de la cola y últimas líneas del registro ──');
  for (const d of readdirSync(RAIZ).filter((n) => n.startsWith('descargas-')).sort()) {
    const base = join(RAIZ, d, 'recolector-local');
    const wal = join(base, 'cola-v2.sqlite-wal');
    const log = join(base, 'worker-programado.log');
    if (!existsSync(log) && !existsSync(wal)) continue;
    const mWal = existsSync(wal) ? statSync(wal).mtimeMs : null;
    const mLog = existsSync(log) ? statSync(log).mtimeMs : null;
    if (Math.max(mWal ?? 0, mLog ?? 0) < Date.now() - 3 * 86_400_000) continue; // parada hace días: fuera
    l.push(`${d.replace('descargas-', '').padEnd(20)} cola ${mWal ? hora(mWal) : '—'} · registro ${mLog ? hora(mLog) : '—'}`);
    for (const x of cola(log, 3)) l.push(`    ${x}`);
  }
  const dirMulti = join(RAIZ, 'descargas-multideporte');
  if (existsSync(dirMulti)) {
    l.push('', '── recolectores multideporte (última línea de cada uno) ──');
    for (const a of readdirSync(dirMulti)) {
      const log = join(dirMulti, a, 'registro.log');
      if (!existsSync(log)) continue;
      l.push(`${a.padEnd(20)} registro ${hora(statSync(log).mtimeMs)}`);
      for (const x of cola(log, 2)) l.push(`    ${x}`);
      // Recuento de su cola (desde Windows sí se puede leer la SQLite en uso; desde fuera, no).
      const r = await ejecuta(process.execPath, [join(RAIZ, 'scripts', 'multideporte', 'recolector-multideporte.mjs'), 'estado', '--adaptador', a], { timeoutMs: 30_000 });
      try {
        const e = JSON.parse(r.salida.slice(r.salida.indexOf('{')));
        const porTipo = e.porEstado.map((x) => `${x.tipo}:${x.estado}=${x.n}`).join(' ');
        l.push(`    registros ${e.registros.map((x) => `${x.tipo}=${x.n}`).join(' ') || '—'} · peticiones hoy ${e.peticionesHoy}${e.pausa ? ` · PAUSA hasta ${e.pausa}` : ''}`);
        l.push(`    páginas ${porTipo}`);
        const errores = Object.entries(e.errores ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 5);
        if (errores.length) l.push(`    errores ${errores.map(([k, n]) => `${k} (${n})`).join(' | ')}`);
      } catch { l.push(`    (estado ilegible: ${r.salida.slice(0, 160)})`); }
    }
  }
  writeFileSync(join(DIR, 'pc.txt'), l.join('\n') + '\n');
}

/*
 * ── VIGÍA DE LAS COLAS (22/10/2026) ──────────────────────────────────────────────────────────────────────────
 * En cada pasada se mide la salud de cada cola en las DOS máquinas con `scripts/vigia-colas.mjs` (sólo lee) y se
 * evalúa aquí, en el PC: así los avisos (nuevo / sigue / resuelto) y el canal de alertas viven en un solo sitio.
 * En el servidor no hace falta desplegar nada: los dos ficheros se pasan por la entrada estándar al contenedor
 * monitor (que ve /app entero) y se ejecutan desde /tmp.
 */
async function vigia() {
  const guion = join(RAIZ, 'scripts', 'vigia-colas.mjs');
  if (!existsSync(guion)) return;
  const local = await ejecuta(process.execPath, [guion, '--maquina', 'pc'], { timeoutMs: 300_000 });
  // El servidor va justo de CPU: allí se mide como mucho cada 25 min (tarda ~2 min con nice 19); en el PC, siempre.
  const rutaMetricas = join(RAIZ, 'estado', 'vigia', 'servidor-metricas.json');
  if (existsSync(rutaMetricas) && Date.now() - statSync(rutaMetricas).mtimeMs < 25 * 60_000) {
    const previo = existsSync(join(RAIZ, 'estado', 'vigia', 'servidor.txt')) ? readFileSync(join(RAIZ, 'estado', 'vigia', 'servidor.txt'), 'utf8') : '';
    writeFileSync(join(DIR, 'vigia.txt'), `${local.salida.trim()}\n\n${previo.trim()}\n`);
    return;
  }
  const lib = readFileSync(join(RAIZ, 'scripts', 'lib', 'vigia-colas.mjs'), 'utf8').replace(/\r/g, '');
  const principal = readFileSync(guion, 'utf8').replace(/\r/g, '');
  const sh = [
    "docker exec -i facylf-monitor sh -c 'mkdir -p /tmp/vigia/lib && cat > /tmp/vigia/lib/vigia-colas.mjs' <<'FIN_VIGIA_LIB'",
    lib, 'FIN_VIGIA_LIB',
    "docker exec -i facylf-monitor sh -c 'cat > /tmp/vigia/vigia-colas.mjs' <<'FIN_VIGIA_GUION'",
    principal, 'FIN_VIGIA_GUION',
    'docker exec -e FACYLF_RAIZ=/app -e FACYLF_TEMPORADA_MINIMA=2010-11 facylf-monitor timeout 250 nice -n 19 node --no-warnings /tmp/vigia/vigia-colas.mjs --solo-medir --maquina servidor',
  ].join('\n');
  const tmp = join(DIR, '.vigia-servidor.sh');
  writeFileSync(tmp, sh);
  const r = await enServidor(tmp, 300_000);
  let textoServidor = `vigía del servidor: no se pudo medir (código ${r.codigo}): ${r.salida.slice(0, 300)}`;
  const i = r.salida.indexOf('{"maquina"');
  if (i >= 0) {
    const ruta = join(RAIZ, 'estado', 'vigia', 'servidor-metricas.json');
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, r.salida.slice(i).trim());
    const ev = await ejecuta(process.execPath, [guion, '--desde', ruta, '--maquina', 'servidor'], { timeoutMs: 120_000 });
    textoServidor = ev.salida;
  }
  writeFileSync(join(DIR, 'vigia.txt'), `${local.salida.trim()}\n\n${textoServidor.trim()}\n`);
}

/**
 * «El servidor no contesta» (ESTADO-OPERACION-2026-10-25 §4.5, apuntado a Claude): si las métricas del servidor llevan
 * más de 60 min sin renovarse (se renuevan cada ~30), se apunta un CRÍTICO en estado/vigia/alertas.log (y en servidor-ausente.json), una vez
 * al abrirse y otra al resolverse. Así el vigía avisa también de la máquina ausente, no sólo de sus federaciones.
 * Claude, 26/10/2026.
 */
function vigilaServidorAusente() {
  const metricas = join(RAIZ, 'estado', 'vigia', 'servidor-metricas.json');
  const estado = join(RAIZ, 'estado', 'vigia', 'servidor-ausente.json');   // propio: vigia-colas reescribe servidor-estado.json
  const log = join(RAIZ, 'estado', 'vigia', 'alertas.log');
  const minutos = existsSync(metricas) ? Math.round((Date.now() - statSync(metricas).mtimeMs) / 60_000) : 9999;
  let actual = {};
  try { actual = JSON.parse(readFileSync(estado, 'utf8')); } catch { actual = {}; }
  const clave = 'servidor|sin_datos';
  const ahora = new Date().toISOString();
  const linea = (txt) => { try { writeFileSync(log, `${ahora.slice(0, 16)}  ${txt}\n`, { flag: 'a' }); } catch {} };
  if (minutos > 60) {
    const texto = `el servidor no ha dado métricas desde hace ${minutos} min (¿apagado, sin red o ssh colgado?)`;
    if (!actual[clave]) linea(`NUEVO     CRÍTICO servidor/máquina sin_datos — ${texto}`);
    actual[clave] = { primeraVez: actual[clave]?.primeraVez ?? ahora, ultimoAviso: ahora, nivel: 'critico', texto };
  } else if (actual[clave]) {
    linea(`RESUELTO          servidor/máquina sin_datos (desde ${actual[clave].primeraVez})`);
    delete actual[clave];
  } else return;
  writeFileSync(estado, JSON.stringify(actual, null, 2));
}

/** Disco del PC donde viven el repositorio y las colas (30/10/2026: F: llegó a 5,3 GB libres). Aviso por debajo de 15 GB. */
function vigilaDiscoPc() {
  const s = statfsSync(RAIZ);
  const libres = (s.bavail * s.bsize) / 1024 ** 3;
  const estado = join(RAIZ, 'estado', 'vigia', 'pc-disco.json');
  const log = join(RAIZ, 'estado', 'vigia', 'alertas.log');
  let previo = null;
  try { previo = JSON.parse(readFileSync(estado, 'utf8')); } catch { previo = null; }
  const ahora = new Date().toISOString();
  const mal = libres < 15;
  if (mal && !previo?.abierta) writeFileSync(log, `${ahora.slice(0, 16)}  NUEVO     ${libres < 5 ? 'CRÍTICO' : 'aviso  '} pc/máquina disco — ${libres.toFixed(1)} GB libres en el disco del repositorio y las colas (umbral 15 GB)\n`, { flag: 'a' });
  if (!mal && previo?.abierta) writeFileSync(log, `${ahora.slice(0, 16)}  RESUELTO          pc/máquina disco (${libres.toFixed(1)} GB libres)\n`, { flag: 'a' });
  writeFileSync(estado, JSON.stringify({ abierta: mal, libresGb: Number(libres.toFixed(1)), medido: ahora }, null, 2));
}

async function fotoServidor() {
  const r = await enServidor(join(RAIZ, 'scripts', 'servidor', 'foto-para-revision.sh'));
  writeFileSync(join(DIR, 'servidor.txt'),
    `PC ${new Date().toISOString()} → ${ALIAS} · código ${r.codigo}\n${r.salida}`);
}

function esSoloLectura(ruta) {
  const primera = readFileSync(ruta, 'utf8').split(/\r?\n/).map((x) => x.trim())
    .find((x) => x && !x.startsWith('#!'));
  return /^(#|<#)\s*claude:\s*solo-lectura/i.test(primera ?? '');
}

async function peticiones() {
  for (const n of readdirSync(PETICIONES).filter((x) => /\.(sh|ps1)$/.test(x)).sort()) {
    const ruta = join(PETICIONES, n);
    const destino = join(RESPUESTAS, n.replace(/\.(sh|ps1)$/, '.txt'));
    const cabecera = `${n} · ${new Date().toISOString()}\n`;
    if (!esSoloLectura(ruta)) {
      writeFileSync(destino, `${cabecera}NO EJECUTADA: falta la marca «claude: solo-lectura» en la primera línea.\n`);
    } else {
      const r = n.endsWith('.sh')
        ? await enServidor(ruta, 600_000)
        : await ejecuta('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ruta], { timeoutMs: 15 * 60_000 });
      writeFileSync(destino, `${cabecera}código ${r.codigo}\n${r.salida}`);
    }
    renameSync(ruta, join(HECHAS, `${Date.now()}-${n}`));
  }
}

try {
  // Primero las peticiones (Claude suele estar esperando su respuesta); luego las fotos.
  await peticiones().catch((e) => writeFileSync(join(DIR, 'error-peticiones.txt'), String(e?.stack ?? e)));
  await fotoPc().catch((e) => writeFileSync(join(DIR, 'pc.txt'), `error: ${e?.stack ?? e}\n`));
  await fotoServidor().catch((e) => writeFileSync(join(DIR, 'servidor.txt'), `error: ${e?.stack ?? e}\n`));
  await vigia().catch((e) => writeFileSync(join(DIR, 'vigia.txt'), `error del vigía: ${e?.stack ?? e}\n`));
  try { vigilaServidorAusente(); } catch (e) { writeFileSync(join(DIR, 'error-ausente.txt'), String(e?.stack ?? e)); }
  try { vigilaDiscoPc(); } catch (e) { writeFileSync(join(DIR, 'error-disco.txt'), String(e?.stack ?? e)); }
  writeFileSync(join(DIR, 'ultima-pasada.txt'), new Date().toISOString() + '\n');
} finally {
  try { unlinkSync(CERROJO); } catch {}
}
