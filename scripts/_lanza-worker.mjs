/*
 * Lanza UNA sesión del recolector de una federación, despegada, con su salida añadida a su registro.
 *
 * Para qué: hacerlo desde PowerShell con `Start-Process cmd /c "... >> log 2>&1"` falla en silencio con las
 * comillas y las redirecciones (comprobado el 17/09/2026: dos intentos, ningún proceso y ningún mensaje). Aquí
 * el hijo se abre con Node y su salida va al registro en modo AÑADIR, sin pasar por un intérprete de órdenes.
 *
 * Es para pruebas y reanudaciones puntuales: quien mantiene viva la federación sigue siendo su supervisor.
 * Antes de lanzar nada se comprueba que no haya ya un worker de esa federación (no se duplican) y que la
 * federación no esté en pausa preventiva.
 *
 * Uso: node scripts/_lanza-worker.mjs <federacion> [--max N]
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, openSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const iMax = argumentos.indexOf('--max');
const max = iMax >= 0 ? argumentos[iMax + 1] : null;
const federacion = argumentos.find((a, i) => !a.startsWith('--') && i !== iMax + 1);
if (!federacion) { console.error('Uso: node scripts/_lanza-worker.mjs <federacion> [--max N]'); process.exit(1); }

const perfil = join(raiz, 'perfiles', `${federacion}.json`);
const carpeta = join(raiz, `descargas-${federacion}`, 'recolector-local');
const base = join(carpeta, 'cola-v2.sqlite');
if (!existsSync(base)) { console.error(`  no hay cola para ${federacion}`); process.exit(1); }

// Las federaciones iSquad (Madrid y Valencia) tienen su propio guion y no usan perfil.
const iSquad = federacion === 'madrid' || federacion === 'valencia';
const guion = join(raiz, 'scripts', iSquad ? `recolector-${federacion}.mjs` : 'recolector-local.mjs');
if (!existsSync(guion)) { console.error(`  no existe el recolector ${guion}`); process.exit(1); }
if (!iSquad && !existsSync(perfil)) { console.error(`  no existe el perfil ${perfil}`); process.exit(1); }

const db = new DatabaseSync(base, { readOnly: true });
const pausa = db.prepare(`select valor from metadatos where clave='pausa_global_hasta'`).get()?.valor ?? '';
db.close();
if (pausa && new Date(pausa).getTime() > Date.now()) {
  console.error(`  ${federacion} está en pausa preventiva hasta ${pausa}: no se lanza nada`);
  process.exit(1);
}

/** Líneas de órdenes de los recolectores vivos, para no duplicar el de esta federación. */
function lineasDeRecolectores() {
  const ps = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    const salida = execFileSync(ps, ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*recolector-*' } | ForEach-Object { $_.CommandLine }`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
    return salida.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch { return []; }
}

const marca = iSquad ? `recolector-${federacion}.mjs` : `perfiles${'\\'}${federacion}.json`;
const yaVivo = lineasDeRecolectores().some((l) => l.includes(marca) && l.includes('arrancar'));
if (yaVivo) { console.error(`  ya hay un worker vivo de ${federacion}: no se lanza otro`); process.exit(1); }

const salida = openSync(join(carpeta, 'worker-programado.log'), 'a');
const args = iSquad ? ['arrancar'] : ['arrancar', '--perfil', perfil];
if (max) args.push('--max', String(max));
const hijo = spawn(process.execPath, [guion, ...args], { cwd: raiz, detached: true, stdio: ['ignore', salida, salida] });
hijo.unref();
console.log(`  ${federacion}: worker lanzado (PID ${hijo.pid})${max ? ` con --max ${max}` : ''}`);
