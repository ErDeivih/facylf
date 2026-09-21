/*
 * FEDERACIONES DE PRUEBA PARA MEDIR EL REPARTO DE PLAZAS A ESCALA.
 *
 * Con una sola federación de prueba no se puede comprobar lo que de verdad importa del turno de plaza: que
 * cuando hay MÁS federaciones con trabajo que plazas, todas entran a lo largo del día. Este guion crea N copias
 * de la federación de prueba (perfil, configuración y cola) para poder levantar N contenedores compitiendo por
 * las plazas de un presupuesto pequeño, y medirlo.
 *
 * Nunca toca una federación real: sólo `prueba-*`, y las colas se copian DENTRO del volumen de Docker (que es
 * sistema de ficheros Linux: copiar 76 MB por el puente de carpetas de Windows tardaría minutos).
 *
 * Uso:
 *   node scripts/_prepara-federaciones-de-prueba.mjs 6 --volumen facylf-datos-prueba
 *   node scripts/_prepara-federaciones-de-prueba.mjs --limpiar 6
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const limpiar = argumentos.includes('--limpiar');
const iVolumen = argumentos.indexOf('--volumen');
const volumen = iVolumen >= 0 ? argumentos[iVolumen + 1] : 'facylf-datos-prueba';
const cuantas = Number(argumentos.find((a) => /^\d+$/.test(a)) ?? 6);
const letras = 'abcdefghijklmnop'.slice(0, cuantas).split('');

const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });

for (const letra of letras) {
  const federacion = `prueba-${letra}`;
  const perfil = join(raiz, 'perfiles', `${federacion}.json`);
  const config = join(raiz, `recolector.${federacion}.config.json`);

  if (limpiar) {
    rmSync(perfil, { force: true });
    rmSync(config, { force: true });
    try {
      docker(['run', '--rm', '-v', `${volumen}:/app/datos`, '--entrypoint', 'bash', 'facylf-recolectores:local',
        '-c', `rm -rf /app/datos/descargas-${federacion}`]);
    } catch { /* si no existe, da igual */ }
    console.log(`  ${federacion}: retirada`);
    continue;
  }

  writeFileSync(perfil, `${JSON.stringify({
    nombre: federacion,
    base: 'https://www.euskadifutbol.eus/pnfg/NPcd',
    codPrimaria: '1000120',
    carpeta: `descargas-${federacion}`,
    config: `recolector.${federacion}.config.json`,
    catalogo: `descargas-${federacion}/competiciones-por-temporada.json`,
    grupos: `descargas-${federacion}/grupos-por-temporada.json`,
  }, null, 2)}\n`);
  const configEjemplo = join(raiz, 'recolector.prueba-10gb.config.json');
  copyFileSync(existsSync(configEjemplo) ? configEjemplo : join(raiz, 'recolector.config.ejemplo.json'), config);

  const copiada = docker(['run', '--rm', '-v', `${volumen}:/app/datos`, '--entrypoint', 'bash', 'facylf-recolectores:local',
    '-c', `if [ -d /app/datos/descargas-${federacion} ]; then echo ya; else cp -a /app/datos/descargas-prueba-10gb /app/datos/descargas-${federacion} && echo copiada; fi`]).trim();
  console.log(`  ${federacion}: perfil y configuración escritos · cola en el volumen: ${copiada}`);
}
mkdirSync(join(raiz, 'pruebas', 'reconstruccion'), { recursive: true });
console.log(`  ${limpiar ? 'limpieza' : 'preparación'} terminada: ${letras.map((l) => `prueba-${l}`).join(', ')}`);
