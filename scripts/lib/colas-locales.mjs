import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Localiza las colas SQLite de las federaciones en una raíz de proyecto.
 *
 * ── POR QUÉ NO SE USA `readdirSync(..., { withFileTypes: true })` ────────────────────────────────
 *
 * En el PC de David las carpetas `descargas-*` de la raíz son **junctions** a `E:` (el disco de datos
 * se movió y quedaron enlaces). Para `readdirSync`, una junction es un enlace, y `entrada.isDirectory()`
 * devuelve `false`: un escaneo con `Dirent` se salta TODAS las colas y publica un ritmo de PC de 0
 * aunque el PC esté pidiendo. Ese cero falso es justo lo que el panel no puede recibir. `statSync`
 * sigue el enlace y dice la verdad.
 *
 * Se descartan las colas de prueba y los sondeos: no son federaciones que ingieren y ensuciarían el
 * ritmo con peticiones de laboratorio.
 */
export function rutasDeColasLocales(raiz) {
  const salida = [];
  let entradas;
  try { entradas = readdirSync(raiz); } catch { return salida; }
  for (const nombre of entradas.sort()) {
    if (!nombre.startsWith('descargas-')) continue;
    const federacion = nombre.replace('descargas-', '');
    if (federacion.startsWith('prueba') || federacion.endsWith('-sondeo')) continue;
    const carpeta = join(raiz, nombre);
    let esDirectorio = false;
    try { esDirectorio = statSync(carpeta).isDirectory(); } catch { esDirectorio = false; }
    if (!esDirectorio) continue;
    const ruta = join(carpeta, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(ruta)) continue;
    salida.push({ federacion, ruta });
  }
  return salida;
}
