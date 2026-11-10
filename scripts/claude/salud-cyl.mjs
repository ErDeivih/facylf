/**
 * salud-cyl.mjs — chequeo rápido del cierre de CyL y del despliegue, todo de solo lectura.
 *
 * Comprueba: worker vivo (por el registro), trabajos pendientes y actas hechas de la temporada en rotación,
 * espacio en disco, y que respondan la demo pública y la app real por el túnel. Sirve para las rondas de
 * seguimiento: si algo falla, lo dice con el dato, sin tocar nada.
 *
 * Uso: node scripts/claude/salud-cyl.mjs [--temporada 2018-19] [--app <url>]
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, statSync, statfsSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

const argumentos = process.argv.slice(2);
const valor = (bandera, porDefecto) => {
  const i = argumentos.indexOf(bandera);
  return i >= 0 ? argumentos[i + 1] : porDefecto;
};

const COLA = valor('--cola', 'E:/facylf-datos/descargas-federacion/recolector-local/cola-v2.sqlite');
const REGISTRO = valor('--registro', 'E:/facylf-datos/descargas-federacion/recolector-local/worker-programado.log');
const ETIQUETA = valor('--temporada', '2018-19');
const APP = valor('--app', 'https://ringtones-studies-plastic-assumptions.trycloudflare.com');
const DEMO = valor('--demo', 'https://erdeivih.github.io/fondo-popular-demo');

const lineas = [];
const fallos = [];
const ok = (texto) => lineas.push(`OK   ${texto}`);
const mal = (texto) => { lineas.push(`FALLA ${texto}`); fallos.push(texto); };

// 1) Registro del worker: ¿se ha movido en los últimos 10 minutos?
if (existsSync(REGISTRO)) {
  const hace10 = Date.now() - 10 * 60_000;
  const modificado = statSync(REGISTRO).mtimeMs;
  if (modificado >= hace10) ok(`registro del worker actualizado hace ${Math.round((Date.now() - modificado) / 60_000)} min`);
  else mal(`registro del worker sin moverse desde hace ${Math.round((Date.now() - modificado) / 60_000)} min (¿parado?)`);
} else mal(`no existe el registro del worker: ${REGISTRO}`);

// 2) Cola
if (!existsSync(COLA)) {
  mal(`no existe la cola: ${COLA}`);
} else {
  const db = new DatabaseSync(COLA, { readOnly: true, timeout: 20000 });
  const fila = db.prepare('select codigo from temporadas where etiqueta = ?').get(ETIQUETA);
  const pendientes = db.prepare("select count(*) n from trabajos where estado in ('pendiente','bloqueado')").get().n;
  const apartados = db.prepare("select count(*) n from trabajos where estado = 'apartado'").get().n;
  ok(`cola: ${pendientes} trabajos pendientes, ${apartados} apartados`);
  if (fila) {
    const actas = db.prepare("select count(*) n from actas where temporada = ? and estado = 'hecha'").get(fila.codigo).n;
    const pendActas = db.prepare("select count(*) n from actas where temporada = ? and estado = 'pendiente'").get(fila.codigo).n;
    ok(`${ETIQUETA}: ${actas} actas hechas, ${pendActas} pendientes`);
  }
  const ultimo = db.prepare("select max(actualizado_en) t from trabajos where estado = 'hecho'").get().t;
  if (ultimo) ok(`último trabajo terminado: ${ultimo}`);
  db.close();
}

// 3) Disco
for (const letra of ['E:', 'F:']) {
  try {
    const st = statfsSync(letra + '/');
    const libreGb = (st.bavail * st.bsize) / 1024 ** 3;
    if (libreGb >= 20) ok(`disco ${letra} libre ${libreGb.toFixed(1)} GB`);
    else mal(`disco ${letra} libre ${libreGb.toFixed(1)} GB (poco)`);
  } catch (error) {
    mal(`no se pudo leer el disco ${letra}: ${error.message}`);
  }
}

// 4) Público
const comprueba = async (nombre, url) => {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.ok) ok(`${nombre} ${url} → ${res.status}`);
    else mal(`${nombre} ${url} → ${res.status}`);
  } catch (error) {
    mal(`${nombre} ${url} → ${error.message}`);
  }
};
await comprueba('demo', DEMO + '/');
await comprueba('demo /explorar', DEMO + '/explorar');
await comprueba('app real', APP + '/');
await comprueba('app acta', APP + '/explorar/acta/2000559');

console.log(`salud-cyl · ${new Date().toISOString()} · ${basename(COLA)}`);
for (const l of lineas) console.log('  ' + l);
console.log(fallos.length === 0 ? '\nTodo en orden.' : `\n${fallos.length} problema(s).`);
process.exitCode = fallos.length === 0 ? 0 : 1;
