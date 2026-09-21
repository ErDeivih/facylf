/**
 * Acceso a `node:sqlite` sin pasar por el transformador de módulos.
 *
 *  ¿Por qué no un `import` normal? `node:sqlite` es un módulo interno reciente (Node 22.5+) que Vite 5
 *  todavía no reconoce: le quita el prefijo `node:` y luego intenta resolver `sqlite` como paquete de
 *  node_modules, de modo que las pruebas del importador ni arrancan («Failed to load url sqlite»).
 *  Cargándolo con `createRequire` se obtiene el módulo real de Node tanto en las pruebas (Vitest) como
 *  en la CLI (`tsx`) y en el build, sin tocar el resto del código.
 */
import { createRequire } from 'node:module';
import type { DatabaseSync as TipoDatabaseSync } from 'node:sqlite';

const requerir = createRequire(import.meta.url);
const sqlite = requerir('node:sqlite') as { DatabaseSync: typeof TipoDatabaseSync };

export const DatabaseSync = sqlite.DatabaseSync;
/** El mismo nombre sirve como valor y como tipo, para no cambiar el resto del código. */
export type DatabaseSync = TipoDatabaseSync;
