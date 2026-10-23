#!/usr/bin/env node
/**
 * Supervisor de los recolectores multideporte del PC: mantiene vivo un proceso por adaptador (plataformas
 * distintas → sitios distintos, así que van en paralelo sin sumar carga a ninguno) y lo relanza si termina.
 * Son peticiones HTTP sin navegador: apenas gastan CPU ni memoria.
 *
 *   node scripts/multideporte/supervisor-multideporte.mjs                 (los de la lista ADAPTADORES)
 *   node scripts/multideporte/supervisor-multideporte.mjs isquad-balonmano (sólo esos)
 *
 * Registro de cada uno en descargas-multideporte/<adaptador>/registro.log. Un solo supervisor a la vez.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
const LISTA = join(AQUI, 'adaptadores-activos.json');
const activos = () => {
  if (process.argv.slice(2).length) return process.argv.slice(2);
  try { return JSON.parse(readFileSync(LISTA, 'utf8')).activos ?? []; } catch { return ['isquad-balonmano', 'isquad-voleibol', 'serversports']; }
};
const DIR = join(RAIZ, 'descargas-multideporte');
mkdirSync(DIR, { recursive: true });
const CERROJO = join(DIR, 'supervisor.pid');
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
if (existsSync(CERROJO) && vivo(Number(readFileSync(CERROJO, 'utf8')))) {
  console.log('Ya hay un supervisor multideporte en marcha.'); process.exit(0);
}
writeFileSync(CERROJO, String(process.pid));

function lanza(nombre) {
  const log = join(DIR, nombre, 'registro.log');
  mkdirSync(dirname(log), { recursive: true });
  const nota = (t) => appendFileSync(log, `${new Date().toISOString()}  ${t}\n`);
  nota(`[supervisor] arranca ${nombre}`);
  const hijo = spawn(process.execPath, [join(AQUI, 'recolector-multideporte.mjs'), 'arrancar', '--adaptador', nombre, '--continuo', '--max', '200'],
    { cwd: RAIZ, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  hijo.stdout.on('data', (d) => appendFileSync(log, d));
  hijo.stderr.on('data', (d) => appendFileSync(log, d));
  hijo.on('close', (codigo) => {
    nota(`[supervisor] ${nombre} terminó con código ${codigo}; se relanza en 5 min`);
    setTimeout(() => lanza(nombre), 5 * 60_000);
  });
}
const lanzados = new Set();
function revisa() {
  for (const a of activos()) if (!lanzados.has(a)) { lanzados.add(a); lanza(a); }
}
revisa();
setInterval(revisa, 10 * 60_000);
