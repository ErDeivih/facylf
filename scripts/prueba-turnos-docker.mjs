#!/usr/bin/env node
/*
 * PRUEBA DE TURNOS: que NA nadie se quede sin su turno de navegador.
 *
 * En un servidor de 10 GB no caben diecisiete navegadores a la vez: entran once y los demás esperan. Lo que se le
 * pide al programa no es que quepan todos, sino que **todos entren a lo largo del día** y que nadie se quede
 * esperando para siempre. Eso son dos propiedades distintas y hay que medirlas por separado:
 *
 *   1. **nunca hay más plazas ocupadas que las del presupuesto** (si no, se abre un navegador de más y la memoria
 *      se va);
 *   2. **todas las federaciones consiguen su turno** aunque haya más federaciones que plazas y el que lo tiene
 *      podría no soltarlo en horas (por eso existe el turno máximo: `FACYLF_TURNO_PLAZA_MIN`).
 *
 * Y de paso comprueba la tercera, que es la que se rompe en silencio: una ficha de espera de un contenedor que ya
 * no existe no puede dejar esperando a los vivos (ni al revés: quitarle el sitio a quien está esperando de verdad).
 *
 * Uso:
 *   node scripts/prueba-turnos-docker.mjs --federaciones prueba-a,prueba-b,prueba-c --volumen-datos facylf-datos-prueba
 *   node scripts/prueba-turnos-docker.mjs --federaciones prueba-a,prueba-b,prueba-c --turno-min 1 --minutos 6
 *
 * Necesita: la imagen construida, un volumen con las colas de prueba (`--volumen-datos`, obligatorio en Windows:
 * SQLite no abre las colas por el puente de carpetas) y permiso para usar su propio volumen de plazas.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { repartePlazas, SIN_LATIDO_MS } from './lib/presupuesto-memoria.mjs';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };
const federaciones = String(arg('federaciones', 'prueba-a,prueba-b,prueba-c')).split(',').map((f) => f.trim()).filter(Boolean);
const volumenDatos = arg('volumen-datos', null);
const memoriaGb = Number(arg('memoria-gb', 2));
const turnoMin = Number(arg('turno-min', 1));
const minutos = Number(arg('minutos', 6));
const volumenPlazas = 'facylf-plazas-turnos';
const imagen = 'facylf-recolectores:local';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const intenta = (args, timeout = 300000) => {
  try { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout }).trim(); }
  catch (error) { return String(error.stdout ?? error.message).trim(); }
};

const resultados = [];
const comprueba = (nombre, bien, detalle) => {
  resultados.push({ nombre, bien, detalle });
  console.log(`  ${bien ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

const reparto = repartePlazas({ memoriaGb, memoriaTotalGb: memoriaGb });
console.log(`═══ prueba de turnos · ${federaciones.length} federaciones · presupuesto ${memoriaGb} GB`
  + ` (${reparto.plazas} plaza(s)) · turno ${turnoMin} min · ${minutos} min de observación`);

/* ── Su propio escenario: contenedores y volumen de plazas propios ──────────────────────────────────────── */
for (const fed of federaciones) intenta(['rm', '-f', `turnos-${fed}`]);
const restos = intenta(['ps', '-a', '--filter', 'name=turnos-', '--format', '{{.Names}}']).split('\n').map((n) => n.trim()).filter(Boolean);
if (restos.length) intenta(['rm', '-f', ...restos]);
intenta(['volume', 'rm', '-f', volumenPlazas]);
intenta(['volume', 'create', volumenPlazas]);

/** Cuenta un patrón de ficha en el volumen compartido (plazas `slot-*.lock` o esperas `espera-*.ficha`). */
const cuentaFichas = (patron) => Number(intenta(['run', '--rm', '-v', `${volumenPlazas}:/p`, '--entrypoint', 'bash',
  imagen, '-c', `ls /p/slots-chrome/${patron} 2>/dev/null | wc -l`]).trim()) || 0;

console.log('  arrancando contenedores...');
for (const fed of federaciones) {
  const montajes = volumenDatos
    ? ['-v', `${volumenDatos}:/app/datos`, '-v', `${join(raiz, 'docker')}:/d`]
    : ['-v', `${join(raiz, 'descargas-' + fed)}:/app/descargas-${fed}`];
  intenta(['run', '-d', '--name', `turnos-${fed}`,
    '-e', `FACYLF_MEMORIA_GB=${memoriaGb}`, '-e', `FACYLF_TURNO_PLAZA_MIN=${turnoMin}`,
    '-e', 'FACYLF_CHROME_HEADLESS=1', '-e', 'TZ=Europe/Madrid',
    '-v', `${volumenPlazas}:/app/.estado-workers`, ...montajes,
    '--shm-size=512m', '--memory=1600m', imagen,
    ...(volumenDatos ? ['bash', '/d/_entrada-en-volumen.sh', fed] : ['bash', 'docker/entrada-recolector.sh', fed])]);
}

/* ── Observación: ni una plaza de más, y todos entran ───────────────────────────────────────────────────── */
const maxPlazas = { valor: 0 };
const muestras = Math.max(1, Math.round((minutos * 60_000) / 15_000));
for (let i = 0; i < muestras; i++) {
  await espera(15_000);
  const plazas = cuentaFichas('slot-*.lock');
  const esperas = cuentaFichas('espera-*.ficha');
  maxPlazas.valor = Math.max(maxPlazas.valor, plazas);
  if (i % 4 === 0 || plazas > reparto.plazas) {
    console.log(`  [${String(Math.round(((i + 1) * 15) / 60 * 10) / 10).padStart(4)} min] plazas ${plazas}`
      + ` (máx permitido ${reparto.plazas}) · esperando ${esperas}`);
  }
}

