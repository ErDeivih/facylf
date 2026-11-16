#!/usr/bin/env node
/*
 * actualiza-semanal.mjs — un solo comando para recalcular todo lo que depende de la jornada nueva.
 *
 * Hace, en orden y en un proceso:
 *   1. `01-parametros.mjs`   fuerza de ataque/defensa, media de la liga y ventaja de casa;
 *   2. `02-predicciones.mjs` matriz 0-0…5-5 y 1-X-2 de cada partido de la temporada;
 *   3. `03-simulacion.mjs`   clasificación final estimada por Monte Carlo.
 *
 * Lo llama la tarea nocturna los domingos, después de la ingesta (`scripts/ingesta-nocturna.ps1`), y se
 * puede lanzar a mano. Es idempotente: cada paso borra y recalcula lo suyo; repetirlo no duplica nada.
 *
 * Uso:
 *   node scripts/prediccion/actualiza-semanal.mjs
 *   node scripts/prediccion/actualiza-semanal.mjs --temporada 2026-27 --simulaciones 5000
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const valor = (bandera, porDefecto) => {
  const i = args.indexOf(bandera);
  return i >= 0 ? args[i + 1] : porDefecto;
};
const TEMPORADA = valor('--temporada', '2026-27');
const SIMULACIONES = valor('--simulaciones', '3000');
const ESTADO = join(RAIZ, 'estado');
const CARPETA = join(ESTADO, 'prediccion-semanal');
const CANDADO = join(ESTADO, 'prediccion-semanal.lock');
const MARCA = join(ESTADO, 'prediccion-semanal.json');
const HOY = new Date().toISOString().slice(0, 10);
const LOG = join(CARPETA, `${HOY}.log`);
mkdirSync(CARPETA, { recursive: true });

function log(texto) {
  const linea = `${new Date().toISOString()}  ${texto}`;
  appendFileSync(LOG, `${linea}\n`, 'utf8');
  console.log(linea);
}

// No se solapa con otra pasada de predicción (2 h); la ingesta tiene su propio candado.
if (existsSync(CANDADO)) {
  const edadHoras = (Date.now() - statSync(CANDADO).mtimeMs) / 3600000;
  if (edadHoras < 2) {
    log(`ya hay una actualizacion de prediccion en curso (candado de ${edadHoras.toFixed(1)} h); no se toca nada`);
    process.exit(0);
  }
}

let contenedor = '';
try {
  contenedor = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', 'facylf-postgres'], { encoding: 'utf8' }).stdout?.trim() ?? '';
} catch { contenedor = ''; }
if (contenedor !== 'true') {
  log('FALLO: facylf-postgres no esta arrancado; no se recalcula nada');
  process.exit(2);
}

writeFileSync(CANDADO, new Date().toISOString(), 'utf8');
try {
  log(`prediccion semanal: inicio (temporada ${TEMPORADA}, ${SIMULACIONES} simulaciones)`);
  const pasos = [
    ['parametros', '01-parametros.mjs', ['--temporada', TEMPORADA]],
    ['predicciones', '02-predicciones.mjs', ['--temporada', TEMPORADA]],
    ['simulacion', '03-simulacion.mjs', ['--temporada', TEMPORADA, '--simulaciones', SIMULACIONES]],
  ];
  const resumen = [];
  for (const [nombre, fichero, extra] of pasos) {
    const ruta = join(RAIZ, 'scripts', 'prediccion', fichero);
    log(`  ${nombre}: node scripts/prediccion/${fichero} ${extra.join(' ')}`);
    const salida = spawnSync(process.execPath, [ruta, ...extra], {
      cwd: RAIZ, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, timeout: 1200000,
    });
    const texto = `${salida.stdout ?? ''}${salida.stderr ?? ''}`.trim();
    if (texto) appendFileSync(LOG, `${texto}\n`, 'utf8');
    if (salida.status !== 0) {
      log(`  ${nombre}: FALLO (codigo ${salida.status ?? 'sin codigo'})`);
      process.exitCode = 3;
      break;
    }
    // Última línea útil de cada paso para el resumen.
    const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
    resumen.push({ paso: nombre, ultima: lineas.at(-1) ?? '' });
    log(`  ${nombre}: bien`);
  }
  // El modelo de ML se entrena con las temporadas anteriores y publica en analytics.prediccion_ml.
  const scriptModelo = join(RAIZ, 'scripts', 'prediccion', '04-modelo.py');
  log(`  modelo: python scripts/prediccion/04-modelo.py`);
  const modelo = spawnSync('python', [scriptModelo], {
    cwd: RAIZ, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, timeout: 1800000,
  });
  const textoModelo = `${modelo.stdout ?? ''}${modelo.stderr ?? ''}`.trim();
  if (textoModelo) appendFileSync(LOG, `${textoModelo}\n`, 'utf8');
  if (modelo.status !== 0) {
    log(`  modelo: FALLO (codigo ${modelo.status ?? 'sin codigo'})`);
    process.exitCode = 4;
  } else {
    resumen.push({ paso: 'modelo', ultima: textoModelo.split('\n').filter(Boolean).at(-1) ?? '' });
    log('  modelo: bien');
  }

  writeFileSync(MARCA, JSON.stringify({
    temporada: TEMPORADA, simulaciones: Number(SIMULACIONES), resumen,
    hecho_en: new Date().toISOString(), codigo: process.exitCode ?? 0,
  }, null, 2), 'utf8');
  log(process.exitCode ? 'prediccion semanal: termino con fallos' : 'prediccion semanal: termino bien');
} finally {
  // El candado se borra al terminar; si falla el borrado, la edad lo deja pasar a las 2 h.
  try { rmSync(CANDADO, { force: true }); } catch { /* nada */ }
}
