#!/usr/bin/env node
/*
 * ── TRASPASAR UNA FEDERACIÓN DEL PC AL SERVIDOR, CON RED DE SEGURIDAD ──────────────────────────────────
 *
 * El traspaso tiene seis pasos y un orden que no es negociable, porque en medio hay dos formas de romper cosas:
 *
 *   · **dos flotas sobre la misma federación** (peticiones duplicadas al portal) si el servidor arranca antes de
 *     que el PC deje de gestionarla;
 *   · **una federación sin nadie que la recoja** si el PC la suelta y el servidor no llega a arrancar.
 *
 * Por eso el orden es: primero se comprueba que el servidor PUEDE (imagen, DNS, contenedor), después se copia la
 * cola con el PC ya parado para esa federación, después se arranca en el servidor y se verifica, y **si algo
 * falla se deshace todo**: se para el contenedor y se devuelve la federación al PC. Nunca se queda a medias.
 *
 * Uso:
 *   node scripts/servidor/traspasar.mjs --federacion melilla
 *   node scripts/servidor/traspasar.mjs --federacion melilla --seco       # sólo dice qué haría
 *   node scripts/servidor/traspasar.mjs --todas --servidor david@servidor.local
 *
 * Lo que NO hace nunca: tocar los datos del PC (las colas se copian, no se mueven) ni borrar nada.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };

const RAIZ = resolve(process.env.FACYLF_RAIZ ?? '.');
const SERVIDOR = arg('servidor', 'david@servidor.local');
const REMOTO = arg('remoto', '/srv/data/facylf');
const ENTORNO_PC = join(RAIZ, 'scripts', 'entorno-flota.ps1');
const SECO = argumentos.includes('--seco');
const TODAS = argumentos.includes('--todas');
const MINUTOS_VERIFICACION = Number(arg('verificar-min', 3));

const ejecuta = (orden, parametros, opciones = {}) => execFileSync(orden, parametros, { encoding: 'utf8', ...opciones });
const enServidor = (orden) => ejecuta('ssh', ['-o', 'BatchMode=yes', SERVIDOR, orden]).trim();
const paso = (n, texto) => console.log(`\n${n}. ${texto}`);

/** Las federaciones que el PC tiene excluidas ahora mismo (leídas de `entorno-flota.ps1`, la fuente de verdad). */
function excluidasActuales() {
  const texto = readFileSync(ENTORNO_PC, 'utf8');
  const linea = /\$env:FACYLF_EXCLUIR\s*=\s*'([^']*)'/.exec(texto)?.[1] ?? '';
  return linea.split(',').map((f) => f.trim()).filter(Boolean);
}

