/*
 * VIGILANCIA DE LOS CONTENEDORES: una línea por vuelta con lo que se mira en un servidor.
 *
 * Es el equivalente en Docker de `vigilar-flota.mjs`, y responde a las mismas preguntas desde fuera del
 * programa: qué contenedores están vivos, cuánta memoria usa cada uno (cgroups v2, la cuenta que hace el propio
 * Docker), cuántas veces se ha reiniciado alguno, quién tiene la plaza de navegador y quién espera, y si el
 * conjunto se queda dentro del presupuesto declarado.
 *
 * Sólo lee (docker inspect/exec y el volumen de plazas). Uso:
 *   node scripts/vigilar-docker.mjs [--cada-min 10] [--duracion-min 240] [--prefijo soak-] [--volumen docker_plazas]
 *   node scripts/vigilar-docker.mjs --informe
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };
const soloInforme = argumentos.includes('--informe');
const cadaMin = Number(arg('cada-min', 10));
const duracionMin = Number(arg('duracion-min', 240));
const prefijo = arg('prefijo', '');
const volumenPlazas = arg('volumen', 'docker_plazas');
const presupuestoGb = Number(arg('presupuesto-gb', process.env.FACYLF_MEMORIA_GB ?? 10));
const rutaSalida = resolve(arg('salida', join(raiz, 'pruebas', 'reconstruccion', 'vigilancia-docker.jsonl')));

const intenta = (args, timeout = 60000) => {
  try { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout }); }
  catch { return ''; }
};

/** Los contenedores de la imagen de recolectores (o los que empiecen por el prefijo que se indique). */
function contenedores() {
  const salida = intenta(['ps', '-a', '--format', '{{.Names}}|{{.Image}}|{{.State}}'], 30000);
  return salida.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [nombre, imagen, estado] = l.split('|');
    return { nombre, imagen, estado };
  }).filter((c) => c.imagen.startsWith('facylf-recolectores') && (!prefijo || c.nombre.startsWith(prefijo)));
}

function memoriaMb(nombre) {
  const bruto = intenta(['exec', nombre, 'cat', '/sys/fs/cgroup/memory.current'], 30000).trim();
  const valor = Number(bruto);
  return Number.isFinite(valor) ? Math.round(valor / 1024 / 1024) : null;
}

function vuelta() {
  const cs = contenedores();
  const detalle = cs.map((c) => {
    const inspeccion = intenta(['inspect', c.nombre, '--format', '{{.State.Status}}|{{.RestartCount}}|{{.HostConfig.Memory}}'], 30000).trim().split('|');
    return {
      nombre: c.nombre,
      estado: inspeccion[0] ?? c.estado,
      reinicios: Number(inspeccion[1] ?? 0),
      limiteMb: Math.round(Number(inspeccion[2] ?? 0) / 1024 / 1024),
      memoriaMb: memoriaMb(c.nombre),
    };
  });
  const plazas = intenta(['run', '--rm', '-v', `${volumenPlazas}:/p`, '--entrypoint', 'bash', 'facylf-recolectores:local',
    '-c', 'cat /p/slots-chrome/slot-*.lock 2>/dev/null; echo "---"; ls /p/slots-chrome/*.ficha 2>/dev/null | wc -l'], 120000);
  const [ocupadas = '', esperando = '0'] = plazas.split('---');
  const fichas = ocupadas.split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    cuando: new Date().toISOString(),
    presupuestoGb,
    contenedores: detalle,
    memoriaTotalMb: detalle.reduce((n, c) => n + (c.memoriaMb ?? 0), 0),
    plazasOcupadas: fichas.length,
    plazas: fichas,
    esperando: Number(esperando.trim()) || 0,
  };
}

if (soloInforme) {
  if (!existsSync(rutaSalida)) { console.error(`  no hay fichero de vigilancia en ${rutaSalida}`); process.exit(1); }
  const vueltas = readFileSync(rutaSalida, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const primera = vueltas[0]; const ultima = vueltas[vueltas.length - 1];
  const suma = (v, f) => v.contenedores.reduce((n, c) => n + f(c), 0);
  console.log(`═══ vigilancia de contenedores: ${vueltas.length} vueltas · de ${primera.cuando} a ${ultima.cuando}`);
  console.log(`  contenedores: ${ultima.contenedores.length} (${ultima.contenedores.filter((c) => c.estado === 'running').length} en marcha al final)`);
  console.log(`  memoria del conjunto: min ${Math.min(...vueltas.map((v) => v.memoriaTotalMb))} MB · max ${Math.max(...vueltas.map((v) => v.memoriaTotalMb))} MB · presupuesto ${ultima.presupuestoGb * 1024} MB`);
  console.log(`  por contenedor al final: ${ultima.contenedores.map((c) => `${c.nombre.replace(prefijo, '')}=${c.memoriaMb}MB`).join(' · ')}`);
  console.log(`  reinicios acumulados: ${suma(ultima, (c) => c.reinicios)} (${ultima.contenedores.filter((c) => c.reinicios > 0).map((c) => `${c.nombre}×${c.reinicios}`).join(' ') || 'ninguno'})`);
  console.log(`  plazas ocupadas: min ${Math.min(...vueltas.map((v) => v.plazasOcupadas))} · max ${Math.max(...vueltas.map((v) => v.plazasOcupadas))} · esperando: max ${Math.max(...vueltas.map((v) => v.esperando))}`);
  const excedidos = vueltas.filter((v) => v.memoriaTotalMb > v.presupuestoGb * 1024).length;
  console.log(`  vueltas por encima del presupuesto: ${excedidos}`);
  process.exit(0);
}

mkdirSync(join(raiz, 'pruebas', 'reconstruccion'), { recursive: true });
const fin = Date.now() + duracionMin * 60000;
console.log(`═══ vigilando contenedores cada ${cadaMin} min durante ${duracionMin} min · prefijo '${prefijo}' · ${rutaSalida}`);
while (Date.now() < fin) {
  try {
    const v = vuelta();
    appendFileSync(rutaSalida, `${JSON.stringify(v)}\n`);
    console.log(`  ${v.cuando.slice(11, 16)}Z · ${v.contenedores.length} contenedores · memoria ${v.memoriaTotalMb} MB de ${v.presupuestoGb * 1024} MB · plazas ${v.plazasOcupadas}${v.esperando ? ` (+${v.esperando} esperando)` : ''} · reinicios ${v.contenedores.reduce((n, c) => n + c.reinicios, 0)}`);
  } catch (error) {
    console.log(`  ${new Date().toISOString().slice(11, 16)}Z · error en la vuelta: ${error.message}`);
  }
  await new Promise((r) => setTimeout(r, cadaMin * 60000));
}
console.log('  (fin de la vigilancia de contenedores)');
