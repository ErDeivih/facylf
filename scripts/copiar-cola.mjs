#!/usr/bin/env node
/**
 * Copia CONSISTENTE de la cola de una federación, para trabajar sobre una copia.
 *
 * ## Por qué con la API de backup y no copiando el fichero
 *
 * Las colas están en modo WAL y los recolectores escriben en ellas mientras esto corre. Copiar
 * `cola-v2.sqlite` con el explorador de archivos **no** copia el `-wal`: el resultado es una base que
 * parece completa y le faltan las últimas transacciones, o que directamente no abre. `sqlite.backup`
 * copia una instantánea coherente con la base abierta, que es lo único que se puede tratar como
 * evidencia.
 *
 * ## Cómo se usa
 *
 * ```powershell
 * node scripts/copiar-cola.mjs --federacion euskadi --destino pruebas/reconstruccion/ciclo
 * ```
 *
 * Deja la copia en `<destino>/descargas-<federacion>/recolector-local/cola-v2.sqlite`, que es la MISMA
 * estructura que espera la raíz de datos de `reconstruir-cola`. Con `--raiz <destino>` (o `FACYLF_RAIZ`)
 * la herramienta trabaja sobre la copia y no toca la cola real.
 *
 * **El HTML archivado NO se copia.** La columna `jornadas.archivo` guarda la ruta absoluta del archivo
 * que el recolector descargó, así que la copia sigue leyendo la evidencia original sin duplicar cientos
 * de MB. La reconstrucción nunca escribe en el HTML, así que eso no puede ensuciar la evidencia.
 */
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync, backup } = requerir('node:sqlite');

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const federacion = arg('federacion');
const destino = arg('destino');
if (!federacion || !destino) {
  console.error('Uso: copiar-cola --federacion <fed> --destino <carpeta> [--raiz <raiz de origen>]');
  process.exit(1);
}

const CARPETA_FEDERACION = { 'castilla-leon': 'descargas-federacion' };
const carpeta = CARPETA_FEDERACION[federacion] ?? `descargas-${federacion}`;
const raizOrigen = resolve(arg('raiz') ?? resolve(import.meta.dirname, '..'));
const origenRuta = join(raizOrigen, carpeta, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(origenRuta)) {
  console.error(`✗ No existe la cola de origen: ${origenRuta}`);
  process.exit(1);
}

const raizCopia = resolve(destino);
const carpetaCopia = join(raizCopia, carpeta, 'recolector-local');
mkdirSync(carpetaCopia, { recursive: true });
const destinoRuta = join(carpetaCopia, 'cola-v2.sqlite');

const origen = new DatabaseSync(origenRuta, { readOnly: true });
const antes = statSync(origenRuta).size;
await backup(origen, destinoRuta);
origen.close();

const despues = statSync(destinoRuta).size;
// El catálogo de federaciones también viaja: sin él, el importador no sabe qué adaptador y qué portal
// tiene la federación copiada y la copia no sirve para un ciclo completo. Es un JSON pequeño.
const configOrigen = join(raizOrigen, 'config');
let configCopiada = false;
if (existsSync(configOrigen)) {
  mkdirSync(join(raizCopia, 'config'), { recursive: true });
  cpSync(configOrigen, join(raizCopia, 'config'), { recursive: true });
  configCopiada = true;
}

// La copia se abre para comprobarla de verdad: una copia que no abre no es una copia.
const copia = new DatabaseSync(destinoRuta, { readOnly: true });
const partidos = copia.prepare('select count(*) n from partidos').get().n;
const integridad = copia.prepare('pragma integrity_check').get();
copia.close();

console.log(`Copia consistente de ${federacion}`);
console.log(`  origen:  ${origenRuta} (${(antes / 1048576).toFixed(1)} MB)`);
console.log(`  copia:   ${destinoRuta} (${(despues / 1048576).toFixed(1)} MB)`);
console.log(`  catálogo de federaciones: ${configCopiada ? 'copiado' : 'no existe en el origen'}`);
console.log(`  partidos: ${partidos} · integrity_check: ${JSON.stringify(integridad)}`);
console.log(`  raíz de datos para la herramienta: --raiz ${raizCopia}`);
