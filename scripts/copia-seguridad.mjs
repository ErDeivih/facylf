#!/usr/bin/env node
/**
 * COPIA DE SEGURIDAD DEL CANÓNICO, COMPROBADA, CON ROTACIÓN Y REGISTRO EN ops.copia (0030).
 *
 * Sustituye a scripts/copia-canonico.ps1 manteniendo sus dos reglas aprendidas (01/10/2026):
 *   1. el volcado NO se redirige con `>` (destroza binarios): se escribe dentro del contenedor y se saca con
 *      `docker cp`, que es binario-seguro;
 *   2. un volcado que no se ha leído nunca no es una copia: `pg_restore --list` tiene que leer su índice.
 * Añade: sha256, rotación abuelo-padre-hijo (7 diarias, 4 semanales de domingo, 6 mensuales del día 1) y
 * la restauración de prueba completa (`--restauracion-prueba`, una vez al mes): restaura en una base
 * temporal DENTRO del mismo contenedor, compara recuentos con la buena y la borra.
 *
 * Uso:
 *   node scripts/copia-seguridad.mjs                          copia + comprobación + rotación
 *   node scripts/copia-seguridad.mjs --restauracion-prueba    restaura la última copia en facylf_restauracion y compara
 *   node scripts/copia-seguridad.mjs --listar
 * Entorno: FACYLF_COPIAS (destino; por defecto D:\facylf-copias en Windows, /srv/data/facylf-copias en Linux),
 *          FACYLF_CONTENEDOR_POSTGRES (facylf-postgres), DATABASE_URL_PUBLICADOR (para escribir ops.copia).
 * Programación: diaria a las 3:30 (Programador de tareas / cron). La restauración, el día 2 de cada mes.
 * Regla del servidor: no corre si hay menos de 3 GiB libres o la carga pasa de 14 (Linux).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { freemem, loadavg } from 'node:os';

try { process.loadEnvFile('.env'); } catch { /* entorno externo */ }
const { Client } = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'canonico', 'package.json'))('pg');

const args = process.argv.slice(2);
const CONTENEDOR = process.env.FACYLF_CONTENEDOR_POSTGRES ?? 'facylf-postgres';
const DESTINO = process.env.FACYLF_COPIAS ?? (process.platform === 'win32' ? 'D:\\facylf-copias' : '/srv/data/facylf-copias');
const BASE = 'facylf', USUARIO = 'facylf_admin';
const url = (process.env.DATABASE_URL_PUBLICADOR ?? '').trim();

function docker(...a) {
  const r = spawnSync('docker', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`docker ${a.slice(0, 3).join(' ')}… → ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 500)}`);
  return r.stdout;
}
const sha256 = (ruta) => new Promise((ok, ko) => {
  const h = createHash('sha256'); createReadStream(ruta).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', ko);
});

async function registra(fila) {
  if (!url || /facylf_admin/.test(url)) return;
  const c = new Client({ connectionString: url, application_name: 'copia-seguridad' });
  try {
    await c.connect();
    await c.query(`insert into ops.copia (tipo, iniciada_en, terminada_en, correcta, ruta, bytes, sha256, detalle) values ($1,$2,now(),$3,$4,$5,$6,$7)`,
      [fila.tipo, fila.inicio, fila.correcta, fila.ruta ?? null, fila.bytes ?? null, fila.sha256 ?? null, fila.detalle ?? {}]);
    if (!fila.correcta) {
      await c.query(`insert into ops.evento_app (nivel, origen, tipo, mensaje, detalle) values ('critico','copia',$1,$2,$3)`,
        [`${fila.tipo}_fallida`, fila.detalle?.error ?? 'fallo', fila.detalle ?? {}]);
    }
  } catch (e) { console.error('  (no se pudo registrar en ops.copia:', e.message, ')'); } finally { await c.end().catch(() => {}); }
}

function memoriaDisponibleGb() {
  // En Windows `os.freemem()` devuelve la RAM LIBRE, que es engañosa: Windows usa casi toda la que sobra
  // como caché de reserva (el 27/10: 2,1 GB libres y 19,8 GB disponibles). La regla de los 3 GiB existe para
  // no cargar la máquina, así que se mide lo DISPONIBLE, que es lo que de verdad se puede usar.
  if (process.platform === 'win32') {
    try {
      const salida = execFileSync('powershell.exe', ['-NoProfile', '-Command',
        '(Get-CimInstance Win32_PerfRawData_PerfOS_Memory).AvailableMBytes'], { encoding: 'utf8', timeout: 15000 });
      const mb = Number(String(salida).trim());
      if (Number.isFinite(mb) && mb > 0) return mb / 1024;
    } catch { /* si falla, se usa freemem como antes */ }
  }
  return freemem() / 1024 ** 3;
}

function guardiaDelEquipo() {
  const disponibleGb = memoriaDisponibleGb();
  if (disponibleGb < 3) throw new Error(`menos de 3 GiB disponibles (${disponibleGb.toFixed(1)} GB): no se hace la copia ahora (regla del servidor)`);
  if (process.platform !== 'win32' && loadavg()[0] > 14) throw new Error('carga > 14: no se hace la copia ahora');
}

const copias = () => (existsSync(DESTINO) ? readdirSync(DESTINO) : []).filter((f) => /^canonico-\d{8}-\d{4}\.dump$/.test(f)).sort();

