/**
 * Sustituto de `node:sqlite` para las pruebas.
 *
 * **Por qué existe.** `node:sqlite` es un módulo interno reciente. El transformador de módulos de Vite no
 * lo reconoce: le quita el prefijo `node:`, intenta resolver `sqlite` como paquete de `node_modules` y la
 * prueba ni arranca («Failed to load url sqlite»). Las listas `ssr.external` de `vitest.config.ts` no
 * bastan cuando el fichero que lo importa vive fuera de la raíz del proyecto, que es el caso de
 * `scripts/lib/recolector-local.mjs`.
 *
 * **Por qué un alias y no cambiar el import de origen.** `scripts/lib/recolector-local.mjs` es el fichero
 * que están ejecutando los recolectores ahora mismo. Reescribir su importación para comodidad de una
 * prueba sería tocar, por un motivo que no es suyo, el código del que depende la recolección en curso.
 * El alias deja el fichero intacto y resuelve el problema sólo donde aparece: en las pruebas.
 *
 * El módulo real se carga con `createRequire`, que es el mismo recurso que usa
 * `packages/canonico/src/origen/sqlite.ts` por esta misma razón.
 */
import { createRequire } from 'node:module';

const requerir = createRequire(import.meta.url);
const real = requerir('node:sqlite') as Record<string, unknown>;

export const DatabaseSync = real.DatabaseSync;
export const StatementSync = real.StatementSync;
export const backup = real.backup;
export const constants = real.constants;
export default real;
