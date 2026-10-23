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
    /*
     * ── EL TIEMPO POR PRUEBA, SUBIDO A PROPÓSITO (medido el 24/09/2026) ─────────────────────────────────
     *
     * Las pruebas del importador y del contrato de la web van contra PostgreSQL de verdad, y 5 s —lo que
     * trae Vitest por defecto— se queda corto en cuanto la máquina tiene trabajo encima: los recolectores de
     * la flota y la carga masiva escriben en la misma base mientras esto corre.
     *
     * Medido: `apps/web/test/consultas.test.ts > el resumen devuelve exactamente las columnas prometidas`
     * tarda **2,0 s sola** y pasaba de 5 s con las 44 pruebas en paralelo; la prueba 13 de `lote.test.ts`
     * tardó 3,97 s sola y se fue a 5,6 s con el importador en marcha. Las dos fallaron por tiempo, no por
     * datos, y una prueba que falla al azar es peor que una que no existe: enseña a ignorar los fallos.
     *
     * 30 s sigue siendo un tope: si una consulta se atasca de verdad, se ve.
     */
    testTimeout: 30_000,
    /*
     * Y los `beforeAll`/`beforeEach` (13/10/2026): limpian la federación de pruebas en el canónico, y con la
     * máquina cargada (recolectores + importaciones) pasaban de los 10 s por defecto. Salían 14 fallos
     * «Hook timed out in 10000ms» que no decían nada del código; con 90 s pasan las 191.
     */
    hookTimeout: 90_000,
    /*
     * ── Y LOS FICHEROS, DE UNO EN UNO ────────────────────────────────────────────────────────────────────
     *
     * Subir el tiempo por prueba no bastaba, porque el fallo no era que una prueba fuese lenta: era que 44
     * ficheros lanzados a la vez saturaban PostgreSQL. La prueba del contrato de la web no se caía por su
     * consulta —tarda 2,0 s sola—, se caía porque el **presupuesto de 5 s de la propia web**
     * (`statement_timeout` del adaptador) saltaba con la base ocupada por las demás pruebas.
     *
     * Medido el 24/09/2026: en paralelo, esa prueba y la 13 de `lote.test.ts` fallan de vez en cuando; en
     * serie, la suite entera pasa siempre. Serializar cuesta unos segundos y compra que un fallo vuelva a
     * significar algo. Es la misma regla que ya está escrita para los recolectores: las pruebas pesadas de
     * PostgreSQL no se pelean con el resto.
     */
    fileParallelism: false,
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
