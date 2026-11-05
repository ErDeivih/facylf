import type { NextConfig } from 'next';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * ── EL `.env` DEL MONORREPO, SÓLO CON LA CREDENCIAL DE CUENTAS ───────────────────────────────────────
 *
 * Next carga los `.env*` de `apps/web`, y ahí sólo vive `DATABASE_URL_LECTOR`. El rol de escritura de
 * las cuentas (`facylf_app`, 0027/0050) está en el `.env` de la RAÍZ del monorepo, que es de donde lo
 * leen los scripts y las pruebas. Sin él, `/entrar`, `/mi-panel` y los favoritos no podrían conectar
 * con la base en el servidor de desarrollo.
 *
 * A propósito NO se usa `process.loadEnvFile`: ese fichero también tiene la contraseña del
 * administrador y la del publicador, y la web no las necesita para nada. Aquí se copia únicamente
 * `DATABASE_URL_APP`, y sólo si el entorno no la trae ya (en el servidor de verdad manda su variable
 * y este fichero no se lee). No se escribe ni se versiona ningún secreto.
 */
const envRaiz = join(import.meta.dirname, '..', '..', '.env');
if (!process.env.DATABASE_URL_APP && existsSync(envRaiz)) {
  try {
    const lineas = readFileSync(envRaiz, 'utf8').split(/\r?\n/);
    for (const linea of lineas) {
      const encontrado = linea.match(/^\s*DATABASE_URL_APP\s*=\s*(.*)$/);
      if (encontrado) {
        process.env.DATABASE_URL_APP = encontrado[1]!.trim().replace(/^['"]|['"]$/g, '');
        break;
      }
    }
  } catch {
    // Un `.env` ilegible no debe impedir arrancar: las páginas con cuenta dirán que no pueden conectar.
  }
}

const config: NextConfig = {
  // `packages/dominio` e `ingesta` son TypeScript sin compilar: los transpila Next
  transpilePackages: ['@facylf/dominio', '@facylf/ingesta'],
  typedRoutes: true,
  /*
   * ── SALIDA AUTOCONTENIDA, PARA DESPLEGARLA EN EL SERVIDOR ───────────────────────────────────────────────
   *
   * `standalone` genera `.next/standalone` con lo mínimo para ejecutar la web (su propio `node_modules` podado
   * y un `server.js`) más `.next/static`. Sin esto habría que llevarse el monorepo entero y pnpm a la imagen de
   * ejecución, que en un servidor de 10 GB es peso muerto (ver `apps/web/Dockerfile`).
   *
   * `outputFileTracingRoot` apunta a la RAÍZ del monorepo porque las dependencias reales de la web viven dos
   * niveles más arriba (`packages/…`): sin esto, Next traza desde `apps/web` y la imagen se queda sin ellas.
   */
  output: 'standalone',
  outputFileTracingRoot: join(import.meta.dirname, '..', '..'),
  /*
   * ── LAS COLAS DE DESCARGA NO VAN EN EL PAQUETE (24/10/2026) ────────────────────────────────────────
   *
   * La web vieja todavía lee las SQLite de `descargas-*` para las URL con slug (se retira en W9). En este PC
   * esas carpetas son enlaces a `E:\facylf-archivo`, y el trazado de Next los sigue: el `standalone` salía
   * de **13 GB**, con una copia de cada cola. `outputFileTracingExcludes` no lo evita porque Next resuelve
   * el enlace y compara contra la ruta del proyecto, no contra `E:\`.
   *
   * La solución es podar el artefacto después del build (`postbuild` → `scripts/limpia-standalone.mjs`).
   * El original no se toca y la web local sigue leyendo las colas por su ruta normal.
   */
  // esos paquetes importan con extensión `.js` (lo correcto en ESM) pero los ficheros
  // son `.ts`. Sin esto, el empaquetador no los encuentra.
  turbopack: { resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'] },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default config;
