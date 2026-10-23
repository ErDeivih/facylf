/**
 * DÓNDE VA EL ARCHIVO DE EVIDENCIA DEL MULTIDEPORTE (05/10/2026).
 *
 * Para llevar las evidencias (los .gz, que es lo que crece: ServerSports pasó de 89 a 701 MB en un día) a otro
 * disco SIN enlaces ni uniones —que son lo que tumbó el Docker del PC—, la raíz se declara en
 * `scripts/multideporte/archivo.json`:
 *
 *     { "raiz": "E:\\facylf-archivo\\descargas-multideporte" }
 *
 * · Sin ese fichero, todo sigue exactamente como antes (`descargas-multideporte/<adaptador>/evidencias`).
 * · Con él, las evidencias NUEVAS se escriben en `<raiz>/<adaptador>/evidencias`, y las de antes se siguen
 *   encontrando en su sitio de siempre: quien lee (reinterpreta.mjs…) busca primero en la raíz nueva y luego en
 *   la antigua. Así la mudanza se puede hacer sin prisa, adaptador a adaptador, copiando y verificando antes de
 *   borrar nada. Las colas SQLite NO se mueven (se escriben en cada página).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_PROYECTO = resolve(AQUI, '..', '..');
const LOCAL = join(RAIZ_PROYECTO, 'descargas-multideporte');

export function raizArchivo() {
  try {
    const j = JSON.parse(readFileSync(join(AQUI, 'archivo.json'), 'utf8').replace(/^\uFEFF/, ''));
    return j.raiz ? resolve(j.raiz) : null;
  } catch { return null; }
}

/** Carpetas de evidencia de un adaptador: [donde se escribe, …donde puede haber evidencias antiguas]. */
export function carpetasEvidencias(nombre) {
  const local = join(LOCAL, nombre, 'evidencias');
  const r = raizArchivo();
  return r && resolve(r) !== resolve(LOCAL) ? [join(r, nombre, 'evidencias'), local] : [local];
}

/** Ruta real de una evidencia (la primera carpeta que la tenga), o null. */
export function buscaEvidencia(nombre, relativa) {
  for (const c of carpetasEvidencias(nombre)) {
    const p = join(c, relativa);
    if (existsSync(p)) return p;
  }
  return null;
}
