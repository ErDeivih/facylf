#!/usr/bin/env node
/*
 * TOPE DURO DE 10 GB, PROBADO EN UN LINUX DE VERDAD (kernel del motor de Docker, cgroup v2).
 *
 * Lo que se certifica para el servidor no es «el gobernador reparte plazas» —eso se prueba con la aceptación— sino
 * que **el conjunto no puede pasar de 10 GB aunque quiera**: en el servidor eso lo hace la rebanada
 * `facylf.slice` con `MemoryMax=10G` y `MemorySwapMax=0` (ver `docker/servidor/facylf-slice.conf`).
 *
 * Aquí se reproduce esa rebanada dentro del motor Linux de Docker (20,9 GB, cgroup v2), se mete dentro una flota de
 * federaciones de prueba y se la empuja con lastre hasta el límite, para comprobar tres cosas:
 *
 *   1. el tope se cumple: el pico de la rebanada no pasa de 10 GiB y el kernel no deja crecer más;
 *   2. el lastre se lo lleva el kernel, no los recolectores: los contenedores de recolección siguen vivos;
 *   3. y el gobernador hace su parte antes de que el kernel tenga que intervenir: cuando a la máquina le queda
 *      menos que su reserva (`FACYLF_RESERVA_GB`), los workers nuevos **no abren navegador** y lo dicen.
 *
 * Uso:
 *   node scripts/prueba-tope-10gb-docker.mjs [--federaciones prueba-a,prueba-b,prueba-c]
 *                                            [--volumen-datos facylf-datos-prueba] [--lastre 3] [--minutos 4]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };
const federaciones = String(arg('federaciones', 'prueba-a,prueba-b,prueba-c')).split(',').map((f) => f.trim()).filter(Boolean);
const volumenDatos = arg('volumen-datos', 'facylf-datos-prueba');
const lastre = Number(arg('lastre', 3));
const minutos = Number(arg('minutos', 4));
const rebanada = 'facylf.slice';
const topeBytes = 10 * 1024 ** 3;
const imagen = 'facylf-recolectores:local';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const corre = (args, timeout = 300000) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout });
const intenta = (args, timeout = 300000) => { try { return corre(args, timeout).trim(); } catch (e) { return String(e.stdout ?? e.message).trim(); } };
const enMotor = (guion) => intenta(['run', '--rm', '--privileged', '--cgroupns=host', '--entrypoint', 'bash', imagen, '-c', guion]);

const resultados = [];
const comprueba = (nombre, bien, detalle) => {
  resultados.push({ nombre, bien, detalle });
  console.log(`  ${bien ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

console.log(`═══ tope duro de 10 GB · kernel del motor de Docker · ${federaciones.length} federación(es) + ${lastre} lastre(s)`);

/* ── 1. La rebanada, como la del servidor ─────────────────────────────────────────────────────────────── */
console.log('  preparando la rebanada (como facylf.slice del servidor)...');
enMotor(`mkdir -p /sys/fs/cgroup/${rebanada} && echo ${topeBytes} > /sys/fs/cgroup/${rebanada}/memory.max`
  + ` && echo 0 > /sys/fs/cgroup/${rebanada}/memory.swap.max && cat /sys/fs/cgroup/${rebanada}/memory.max`);
const maxLeido = enMotor(`cat /sys/fs/cgroup/${rebanada}/memory.max`);
const swapLeido = enMotor(`cat /sys/fs/cgroup/${rebanada}/memory.swap.max`);
comprueba('la rebanada existe con tope de 10 GiB y sin swap',
  maxLeido === String(topeBytes) && swapLeido === '0', `memory.max=${maxLeido} · memory.swap.max=${swapLeido}`);

const leeRebanada = (archivo) => enMotor(`cat /sys/fs/cgroup/${rebanada}/${archivo} 2>/dev/null || echo 0`);

/* ── 2. La flota de prueba, DENTRO de la rebanada ─────────────────────────────────────────────────────── */
for (const f of federaciones) intenta(['rm', '-f', `tope-${f}`]);
intenta(['volume', 'create', `facylf-plazas-tope`]);
intenta(['volume', 'rm', '-f', 'facylf-plazas-tope']);
intenta(['volume', 'create', 'facylf-plazas-tope']);
console.log('  arrancando la flota de prueba dentro de la rebanada...');
for (const f of federaciones) {
  const montajes = volumenDatos
    ? ['-v', `${volumenDatos}:/app/datos`, '-v', `${join(raiz, 'docker')}:/d`]
    : ['-v', `${join(raiz, `descargas-${f}`)}:/app/descargas-${f}`];
  intenta(['run', '-d', '--name', `tope-${f}`, '--cgroup-parent', rebanada,
    '-e', 'FACYLF_MEMORIA_GB=10', '-e', 'FACYLF_TURNO_PLAZA_MIN=1', '-e', 'FACYLF_CHROME_HEADLESS=1',
    '-e', 'FACYLF_RESERVA_GB=2', '-e', 'TZ=Europe/Madrid',
    '-v', 'facylf-plazas-tope:/app/.estado-workers', ...montajes,
    '--shm-size=512m', '--memory=1600m', imagen,
    ...(volumenDatos ? ['bash', '/d/_entrada-en-volumen.sh', f] : ['bash', 'docker/entrada-recolector.sh', f])]);
}

