import { defineConfig, devices } from '@playwright/test';

/**
 * Recorridos de aceptación de `PRODUCTO-UX.md` §13, con accesibilidad.
 *
 * Tres decisiones que importan:
 *
 * 1. **Se usa el Chrome que ya está instalado** (`channel: 'chrome'`), no un navegador propio de
 *    Playwright: esta máquina ya tiene Chrome por los recolectores y no hace falta descargar 300 MB
 *    más para comprobar seis recorridos.
 * 2. **Un solo worker y sin reintentos.** La skill de calidad dice que estas pruebas no deben competir
 *    con los diecisiete recolectores: aquí se ejecutan de una en una y en una ventana corta.
 * 3. **Dos tamaños**, móvil (360×740) y escritorio (1280×800), porque los seis criterios se prueban en
 *    los dos.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3019',
    channel: 'chrome',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'movil', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 360, height: 740 } } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npx next dev -p 3019',
    url: 'http://127.0.0.1:3019/federaciones',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