/*
 * Lo que hay que leer es el REGISTRO DEL WORKER, no `docker logs`: el supervisor de dentro del contenedor manda la
 * salida del worker a `worker-programado.log`, así que `docker logs` casi no dice nada de lo que hizo el navegador.
 * (Primera versión de esta prueba: contaba 0 turnos para todos y parecía que el reparto estaba roto; el roto era
 * el sitio donde miraba.)
 */
const cuentaEnRegistro = (fed, texto) => Number(intenta(['exec', `turnos-${fed}`, 'sh', '-c',
  `grep -c '${texto}' /app/descargas-${fed}/recolector-local/worker-programado.log 2>/dev/null || true`]).trim()) || 0;
const estadoDe = (fed) => ({
  turnos: cuentaEnRegistro(fed, 'turno de navegador concedido'),
  esperas: cuentaEnRegistro(fed, 'esperando turno de navegador'),
  sinTrabajo: cuentaEnRegistro(fed, 'Sin trabajo disponible ahora') > 0,
});
const vivos = federaciones.map((fed) => ({
  federacion: fed,
  estado: intenta(['inspect', `turnos-${fed}`, '--format', '{{.State.Status}}']),
  ...estadoDe(fed),
}));

comprueba(`nunca se ocupan más plazas que las del presupuesto (${reparto.plazas})`,
  maxPlazas.valor <= reparto.plazas, `máximo visto: ${maxPlazas.valor}`);
comprueba('los contenedores siguen vivos', vivos.every((v) => v.estado === 'running'),
  vivos.map((v) => `${v.federacion}:${v.estado}`).join(' · '));
comprueba('el reparto se ejercita de verdad (alguien espera)',
  vivos.some((v) => v.esperas >= 1) || vivos.every((v) => v.turnos >= 1),
  vivos.map((v) => `${v.federacion}: ${v.esperas} espera(s)`).join(' · '));
/*
 * La propiedad que importa del turno: con más federaciones que plazas, TODAS entran. Si una se quedase fuera, en
 * el servidor sería una federación que no recolecta nunca mientras las demás se turnan.
 */
comprueba('todas las federaciones consiguen su turno', vivos.every((v) => v.turnos >= 1),
  vivos.map((v) => `${v.federacion}:${v.turnos} turno(s)`).join(' · '));

/* ── Al parar: ni plazas fantasma, ni esperas de contenedores muertos que dejen a otros fuera ───────────── */
for (const fed of federaciones) intenta(['stop', `turnos-${fed}`]);
const paradaMs = Date.now();
await espera(8_000);
const plazasDespues = cuentaFichas('slot-*.lock');
const esperasDespues = cuentaFichas('espera-*.ficha');
comprueba('al parar no quedan plazas sin dueño', plazasDespues === 0, `${plazasDespues} plaza(s)`);

/*
 * Y las fichas de ESPERA de esos contenedores muertos: no pueden quedarse ahí para siempre haciendo que los vivos
 * cedan su turno por un fantasma. No se pueden juzgar por el identificador de proceso —el 42 existe en todos los
 * contenedores— así que manda el silencio: se dan por abandonadas al cabo de `SIN_LATIDO_MS` sin señales, y las
 * recoge el siguiente worker que mire la carpeta. Eso hay que esperarlo de verdad.
 */
const esperaMuerta = SIN_LATIDO_MS + 30_000;
console.log(`  esperando ${Math.round(esperaMuerta / 60_000)} min a que esas esperas se consideren abandonadas...`);
while (Date.now() - paradaMs < esperaMuerta) await espera(15_000);

if (esperasDespues === 0) {
  comprueba('las esperas de contenedores muertos se recogen', true, 'no quedó ninguna ficha de espera que recoger');
} else {
  intenta(['start', `turnos-${federaciones[0]}`]);
  await espera(60_000);
  const esperasTrasArrancar = cuentaFichas('espera-*.ficha');
  comprueba('las esperas de contenedores muertos se recogen', esperasTrasArrancar < esperasDespues,
    `${esperasDespues} → ${esperasTrasArrancar} ficha(s) de espera`);
}
for (const fed of federaciones) intenta(['rm', '-f', `turnos-${fed}`]);

const fallos = resultados.filter((r) => !r.bien);
console.log(`\n  ${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas${fallos.length ? ` · FALLAN: ${fallos.map((f) => f.nombre).join(' · ')}` : ' · TODO CORRECTO'}`);

const carpeta = join(raiz, 'pruebas', 'reconstruccion');
mkdirSync(carpeta, { recursive: true });
const sello = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(join(carpeta, `turnos-${sello}.json`), `${JSON.stringify({
  cuando: new Date().toISOString(), federaciones, memoriaGb, plazasDelPresupuesto: reparto.plazas,
  turnoMin, minutos, maxPlazasVistas: maxPlazas.valor, vivos, plazasDespues, esperasDespues,
  esperasTrasArrancar: typeof esperasTrasArrancar === 'undefined' ? null : esperasTrasArrancar, resultados,
}, null, 2)}\n`);
process.exitCode = fallos.length ? 1 : 0;
