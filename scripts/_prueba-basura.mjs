/*
 * PRUEBA: ¿crece la basura de Chrome mientras los recolectores trabajan?
 *
 * Es la prueba 2 del encargo del servidor de 10 GB. En vez de mirar una vez y suponer, toma varias muestras
 * separadas en el tiempo y dice la TASA de crecimiento, que es lo que decide si el barrido cada 5 minutos
 * basta o hace falta limpiar en otro sitio.
 *
 * Además comprueba, en cada muestra: si la tarea de limpieza se ha ejecutado (su código de resultado), cuántos
 * workers han rotado al código que limpia su propio perfil, y cuánta memoria libre queda.
 *
 * Uso: node scripts/_prueba-basura.mjs [muestras] [segundosEntreMuestras]
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { freemem } from 'node:os';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const muestras = Number(process.argv[2] ?? 4);
const espera = Number(process.argv[3] ?? 150);
const PS = `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;

const huerfanos = () => {
  const r = spawnSync(PS, ['-NoProfile', '-File', join(raiz, 'scripts', 'limpiar-chrome-huerfano.ps1'), '-Simular'], { encoding: 'utf8', timeout: 120000 });
  const m = /rfanos de recolector: (\d+) procesos/.exec(String(r.stdout ?? ''));
  return m ? Number(m[1]) : 0;
};
const tarea = () => {
  const r = spawnSync('schtasks', ['/query', '/tn', 'FACyLF-LimpiarChrome', '/fo', 'LIST', '/v'], { encoding: 'utf8', timeout: 30000 });
  const texto = String(r.stdout ?? '');
  return {
    resultado: (/ltimo resultado:\s*(-?\d+)/.exec(texto)?.[1]) ?? '?',
    proxima: (/Hora pr[^:]*:\s*(.+)/.exec(texto)?.[1] ?? '').trim(),
  };
};
const rotaciones = () => {
  let n = 0;
  for (const c of readdirSync(raiz).filter((x) => x.startsWith('descargas-'))) {
    const log = join(raiz, c, 'recolector-local', 'worker-programado.log');
    if (!existsSync(log)) continue;
    n += (readFileSync(log, 'utf8').match(/limpieza del navegador/g) ?? []).length;
  }
  return n;
};

console.log(`muestra | huérfanos | memoria libre | tarea (resultado) | workers que limpian solos`);
const lecturas = [];
for (let i = 1; i <= muestras; i += 1) {
  const h = huerfanos();
  const t = tarea();
  const gb = (freemem() / 1024 ** 3).toFixed(2);
  const rot = rotaciones();
  lecturas.push({ hora: new Date().toISOString(), h, gb: Number(gb) });
  console.log(`  ${i}     | ${String(h).padStart(9)} | ${String(gb).padStart(10)} GB | ${String(t.resultado).padStart(17)} | ${rot}`);
  if (i < muestras) await new Promise((r) => setTimeout(r, espera * 1000));
}

const primera = lecturas[0];
const ultima = lecturas[lecturas.length - 1];
const minutos = ((new Date(ultima.hora) - new Date(primera.hora)) / 60000).toFixed(1);
const delta = ultima.h - primera.h;
console.log(`\nen ${minutos} min: huérfanos ${primera.h} → ${ultima.h} (${delta >= 0 ? '+' : ''}${delta}) · ` +
  `tasa ${(delta / Number(minutos) * 60).toFixed(0)}/hora · memoria libre ${primera.gb} → ${ultima.gb} GB`);
console.log(delta <= 0
  ? '✓ la basura NO crece: el barrido y la limpieza de cada worker bastan'
  : `⚠ la basura crece ${(delta / Number(minutos) * 60).toFixed(0)} por hora: el barrido de 5 minutos no basta sola`);
