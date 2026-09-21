/*
 * REINICIA LOS RECOLECTORES PNFG (los que usan Chrome) para que estrenen el código nuevo.
 *
 * Un worker de estos procesos carga su guion UNA vez al arrancar: los cambios no llegan a los que ya están
 * corriendo hasta que cambian de sesión, y una sesión dura 1,5-2,5 h. Cuando hay un arreglo que importa —como
 * el reciclado de Chrome que se disparaba en cada trabajo—, esperar a la rotación natural es esperar horas de
 * recolección lenta. Reiniciarlos es lo que lo aplica ya.
 *
 * Qué mata y qué NO:
 *   · mata SÓLO procesos `node` cuya línea de órdenes es `recolector-local.mjs … --perfil perfiles/<fed>.json`
 *     (una federación por proceso, comprobada una a una); con `--simular` sólo lo cuenta;
 *   · NO toca supervisores, ni chromedriver, ni Chrome, ni el arnés del agente (se niega si la línea de
 *     órdenes menciona `deepseek-harness` o `apps/cli`), ni las federaciones iSquad (Madrid/Valencia, que no
 *     usan Chrome) ni Cataluña (que tiene su propio recolector);
 *   · NO toca la cola: como mucho se pierde la petición en curso, y el trabajo vuelve a quedar pendiente porque
 *     la sesión que arranca pone en 'pendiente' lo que quedó 'en_curso'.
 *
 * Quien relanza es el supervisor de cada federación, que está esperando a que su worker termine: en cuanto
 * muere, calcula la espera con `proximo-trabajo.mjs` (0 s si hay trabajo disponible → 20 s) y lo vuelve a
 * levantar. Por eso este guion NO lanza nada.
 *
 * Uso: node scripts/_reinicia-pnfg.mjs [--simular]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const simular = process.argv.includes('--simular');

function procesos() {
  const ps = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const salida = execFileSync(ps, ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { "$($_.ProcessId)|$($_.CreationDate.ToString('s'))|$($_.CommandLine)" }`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 });
  return salida.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [pid, inicio, ...resto] = l.split('|');
    return { pid: Number(pid), inicio, linea: resto.join('|') };
  });
}

const candidatos = [];
for (const p of procesos()) {
  const l = p.linea;
  if (!l.includes('recolector-local.mjs')) continue;
  // Con `--perfil` la federación es la del perfil; sin él es Castilla y León, que usa el perfil por defecto y
  // su carpeta `descargas-federacion`.
  const conPerfil = /perfiles\\?([a-z0-9\-]+)\.json/i.exec(l)?.[1];
  const perfil = conPerfil ?? (l.includes('--perfil') ? null : 'federacion');
  if (!perfil) continue;
  if (l.includes('deepseek-harness') || l.includes('apps/cli') || l.includes('apps\\cli')) {
    console.log(`  ¡ojo! un proceso de recolector menciona el arnés del agente; no se toca: ${l.slice(0, 120)}`);
    continue;
  }
  const base = join(raiz, `descargas-${perfil}`, 'recolector-local', 'cola-v2.sqlite');
  let disponibles = null;
  if (existsSync(base)) {
    const db = new DatabaseSync(base, { readOnly: true });
    disponibles = db.prepare(`select count(*) n from trabajos where estado='pendiente'
      and (siguiente_intento is null or siguiente_intento <= ?)`).get(new Date().toISOString()).n;
    db.close();
  }
  candidatos.push({ pid: p.pid, federacion: perfil, inicio: p.inicio, disponibles });
}

if (!candidatos.length) { console.log('  no hay recolectores PNFG vivos'); process.exit(0); }
console.log(`  recolectores PNFG vivos: ${candidatos.length}${simular ? '  (SIMULACIÓN: no se mata nada)' : ''}`);
for (const c of candidatos) {
  console.log(`    ${c.federacion.padEnd(20)} PID ${String(c.pid).padEnd(7)} desde ${c.inicio} · trabajo disponible ahora: ${c.disponibles}`);
}

const evidencia = { cuando: new Date().toISOString(), simular, reiniciados: candidatos };
const ruta = join(raiz, 'pruebas', 'reconstruccion', 'reinicio-pnfg-aplicar-arreglo.json');

if (!simular) {
  let matados = 0;
  for (const c of candidatos) {
    try { process.kill(c.pid, 'SIGKILL'); matados += 1; console.log(`    matado ${c.federacion} (PID ${c.pid})`); }
    catch (error) { console.log(`    no se pudo matar ${c.federacion} (PID ${c.pid}): ${error.message}`); }
  }
  evidencia.matados = matados;
  mkdirSync(join(raiz, 'pruebas', 'reconstruccion'), { recursive: true });
  writeFileSync(ruta, `${JSON.stringify(evidencia, null, 2)}\n`);
  console.log(`  matados: ${matados} · evidencia: ${ruta}`);
}
