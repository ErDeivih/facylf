/*
 * PRUEBA DE ACEPTACIÓN DEL DESPLIEGUE EN DOCKER.
 *
 * Comprueba, de una pasada y sin mirar a mano, lo que tiene que cumplirse para dar por bueno el despliegue en un
 * servidor: que el compose es válido, que los contenedores arrancan y recolectan de verdad, que el semáforo de
 * plazas funciona ENTRE contenedores, que la memoria del conjunto se queda dentro del presupuesto declarado y
 * que al parar se suelta la plaza (nada de plazas fantasma).
 *
 * No inventa criterios: usa los que ya están escritos en el programa (el reparto de plazas de
 * `presupuesto-memoria.mjs` y el registro del propio contenedor) y los comprueba uno a uno.
 *
 * Uso:
 *   node scripts/prueba-aceptacion-docker.mjs --federaciones prueba-10gb
 *   node scripts/prueba-aceptacion-docker.mjs --federaciones prueba-10gb,canarias --volumen-datos facylf-datos-prueba
 *   node scripts/prueba-aceptacion-docker.mjs --federaciones prueba-10gb --con-pasada
 *
 * En un servidor Debian, con las colas montadas de verdad, basta con `--federaciones prueba-10gb` primero y
 * luego el compose completo. En Windows hace falta `--volumen-datos` (SQLite no abre las colas por el puente de
 * carpetas de Docker Desktop; ver docker/README.md) y las colas copiadas en ese volumen.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { repartePlazas } from './lib/presupuesto-memoria.mjs';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };
const federaciones = String(arg('federaciones', 'prueba-10gb')).split(',').map((f) => f.trim()).filter(Boolean);
const volumenDatos = arg('volumen-datos', null);
const conPasada = argumentos.includes('--con-pasada');
const memoriaGb = Number(arg('memoria-gb', process.env.FACYLF_MEMORIA_GB ?? 10));
const compose = ['compose', '-f', join(raiz, 'docker', 'compose.yml')];
const proyecto = 'docker';   // nombre del proyecto de compose (la carpeta)
/*
 * VOLUMEN DE PLAZAS PROPIO, y se vacía al empezar. La primera versión usaba ``, el mismo que las
 * demás pruebas, y heredaba fichas de plazas de experimentos anteriores: sus contenedores ya no existían, pero
 * el latido de esas fichas era reciente, así que contaban como plazas ocupadas y la prueba se marcaba en rojo
 * (3 fichas donde el presupuesto permite 1). Una prueba que mide el reparto tiene que empezar con el marcador a
 * cero.
 */
const volumenPlazas = 'facylf-plazas-aceptacion';

