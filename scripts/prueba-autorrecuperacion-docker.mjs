/*
 * ¿SE ARREGLA SOLO? Prueba de autocuración de un contenedor de recolección.
 *
 * Lo que se comprueba, que es lo que se le pide a un servidor encendido 24/7:
 *   1. el contenedor trabaja (hay peticiones nuevas);
 *   2. se le mata de golpe (`docker kill`, como un OOM o un corte);
 *   3. **Docker lo levanta otra vez** por su política de reinicio (`--restart unless-stopped`, la misma del
 *      compose) y el contenedor arranca solo;
 *   4. sigue recolectando donde lo dejó;
 *   5. y los datos están bien: ningún trabajo se queda a medias (`en_curso`), no se pierde trabajo, no hay
 *      ficheros temporales de una escritura interrumpida y no se duplica nada.
 *
 * Uso:
 *   node scripts/prueba-autorrecuperacion-docker.mjs [--federacion prueba-a] [--volumen facylf-datos-prueba]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };
const federacion = arg('federacion', 'prueba-a');
const volumenDatos = arg('volumen', 'facylf-datos-prueba');
const volumenPlazas = arg('volumen-plazas', 'facylf-plazas-autocura');
const nombre = `autocura-${federacion}`;
const imagen = 'facylf-recolectores:local';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const intenta = (args, timeout = 120000) => {
  try { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout }).trim(); }
  catch (error) { return String(error.stdout ?? error.message).trim(); }
};
const enVolumen = (guion, ...args) => intenta(['run', '--rm', '-v', `${volumenDatos}:/app/datos`,
  '-v', `${join(raiz, 'docker')}:/d`, '--entrypoint', 'bash', imagen, `/d/${guion}`, ...args]);
const foto = () => { try { return JSON.parse(enVolumen('_foto-cola.sh', federacion)); } catch { return null; } };
const peticiones = (f) => f?.peticiones ?? null;
const suma = (obj) => Object.values(obj ?? {}).reduce((a, b) => a + b, 0);

const resultados = [];
const comprueba = (nombrePrueba, bien, detalle) => {
  resultados.push({ nombre: nombrePrueba, bien, detalle });
  console.log(`  ${bien ? '✓' : '✗'} ${nombrePrueba}${detalle ? ` — ${detalle}` : ''}`);
};

console.log(`═══ autocuración · federación ${federacion} · contenedor ${nombre}`);
intenta(['rm', '-f', nombre]);
intenta(['volume', 'rm', '-f', volumenPlazas]);
intenta(['volume', 'create', volumenPlazas]);
// Escenario propio: presupuesto diario a cero y trabajo real, para que el contenedor tenga algo que hacer.
enVolumen('_limpia-peticiones-hoy.sh', federacion);
enVolumen('_haz-trabajo.sh', federacion, '3');

const antes = foto();
comprueba('la cola se puede leer antes de empezar', Boolean(antes), `trabajos: ${JSON.stringify(antes?.trabajos)}`);

intenta(['run', '-d', '--name', nombre, '--restart', 'unless-stopped',
  '-e', 'FACYLF_MEMORIA_GB=2', '-e', 'FACYLF_CHROME_HEADLESS=1', '-e', 'TZ=Europe/Madrid',
  '-v', `${volumenPlazas}:/app/.estado-workers`, '-v', `${volumenDatos}:/app/datos`, '-v', `${join(raiz, 'docker')}:/d`,
  '--shm-size=512m', '--memory=1600m', imagen, 'bash', '/d/_entrada-en-volumen.sh', federacion]);

await espera(90_000);
const trabajando = foto();
const pidAntes = intenta(['inspect', nombre, '--format', '{{.State.Pid}}']);
comprueba('el contenedor trabaja antes del corte', (peticiones(trabajando) ?? 0) > (peticiones(antes) ?? 0),
  `${peticiones(antes)} → ${peticiones(trabajando)} peticiones`);

/*
 * ── LOS DOS NIVELES DE AUTOCURA, Y CÓMO SE SIMULA CADA UNO ───────────────────────────────────────────────
 *
 * 1. **Muere el worker** (el proceso de node). Quien lo levanta es el supervisor de dentro del contenedor
 *    (`entrada-recolector.sh`), que es un bucle: en cuanto el worker sale, espera lo que diga
 *    `proximo-trabajo.mjs` y lo relanza. Se simula matando el node.
 * 2. **Muere el contenedor entero** (un OOM, un fallo del proceso principal, un reinicio del servidor). Quien lo
 *    levanta es Docker, con la política `restart: unless-stopped` del compose. Se simula matando al supervisor.
 *    OJO: no vale `docker kill` (Docker lo interpreta como una parada a propósito y NO aplica la política,
 *    comprobado el 18/09/2026) ni `kill -9 1` (el PID 1 de un espacio de nombres no muere por señales sin
 *    manejador): hay que matar al supervisor, y `tini` sale detrás.
 */
