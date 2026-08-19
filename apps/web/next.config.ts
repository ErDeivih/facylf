import type { NextConfig } from 'next';

const config: NextConfig = {
  // `packages/dominio` e `ingesta` son TypeScript sin compilar: los transpila Next
  transpilePackages: ['@fcylf/dominio', '@fcylf/ingesta'],
  typedRoutes: true,
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