/** Escribe la lista de excluidas sin tocar el resto del fichero. */
function escribeExcluidas(lista) {
  const texto = readFileSync(ENTORNO_PC, 'utf8');
  const nuevo = texto.replace(/(\$env:FACYLF_EXCLUIR\s*=\s*')[^']*(')/, `$1${lista.join(',')}$2`);
  if (nuevo === texto && !/FACYLF_EXCLUIR/.test(texto)) throw new Error('no se encontró FACYLF_EXCLUIR en scripts/entorno-flota.ps1');
  writeFileSync(ENTORNO_PC, nuevo, 'utf8');
}

/** Reinicia el supervisor del PC para que lea la lista nueva (y deja constancia de las federaciones que lleva). */
function reiniciaSupervisorDelPC() {
  ejecuta('powershell', ['-NoProfile', '-Command',
    "Stop-ScheduledTask -TaskName 'FACyLF flota'; Start-Sleep -Seconds 4; "
    + "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*recolector-*' } | "
    + 'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; '
    + "Remove-Item '.supervisor-flota.lock' -Force -ErrorAction SilentlyContinue; "
    + "Start-ScheduledTask -TaskName 'FACyLF flota'; Start-Sleep -Seconds 12"]);
}

/** ¿Hay workers de ESA federación vivos en el PC? */
function workersEnPCEsDe(federacion) {
  const salida = ejecuta('powershell', ['-NoProfile', '-Command',
    `(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*${federacion}*' -and $_.CommandLine -like '*recolector-*' } | Measure-Object).Count`]).trim();
  return Number(salida) || 0;
}

/**
 * El servidor cumple las condiciones para recoger: imagen, DNS resolviendo portales y sitio.
 *
 * ── EL DNS SE COMPRUEBA DESDE UN CONTENEDOR, NO DESDE EL HOST (21/09/2026) ────────────────────────────────
 *
 * El host del servidor **no resuelve** (tiene los resolutores de Tailscale, que están desactivados), pero los
 * contenedores sí: la imagen de los recolectores resuelve `rfmf.es`, `fcf.cat` y `futnavarra.es` sin problema.
 * Comprobar el DNS con `getent` en el host abortaba el traspaso por un problema que la flota no tiene.
 *
 * Lo que de verdad importa es que **el contenedor del recolector** abra el portal, así que eso es lo que se
 * prueba: una petición real desde la imagen.
 */
function compruebaServidor(federacion) {
  const imagen = enServidor("docker image inspect facylf-recolectores:local --format '{{.Id}}' 2>/dev/null | cut -c1-19");
  const disco = enServidor("df -h / | tail -1 | awk '{print $4}'");
  let dns = false;
  let portal = '';
  try {
    portal = enServidor('docker run --rm --entrypoint getent facylf-recolectores:local hosts www.rfef.es 2>&1 | head -1');
    dns = portal.length > 0 && !/not found|SERVFAIL|no such/i.test(portal);
  } catch (error) {
    portal = `fallo: ${String(error.message).slice(0, 120)}`;
  }
  return { imagen: imagen || '(sin imagen)', dns, portal, disco };
}

/** Los errores de red del registro de esa federación en el servidor (lo que delata el DNS roto). */
function erroresDeRed(federacion) {
  const salida = enServidor(`grep -c 'ERR_NAME_NOT_RESOLVED' ${REMOTO}/descargas-${federacion}/recolector-local/worker-programado.log 2>/dev/null || echo 0`);
  return Number(salida.split('\n').pop()) || 0;
}

async function traspasa(federacion) {
  console.log(`\n════════ traspaso de ${federacion} ════════`);

  paso(1, '¿el servidor puede recogerla? (imagen, DNS desde el contenedor, disco)');
  const estado = compruebaServidor(federacion);
  console.log(`   imagen: ${estado.imagen} · disco libre: ${estado.disco}`);
  console.log(`   DNS desde el contenedor: ${estado.dns ? `resuelve (${estado.portal})` : `NO RESUELVE (${estado.portal})`}`);
  if (!estado.dns) {
    console.log('   ✗ sin DNS el contenedor no puede abrir los portales: se aborta sin tocar nada');
    return false;
  }

  const yaExcluidas = excluidasActuales();
  if (yaExcluidas.includes(federacion)) {
    console.log(`   ${federacion} ya estaba excluida en el PC`);
  }

  if (SECO) {
    console.log(`   (ensayo) haría: excluir ${federacion} en el PC, parar su worker, recopiar la cola, `
      + `arrancar su contenedor en el servidor y verificar ${MINUTOS_VERIFICACION} min`);
    return true;
  }

  paso(2, `el PC deja de gestionar ${federacion}`);
  /*
   * Sólo se reinicia el supervisor si la lista CAMBIÓ. Con `--todas` la lista se deja puesta de una vez antes de
   * empezar (ver `main`), así que aquí ya está y no se vuelve a reiniciar: cada reinicio corta las sesiones de
   * TODAS las federaciones y en un traspaso de siete eso sería siete cortes de todo para nada.
   */
  const yaEstaba = yaExcluidas.includes(federacion);
  if (!yaEstaba) {
    escribeExcluidas([...new Set([...yaExcluidas, federacion])]);
    reiniciaSupervisorDelPC();
  }
  console.log(`   supervisor del PC ${yaEstaba ? 'ya la tenía excluida' : 'reiniciado'} · workers de ${federacion} vivos: ${workersEnPCEsDe(federacion)}`);

  paso(3, 'copiar la cola (ahora sí, sin nadie escribiéndola)');
  try {
    const salida = ejecuta('node', [join(RAIZ, 'scripts', 'servidor', 'copiar-datos.mjs'),
      '--federaciones', federacion, '--rehacer', '--solo-cola'], { stdio: ['ignore', 'pipe', 'inherit'] });
    console.log(`   ${salida.trim().split('\n').slice(-2).join(' · ')}`);
  } catch (error) {
    console.log(`   ✗ falló la copia: ${String(error.message).slice(0, 200)}`);
    return deshace(federacion, yaExcluidas);
  }

  paso(4, 'arrancar su contenedor en el servidor');
  enServidor(`cd ${REMOTO} && docker compose --project-name facylf --env-file docker/.env -f docker/compose.yml up -d --force-recreate ${federacion} 2>&1 | tail -2`);

  paso(5, `verificar ${MINUTOS_VERIFICACION} min que pide de verdad`);
  const antes = erroresDeRed(federacion);
  await new Promise((listo) => setTimeout(listo, MINUTOS_VERIFICACION * 60_000));
  const despues = erroresDeRed(federacion);
  const nuevos = despues - antes;
  const registro = enServidor(`tail -6 ${REMOTO}/descargas-${federacion}/recolector-local/worker-programado.log`);
  console.log(`   errores de DNS nuevos: ${nuevos}`);
  console.log(`   últimas líneas:\n${registro.split('\n').map((l) => `     ${l}`).join('\n')}`);

  if (nuevos > 0) {
    console.log('   ✗ sigue sin poder resolver: se deshace');
    return deshace(federacion, yaExcluidas);
  }

  console.log(`   ✓ ${federacion} recolecta en el servidor`);
  return true;
}

/** Vuelve atrás: para el contenedor y devuelve la federación al PC. La federación no se queda sin nadie. */
function deshace(federacion, excluidasAntes) {
  console.log(`   ↩ deshaciendo: parar el contenedor y devolver ${federacion} al PC`);
  enServidor(`cd ${REMOTO} && docker compose --project-name facylf --env-file docker/.env -f docker/compose.yml stop ${federacion} 2>&1 | tail -1`);
  escribeExcluidas(excluidasAntes);
  reiniciaSupervisorDelPC();
  console.log('   la federación vuelve a recolectarse en el PC');
  return false;
}

async function main() {
  const lista = arg('federaciones', '').split(',').map((f) => f.trim()).filter(Boolean);
  const federaciones = lista.length
    ? lista
    : (TODAS ? ['andalucia', 'aragon', 'asturias', 'melilla'] : [arg('federacion', '')].filter(Boolean));
  if (!federaciones.length) {
    console.error('Falta --federacion <nombre>, --federaciones a,b,c o --todas');
    process.exit(1);
  }
  /*
   * Con `--todas`, las exclusiones se dejan puestas de UNA vez y antes de empezar: así el supervisor del PC se
   * reinicia una sola vez (cada reinicio corta las sesiones de todas las federaciones) y los traspasos
   * posteriores no lo tocan. Con `--federacion` se hace igual: una exclusión, un reinicio.
   */
  const yaExcluidas = excluidasActuales();
  const nuevas = federaciones.filter((f) => !yaExcluidas.includes(f));
  if (nuevas.length && !SECO) {
    console.log(`Dejo al PC sin gestionar: ${nuevas.join(', ')} (una sola reinicialización del supervisor)`);
    escribeExcluidas([...new Set([...yaExcluidas, ...nuevas])]);
    reiniciaSupervisorDelPC();
  }

  const resultados = [];
  for (const federacion of federaciones) resultados.push({ federacion, ok: await traspasa(federacion) });
  console.log('\n════════ resumen ════════');
  for (const r of resultados) console.log(`  ${r.federacion.padEnd(20)} ${r.ok ? 'en el servidor' : 'sigue en el PC'}`);
  process.exit(resultados.every((r) => r.ok) ? 0 : 2);
}

await main();