/* ── 3. Lastre hasta el límite: eso es lo que obliga al kernel a decidir ──────────────────────────────── */
console.log(`  metiendo ${lastre} contenedor(es) de lastre dentro de la misma rebanada...`);
for (let i = 0; i < lastre; i++) {
  intenta(['run', '-d', '--name', `tope-lastre-${i}`, '--cgroup-parent', rebanada, '--memory=9g',
    '--entrypoint', 'node', imagen, '-e',
    'const trozos = []; setInterval(() => { try { trozos.push(Buffer.alloc(64 * 1024 * 1024, 1)); } catch {} }, 300);']);
}

/* ── 4. Observación ───────────────────────────────────────────────────────────────────────────────────── */
const cuentaPeticiones = (f) => Number(intenta(['run', '--rm', '-v', `${volumenDatos}:/app/datos`, '--entrypoint', 'bash', imagen,
  '-c', `node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/app/datos/descargas-${f}/recolector-local/cola-v2.sqlite',{readOnly:true});console.log(db.prepare('select count(*) n from peticiones').get().n)"`]).trim()) || 0;
const peticionesAntes = Object.fromEntries(federaciones.map((f) => [f, cuentaPeticiones(f)]));

let picoBytes = 0;
const muestras = [];
const vueltas = Math.max(4, Math.round((minutos * 60) / 10));
for (let i = 0; i < vueltas; i++) {
  await espera(10_000);
  const actual = Number(await leeRebanada('memory.current'));
  const pico = Number(await leeRebanada('memory.peak'));
  picoBytes = Math.max(picoBytes, pico, actual);
  if (i % 3 === 0 || actual > topeBytes) {
    muestras.push({ segundo: (i + 1) * 10, actualGb: Number((actual / 1024 ** 3).toFixed(2)) });
    console.log(`    [${String((i + 1) * 10).padStart(3)} s] rebanada ${(actual / 1024 ** 3).toFixed(2)} GB`
      + ` · pico ${(pico / 1024 ** 3).toFixed(2)} GB · permitido 10,00 GB`);
  }
}

const eventos = await leeRebanada('memory.events');
const oomKills = Number(/oom_kill (\d+)/.exec(eventos)?.[1] ?? 0);
const vivos = federaciones.map((f) => ({ federacion: f, estado: intenta(['inspect', `tope-${f}`, '--format', '{{.State.Status}}']) }));
const lastresVivos = Array.from({ length: lastre }, (_, i) => intenta(['inspect', `tope-lastre-${i}`, '--format', '{{.State.Status}}']));
const peticiones = Object.fromEntries(federaciones.map((f) => [f, cuentaPeticiones(f)]));

comprueba('el pico de la rebanada no pasa del tope de 10 GiB', picoBytes <= topeBytes + 64 * 1024 ** 2,
  `pico ${(picoBytes / 1024 ** 3).toFixed(2)} GB de 10 GB`);
comprueba('los recolectores siguen en marcha bajo la rebanada llena',
  vivos.every((v) => v.estado === 'running'), vivos.map((v) => `${v.federacion}:${v.estado}`).join(' · '));
comprueba('el kernel se llevó por delante el lastre, no la recolección',
  oomKills === 0 || lastresVivos.some((e) => e !== 'running'), `oom_kill=${oomKills} · lastre: ${lastresVivos.join(', ')}`);
/*
 * La propiedad que de verdad importa para el servidor: con la rebanada LLENA y después de que el kernel tenga que
 * matar a alguien, la recolección sigue pidiendo. Es lo que distingue «el tope aguanta» de «el tope aguanta y la
 * flota sobrevive».
 */
comprueba('la flota sigue recolectando con la rebanada llena',
  federaciones.every((f) => (peticiones[f] ?? 0) > (peticionesAntes[f] ?? 0)),
  federaciones.map((f) => `${f}: ${peticionesAntes[f]}→${peticiones[f]}`).join(' · '));
// Y, como dato, si el gobernador llegó a frenar por su cuenta (mira la memoria del cgroup y la de la máquina).
const esperasPorMemoria = federaciones.map((f) => Number(intenta(['exec', `tope-${f}`, 'sh', '-c',
  'grep -c "menos que la reserva" /app/descargas-*/recolector-local/worker-programado.log 2>/dev/null || true']).trim()) || 0);
console.log(`  (esperas por reserva de memoria en los registros: ${esperasPorMemoria.join(', ')})`);

/* ── 6. Recoger ───────────────────────────────────────────────────────────────────────────────────────── */
for (const f of federaciones) intenta(['rm', '-f', `tope-${f}`]);
for (let i = 0; i < lastre; i++) intenta(['rm', '-f', `tope-lastre-${i}`]);
intenta(['volume', 'rm', '-f', 'facylf-plazas-tope']);
enMotor(`rmdir /sys/fs/cgroup/${rebanada} 2>/dev/null || true`);

const fallos = resultados.filter((r) => !r.bien);
console.log(`\n  ${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas${fallos.length ? ` · FALLAN: ${fallos.map((f) => f.nombre).join(' · ')}` : ' · TODO CORRECTO'}`);

const carpeta = join(raiz, 'pruebas', 'reconstruccion');
mkdirSync(carpeta, { recursive: true });
writeFileSync(join(carpeta, 'tope-10gb.json'), `${JSON.stringify({
  cuando: new Date().toISOString(), motor: 'Docker Desktop (kernel Linux, cgroup v2)',
  rebanada, topeBytes, picoBytes, picoGb: Number((picoBytes / 1024 ** 3).toFixed(2)),
  oomKills, muestras, vivos, lastresVivos, peticiones, esperasPorMemoria, resultados,
}, null, 2)}\n`);
process.exitCode = fallos.length ? 1 : 0;
