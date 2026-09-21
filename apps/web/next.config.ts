import type { NextConfig } from 'next';
import { join } from 'node:path';

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
