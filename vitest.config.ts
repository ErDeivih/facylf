import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { dirname, resolve as resuelve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Las credenciales del canónico viven en `.env` (nunca versionado). Cargarlas aquí hace que las
// pruebas de integración del importador encuentren `DATABASE_URL_PUBLICADOR` y no se salten.
const rutaEnv = new URL('.env', import.meta.url);
if (existsSync(rutaEnv)) {
  try {
    process.loadEnvFile(rutaEnv);
  } catch {
    // Un `.env` ilegible no debe impedir que se ejecuten las pruebas de los demás paquetes.
  }
}

/**
 * Resuelve `algo.js` contra `algo.ts` cuando el `.js` no existe.
 *
 * `scripts/reconstruir-cola.mjs` es un módulo ESM que importa fuentes TypeScript del monorepo con la
 * extensión `.js` (que es la forma correcta en ESM y la que resuelve `tsx` al ejecutarlo de verdad). Vite
 * no hace esa sustitución, así que las pruebas de la herramienta no podían ni cargar el fichero.
 *
 * El plugin es de PRUEBAS y sólo actúa cuando el `.js` no existe y sí existe su `.ts`: no puede tapar un
 * fichero real.
 */
const jsATs = {
  name: 'facylf-js-a-ts',
  enforce: 'pre' as const,
  resolveId(source: string, importer: string | undefined) {
    if (!importer || !source.startsWith('.') || !source.endsWith('.js')) return null;
    const candidato = resuelve(dirname(importer), `${source.slice(0, -3)}.ts`);
    return existsSync(candidato) ? candidato : null;
  },
};

export default defineConfig({
  plugins: [jsATs],
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
  },
  // La web importa con el alias `@/` (que es cosa de Next). Sin esto, una prueba que cargue un módulo
  // de `apps/web/src` no arranca: «Failed to load url @/…».
  resolve: {
    alias: [
      {
        find: /^node:sqlite$/,
        replacement: fileURLToPath(new URL('vitest.node-sqlite.ts', import.meta.url)),
      },
      { find: '@', replacement: new URL('apps/web/src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') },
    ],
  },
  // `node:sqlite` es un módulo interno reciente (Node 22.5+). Vite 5 todavía no lo tiene en su lista de
  // módulos internos: le quita el prefijo `node:` y luego intenta resolver `sqlite` como si fuese un
  // paquete de node_modules, con lo que las pruebas del importador ni siquiera arrancan. Declararlo
  // externo en las dos formas (con y sin prefijo) hace que se cargue el módulo real de Node; y para los
  // ficheros que viven FUERA de la raíz del proyecto —`scripts/lib/recolector-local.mjs`— ni eso basta,
  // así que además se le pone el alias de arriba, que lo carga con `createRequire`.
  ssr: { external: ['node:sqlite', 'sqlite'] },
  optimizeDeps: { exclude: ['node:sqlite', 'sqlite'] },
  server: { deps: { external: ['node:sqlite', 'sqlite'] } },
});