const corre = (args, opciones = {}) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: opciones.timeout ?? 300000 });
const intenta = (args) => { try { return corre(args); } catch (error) { return String(error.stdout ?? error.message); } };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const resultados = [];
const comprueba = (nombre, bien, detalle) => {
  resultados.push({ nombre, bien, detalle });
  console.log(`  ${bien ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

/* ── 1. El compose es válido y conoce los servicios que se van a probar ───────────────────────────── */
console.log(`═══ prueba de aceptación · federaciones ${federaciones.join(', ')} · presupuesto ${memoriaGb} GB`);
try {
  corre([...compose, 'config', '--quiet']);
  /*
   * Los servicios se piden con TODOS los perfiles activados: la federación de prueba vive en el perfil `pruebas`
   * (para que un `docker compose up -d` en el servidor no la levante), así que sin `--profile '*'` no aparecía y
   * esta comprobación decía «faltan: prueba-10gb» — medido el 19/09/2026. Si la versión de Compose no entiende
   * el comodín, se cae a la consulta normal en vez de dar la prueba por fallida.
   */
  const conPerfiles = intenta([...compose, '--profile', '*', 'config', '--services']);
  const listado = conPerfiles.includes('prueba-10gb') ? conPerfiles : corre([...compose, 'config', '--services']);
  const servicios = listado.split('\n').map((s) => s.trim()).filter(Boolean);
  const faltan = federaciones.filter((f) => !servicios.includes(f));
  comprueba('el compose es válido', true, `${servicios.length} servicios`);
  comprueba('existe un servicio por federación', faltan.length === 0, faltan.length ? `faltan: ${faltan.join(', ')}` : 'todas');
} catch (error) {
  comprueba('el compose es válido', false, error.message.split('\n')[0]);
}

const reparto = repartePlazas({ memoriaGb, memoriaTotalGb: memoriaGb });
console.log(`  (el gobernador repartiría ${reparto.plazas} plazas de ${reparto.costePorRecolectorGb} GB)`);

/* ── 2. Arrancar los contenedores de prueba ───────────────────────────────────────────────────────── */
console.log('  arrancando contenedores...');
/*
 * Se retiran SÓLO los restos de esta prueba (sus contenedores `aceptacion-*` y su volumen de plazas).
 *
 * Antes se hacía `docker compose down -v` del proyecto entero: lanzar la prueba en el servidor con la recolección
 * en marcha tumbaba TODA la flota y borraba el volumen de plazas que estaban usando los contenedores vivos.
 * Medido el 19/09/2026, cuando la propia prueba se llevó por delante el contenedor de la federación de prueba que
 * acababa de levantar. Una prueba no puede tocar lo que no es suyo.
 */
intenta(['rm', '-f', ...federaciones.map((f) => `aceptacion-${f}`)]);
const restos = intenta(['ps', '-a', '--filter', 'name=aceptacion-', '--format', '{{.Names}}'])
  .split('\n').map((n) => n.trim()).filter(Boolean);
if (restos.length) intenta(['rm', '-f', ...restos]);
// El marcador de plazas, a cero: si no, la prueba mide el reparto de otro experimento. Es SU volumen, no el del
// compose, así que vaciarlo no afecta a nadie más.
intenta(['volume', 'rm', '-f', volumenPlazas]);
intenta(['volume', 'create', volumenPlazas]);
/*
 * LA PRUEBA SE PREPARA SU PROPIO ESCENARIO. Las colas de prueba son copias de otras y arrastran su presupuesto
 * diario ya gastado (200/200) y su trabajo hecho, así que sin esto los contenedores no abren ni un navegador:
 * la prueba decía «0 fichas de plaza» y «el contenedor no trabaja» cuando el contenedor estaba haciendo lo
 * correcto —no abrir nada porque no había nada que pedir—. Se deja el presupuesto a cero y se da trabajo real
 * (unos trabajos de la temporada en curso) a cada federación de prueba.
 */
if (volumenDatos) {
  const enVolumen = (guion, args) => intenta(['run', '--rm', '-v', `${volumenDatos}:/app/datos`,
    '-v', `${join(raiz, 'docker')}:/d`, '--entrypoint', 'bash', 'facylf-recolectores:local', `/d/${guion}`, ...args]);
  enVolumen('_limpia-peticiones-hoy.sh', federaciones);
  for (const fed of federaciones) enVolumen('_haz-trabajo.sh', [fed, '3']);
}
const entorno = { ...process.env, FACYLF_MEMORIA_GB: String(memoriaGb), FACYLF_TURNO_PLAZA_MIN: '1', FACYLF_CHROME_HEADLESS: '1' };
const comandos = [];
for (const fed of federaciones) {
  // Con `--volumen-datos` (Windows) la cola va en el volumen y NO se monta la carpeta del host: montarla también
  // dejaría el worker leyendo por el puente de 9p, que es justo lo que SQLite no soporta.
  const volumenes = volumenDatos
    ? ['-v', `${volumenDatos}:/app/datos`, '-v', `${join(raiz, 'docker')}:/d`]
    : ['-v', `${join(raiz, 'descargas-' + fed)}:/app/descargas-${fed}`];
  comandos.push(['run', '-d', '--name', `aceptacion-${fed}`, '-e', `FACYLF_MEMORIA_GB=${memoriaGb}`,
    '-e', 'FACYLF_TURNO_PLAZA_MIN=1', '-e', 'FACYLF_CHROME_HEADLESS=1', '-e', 'TZ=Europe/Madrid',
    // El volumen de plazas es lo que hace que el semáforo sea de TODOS los contenedores: sin él, cada uno
    // tendría su propio `.estado-workers` y el reparto no se repartiría nada (le pasó a esta prueba).
    '-v', `${volumenPlazas}:/app/.estado-workers`,
    ...volumenes,
    '--shm-size=512m', '--memory=1600m', 'facylf-recolectores:local',
    ...(volumenDatos ? ['bash', '/d/_entrada-en-volumen.sh', fed] : ['bash', 'docker/entrada-recolector.sh', fed])]);
}
for (const c of comandos) intenta(c);
await espera(90_000);

/* ── 3. Los contenedores están vivos y recolectan ─────────────────────────────────────────────────── */
let peticionesTotales = 0;
for (const fed of federaciones) {
  const estado = intenta(['inspect', `aceptacion-${fed}`, '--format', '{{.State.Status}}']).trim();
  const log = intenta(['exec', `aceptacion-${fed}`, 'tail', '-n', '400', `/app/descargas-${fed}/recolector-local/worker-programado.log`]);
  const peticiones = (log.match(/✓ |→ /g) ?? []).length;
  peticionesTotales += peticiones;
  /*
   * VIVO Y COHERENTE, no «haciendo peticiones». Una federación de prueba puede no tener nada que pedir (Canarias
   * tiene todo su trabajo aplazado a partidos que no se han jugado), y entonces lo correcto es que su contenedor
   * esté vivo y su registro diga que no abre el navegador: eso es un aprobado, no un fallo. Exigir peticiones a
   * quien no tiene trabajo era marcar en rojo un comportamiento correcto.
   */
  const sinTrabajo = /Sin trabajo disponible ahora|Presupuesto diario agotado/.test(log);
  comprueba(`el contenedor de ${fed} está vivo y coherente`, estado === 'running' && (peticiones > 0 || sinTrabajo),
    `estado ${estado}, ${peticiones} líneas de trabajo${sinTrabajo ? ' (y su registro dice que no hay nada que pedir)' : ''}`);
}

/* ── 4. El semáforo de plazas es de TODOS los contenedores ────────────────────────────────────────── */
// La plaza aparece y desaparece con cada sesión (al ceder el turno se suelta), así que se sondea un rato en
// vez de mirar una vez: una foto en el hueco entre sesiones daría un falso negativo —y se lo dio—.
//
// Y se cuentan SÓLO las plazas (`slot-*.lock`), no todo lo que hay en la carpeta. Dentro de esa misma carpeta
// viven las fichas de ESPERA (`espera-pnfg-*.ficha`), que son lo normal cuando hay más contenedores que plazas:
// con tres federaciones y una plaza, dos están esperando turno. Contarlas como plazas hacía que la prueba se
// marcara en rojo por el reparto funcionando bien —«2 ≤ 1» y «1 ficha fantasma»—, medido el 19/09/2026.
const cuentaEnElVolumen = (patron) => Number(intenta(['run', '--rm', '-v', `${volumenPlazas}:/p`, '--entrypoint', 'bash',
  'facylf-recolectores:local', '-c', `ls /p/slots-chrome/${patron} 2>/dev/null | wc -l`]).trim()) || 0;
const cuentaPlazas = () => cuentaEnElVolumen('slot-*.lock');
let ocupadas = 0;
for (let i = 0; i < 12 && ocupadas === 0; i++) {
  ocupadas = cuentaPlazas();
  if (!ocupadas) await espera(5_000);
}
const esperando = cuentaEnElVolumen('espera-*.ficha');
comprueba('hay una ficha de plaza en el volumen compartido', ocupadas >= 1, `${ocupadas} ficha(s) de plaza`);
comprueba(`no se conceden más plazas de las del presupuesto (${reparto.plazas})`, ocupadas <= reparto.plazas,
  `${ocupadas} ≤ ${reparto.plazas} (y ${esperando} federación(es) esperando turno)`);

/* ── 5. La memoria del conjunto, medida DENTRO de cada contenedor (cgroups) ───────────────────────── */
let usadaMb = 0;
for (const fed of federaciones) {
  const bruto = intenta(['exec', `aceptacion-${fed}`, 'cat', '/sys/fs/cgroup/memory.current']).trim();
  const mb = Number(bruto) / 1024 / 1024;
  if (Number.isFinite(mb)) usadaMb += mb;
}
const presupuestoMb = memoriaGb * 1024;
comprueba('el conjunto se queda dentro del presupuesto', usadaMb > 0 && usadaMb <= presupuestoMb,
  `${usadaMb.toFixed(0)} MB de ${presupuestoMb} MB (${federaciones.length} contenedor(es))`);

/* ── 6. La pasada del fin de semana, dentro de un contenedor ──────────────────────────────────────── */
if (conPasada) {
  const salida = intenta(['run', '--rm', ...(volumenDatos ? ['-v', `${volumenDatos}:/app/datos`] : []),
    '-v', `${join(raiz, 'docker')}:/d`, '--entrypoint', 'bash', 'facylf-recolectores:local',
    ...(volumenDatos
      ? ['/d/_pasada-en-volumen.sh', ...federaciones]
      : ['-c', `node scripts/ingesta-fin-de-semana.mjs --informe --federaciones ${federaciones.join(',')}`])]);
  const ok = /TOTAL: \d+ federaciones/.test(salida);
  comprueba('la pasada del fin de semana corre en el contenedor', ok, ok ? (salida.match(/TOTAL: .*/)?.[0] ?? '') : salida.split('\n').slice(-3).join(' '));
}

/* ── 7. Al parar, la plaza se suelta ─────────────────────────────────────────────────────────────── */
for (const fed of federaciones) intenta(['stop', `aceptacion-${fed}`]);
await espera(8_000);
// Sólo plazas: una ficha de ESPERA que deje un contenedor parado a lo bruto no es una plaza fantasma (ningún
// navegador está abierto por ella) y el siguiente worker la recoge al mirar la carpeta.
const plazasDespues = cuentaPlazas();
comprueba('al parar no quedan plazas fantasma', plazasDespues === 0, `${plazasDespues} plaza(s) sin dueño`);
for (const fed of federaciones) intenta(['rm', '-f', `aceptacion-${fed}`]);

/* ── Resumen ─────────────────────────────────────────────────────────────────────────────────────── */
const fallos = resultados.filter((r) => !r.bien);
console.log(`\n  ${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas${fallos.length ? ` · FALLAN: ${fallos.map((f) => f.nombre).join(' · ')}` : ' · TODO CORRECTO'}`);
if (peticionesTotales === 0) console.log('  (ojo: ningún contenedor anotó trabajo; revisa su registro dentro del contenedor)');
process.exitCode = fallos.length ? 1 : 0;
void proyecto; void existsSync;