function rotacion() {
  // Se conserva: las 7 más recientes; la última de cada domingo de las 4 últimas semanas; la del día 1 de los 6 últimos meses.
  const todas = copias();
  const fecha = (f) => { const m = f.match(/(\d{4})(\d{2})(\d{2})-/); return new Date(+m[1], +m[2] - 1, +m[3]); };
  const guardar = new Set(todas.slice(-7));
  const hoy = new Date();
  for (const f of todas) {
    const d = fecha(f), dias = (hoy - d) / 86400000;
    if (d.getDay() === 0 && dias <= 28) guardar.add(f);
    if (d.getDate() === 1 && dias <= 186) guardar.add(f);
  }
  for (const f of todas) if (!guardar.has(f)) { unlinkSync(join(DESTINO, f)); console.log(`   borro ${f}`); }
}

async function copia() {
  const inicio = new Date();
  const sello = inicio.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const nombre = `canonico-${sello}.dump`;
  const ruta = join(DESTINO, nombre);
  try {
    guardiaDelEquipo();
    mkdirSync(DESTINO, { recursive: true });
    console.log(`== copia del canónico → ${ruta}`);
    docker('exec', CONTENEDOR, 'pg_dump', '-U', USUARIO, '-d', BASE, '-Fc', '-Z', '6', '-f', `/tmp/${nombre}`);
    docker('cp', `${CONTENEDOR}:/tmp/${nombre}`, ruta);
    docker('exec', CONTENEDOR, 'rm', '-f', `/tmp/${nombre}`);
    const bytes = statSync(ruta).size;
    console.log(`   ${(bytes / 1024 ** 3).toFixed(2)} GB en ${((Date.now() - inicio) / 60000).toFixed(1)} min`);
    // Comprobación: el índice se lee entero.
    docker('cp', ruta, `${CONTENEDOR}:/tmp/${nombre}`);
    const lista = docker('exec', CONTENEDOR, 'pg_restore', '--list', `/tmp/${nombre}`);
    docker('exec', CONTENEDOR, 'rm', '-f', `/tmp/${nombre}`);
    const tablas = (lista.match(/TABLE DATA/g) ?? []).length;
    if (tablas < 30) throw new Error(`el volcado sólo trae ${tablas} tablas con datos: sospechoso`);
    const suma = await sha256(ruta);
    console.log(`   OK: índice legible, ${tablas} tablas con datos, sha256 ${suma.slice(0, 16)}…`);
    rotacion();
    await registra({ tipo: 'copia', inicio, correcta: true, ruta, bytes, sha256: suma, detalle: { tablas } });
  } catch (e) {
    console.error(`✗ copia fallida: ${e.message}`);
    await registra({ tipo: 'copia', inicio, correcta: false, ruta, detalle: { error: e.message } });
    process.exitCode = 1;
  }
}

async function restauracionPrueba() {
  const inicio = new Date();
  const ultima = copias().at(-1);
  const PRUEBA = 'facylf_restauracion';
  try {
    if (!ultima) throw new Error(`no hay copias en ${DESTINO}`);
    guardiaDelEquipo();
    console.log(`== restauración de prueba de ${ultima} en ${PRUEBA}`);
    docker('cp', join(DESTINO, ultima), `${CONTENEDOR}:/tmp/${ultima}`);
    docker('exec', CONTENEDOR, 'dropdb', '-U', USUARIO, '--if-exists', PRUEBA);
    docker('exec', CONTENEDOR, 'createdb', '-U', USUARIO, PRUEBA);
    // -j 2: no más paralelismo para no competir con recolectores e importador.
    docker('exec', CONTENEDOR, 'pg_restore', '-U', USUARIO, '-d', PRUEBA, '-j', '2', '--no-owner', `/tmp/${ultima}`);
    const cuenta = (db) => docker('exec', CONTENEDOR, 'psql', '-U', USUARIO, '-d', db, '-At', '-c',
      `select (select count(*) from core.match)||','||(select count(*) from core.appearance)||','||(select count(*) from core.person)||','||(select max(numero) from ops.migracion)`).trim();
    const prueba = cuenta(PRUEBA), buena = cuenta(BASE);
    const [pm, pa, pp] = prueba.split(',').map(Number), [bm, ba, bp] = buena.split(',').map(Number);
    console.log(`   restaurada: ${pm} partidos, ${pa} apariciones, ${pp} personas · buena ahora: ${bm}, ${ba}, ${bp}`);
    // La buena puede haber crecido desde la copia; la restaurada no puede tener MÁS ni menos del 95 %.
    if (pm > bm || pa > ba || pm < 0.95 * bm || pa < 0.95 * ba) throw new Error(`recuentos no cuadran: ${prueba} frente a ${buena}`);
    await registra({ tipo: 'restauracion_prueba', inicio, correcta: true, ruta: ultima, detalle: { restaurada: prueba, buena } });
    console.log('   OK: la copia se restaura y cuadra');
  } catch (e) {
    console.error(`✗ restauración de prueba fallida: ${e.message}`);
    await registra({ tipo: 'restauracion_prueba', inicio, correcta: false, ruta: ultima, detalle: { error: e.message } });
    process.exitCode = 1;
  } finally {
    try { docker('exec', CONTENEDOR, 'dropdb', '-U', USUARIO, '--if-exists', PRUEBA); } catch { /* nada */ }
    if (ultima) try { docker('exec', CONTENEDOR, 'rm', '-f', `/tmp/${ultima}`); } catch { /* nada */ }
  }
}

const soloDia = args.indexOf('--solo-dia');
if (soloDia >= 0 && new Date().getDate() !== Number(args[soloDia + 1])) process.exit(0);   // tarea «mensual» lanzada a diario
if (args.includes('--listar')) { for (const f of copias()) console.log(f, (statSync(join(DESTINO, f)).size / 1024 ** 3).toFixed(2), 'GB'); }
else if (args.includes('--restauracion-prueba')) await restauracionPrueba();
else await copia();