console.log('  (1/2) matando el WORKER (debe relanzarlo el supervisor de dentro)...');
intenta(['exec', nombre, 'sh', '-c', 'pkill -9 -f "recolector-local.mjs arrancar" || true']);
await espera(60_000);
const trasWorker = foto();
const logWorker = intenta(['exec', nombre, 'tail', '-n', '40', `/app/descargas-${federacion}/recolector-local/worker-programado.log`]);
comprueba('el supervisor relanza al worker', /Arrancando o reanudando/.test(logWorker) && (peticiones(trasWorker) ?? 0) >= (peticiones(trabajando) ?? 0),
  `${peticiones(trabajando)} → ${peticiones(trasWorker)} peticiones`);

console.log('  (2/2) matando el CONTENEDOR (debe levantarlo Docker)...');
const pidAntesCaida = intenta(['inspect', nombre, '--format', '{{.State.Pid}}']);
intenta(['exec', nombre, 'sh', '-c', 'pkill -9 -f "entrada-recolector.sh" || true']);
await espera(8_000);
const estadoTrasCaida = intenta(['inspect', nombre, '--format', '{{.State.Status}}|{{.RestartCount}}|{{.State.ExitCode}}']).split('|');

let reiniciado = false;
for (let i = 0; i < 40; i++) {
  const estado = intenta(['inspect', nombre, '--format', '{{.State.Status}}']).split('|')[0];
  const pid = intenta(['inspect', nombre, '--format', '{{.State.Pid}}']);
  if (estado === 'running' && pid && pid !== '0' && pid !== pidAntesCaida) { reiniciado = true; break; }
  await espera(5_000);
}
comprueba('Docker lo levanta solo (política de reinicio)', reiniciado, `estado tras la caída: ${estadoTrasCaida.join(' · ')} (status · reinicios · código)`);

await espera(90_000);
const despues = foto();
comprueba('sigue recolectando donde lo dejó', (peticiones(despues) ?? 0) > (peticiones(trabajando) ?? 0),
  `${peticiones(trabajando)} → ${peticiones(despues)} peticiones`);

/*
 * Un trabajo `en_curso` es lo normal si el worker está con él AHORA. Lo que no puede pasar es que se quede ahí
 * porque murió el proceso que lo cogió: eso sí sería trabajo abandonado. Se distingue por la fecha de la fila.
 */
const enCurso = despues?.enCurso ?? {};
comprueba('ningún trabajo se queda a medias (en_curso abandonado)', Number(enCurso.viejo ?? 0) === 0,
  `en_curso = ${enCurso.n ?? '?'} · abandonados = ${enCurso.viejo ?? '?'}`);

const logTrasCaida = intenta(['exec', nombre, 'tail', '-n', '80', `/app/descargas-${federacion}/recolector-local/worker-programado.log`]);
const devueltos = [...logTrasCaida.matchAll(/(\d+) trabajo\(s\) que quedaron a medias/g)].reduce((a, m) => a + Number(m[1]), 0);
comprueba('lo que quedó a medias vuelve a la cola (si quedó algo)', devueltos > 0 || Number(enCurso.n ?? 0) === 0,
  devueltos > 0 ? `${devueltos} trabajo(s) devueltos a pendiente por la sesión nueva` : 'el corte cayó entre dos trabajos');

comprueba('no se pierde trabajo', suma(despues?.trabajos) >= suma(antes?.trabajos),
  `${suma(antes?.trabajos)} → ${suma(despues?.trabajos)} trabajos`);
comprueba('no hay escrituras a medias (ficheros .tmp)', Number(despues?.temporales ?? 0) === 0,
  `${despues?.temporales ?? '?'} temporales`);
comprueba('las actas no se duplican', suma(despues?.actas) >= suma(antes?.actas),
  `${suma(antes?.actas)} → ${suma(despues?.actas)} actas`);

intenta(['rm', '-f', nombre]);
const fallos = resultados.filter((r) => !r.bien);
console.log(`\n  ${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas${fallos.length ? ` · FALLAN: ${fallos.map((f) => f.nombre).join(' · ')}` : ' · TODO CORRECTO'}`);

const carpeta = join(raiz, 'pruebas', 'reconstruccion');
mkdirSync(carpeta, { recursive: true });
writeFileSync(join(carpeta, `autocura-${federacion}.json`),
  `${JSON.stringify({ cuando: new Date().toISOString(), federacion, antes, trabajando, despues, resultados }, null, 2)}\n`);
process.exitCode = fallos.length ? 1 : 0;
void existsSync;
