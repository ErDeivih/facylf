#!/usr/bin/env node
// El `standalone` de Next no puede llevar datos del PC.
//
// La web vieja todavía lee las SQLite de `descargas-*` para las URL con slug (se retira en W9). En este PC
// esas carpetas son enlaces a `E:\facylf-archivo` y el trazado de Next los mete en el artefacto: unas veces
// copia los ficheros (13 GB) y otras deja el ENLACE, que en el servidor no lleva a ninguna parte. Además,
// con `outputFileTracingRoot` en la raíz del monorepo, se lleva `pruebas/` (copias de colas) y `_traspaso/`.
//
// Se quita SÓLO de `.next/standalone`; los originales no se tocan nunca. Un enlace se borra con `unlink`
// (jamás se recorre: borraría los datos de E:). Lo llama `postbuild` de `apps/web/package.json`.
import { existsSync, lstatSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const standalone = join(process.cwd(), '.next', 'standalone');
if (!existsSync(standalone)) {
  console.log('· limpia-standalone: no hay .next/standalone (nada que hacer)');
  process.exit(0);
}

// Carpetas de la raíz que son datos/evidencia del PC, nunca programa de la web.
const MATERIAL_DE_TRABAJO = [
  'pruebas', '_traspaso', '_borrar', '_to_delete', 'tmp', 'estado', 'registros',
  'informes', 'output', 'docs', '.git', '.estado-workers',
];

let fuera = 0;
let bytes = 0;

function quitar(nombre) {
  const ruta = join(standalone, nombre);
  if (!existsSync(ruta)) return;
  if (!ruta.startsWith(standalone)) throw new Error(`ruta fuera del standalone: ${ruta}`);
  const info = lstatSync(ruta);            // lstat: NO sigue el enlace
  if (info.isSymbolicLink()) {
    // Un enlace a E:\... se desengancha; nunca se recorre.
    unlinkSync(ruta);
    fuera += 1;
    return;
  }
  bytes += (function tamano(p) {
    const s = lstatSync(p);
    if (s.isSymbolicLink()) return 0;
    if (!s.isDirectory()) return s.size;
    return readdirSync(p).reduce((total, hijo) => total + tamano(join(p, hijo)), 0);
  })(ruta);
  rmSync(ruta, { recursive: true, force: true });
  fuera += 1;
}

for (const entrada of readdirSync(standalone, { withFileTypes: true })) {
  if (entrada.name.startsWith('descargas-')) quitar(entrada.name);
}
for (const nombre of MATERIAL_DE_TRABAJO) quitar(nombre);

console.log(`· limpia-standalone: ${fuera} entradas de datos fuera del paquete (${(bytes / 1024 ** 3).toFixed(1)} GB)`);
