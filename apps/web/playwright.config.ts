import { defineConfig, devices } from '@playwright/test';

/*
 * Si ya hay un Next dev levantado (por ejemplo el de trabajo diario en :3000), se apunta a él con
 * `PLAYWRIGHT_BASE_URL` y no se intenta arrancar otro: Next 16 no permite dos servidores de desarrollo
 * en el mismo directorio. Sin la variable, se arranca el de pruebas en :3019 como siempre.
 *
 * Se usa `localhost`, no `127.0.0.1`: el servidor de desarrollo de Next bloquea los recursos de
 * desarrollo (y con ellos la hidratación) cuando el navegador llega por un origen distinto.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const servidorExterno = Boolean(baseURL);

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
    baseURL: baseURL ?? 'http://localhost:3019',
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
  webServer: servidorExterno
    ? undefined
    : {
      command: 'npx next dev -p 3019',
      /*
       * La comprobación de «ya está levantado» apunta a una ruta NUEVA, no a `/federaciones`: la web
       * vieja con slug depende de `@facylf/ingesta` y en Turbopack dev no resuelve sus imports `.js` a
       * `.ts` (en el build de webpack sí). Es deuda conocida de la web vieja, no de esta prueba, y no
       * debe impedir que arranque el servidor de las pruebas de la pantalla nueva.
       */
      url: 'http://localhost:3019/explorar/competicion/3769',
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
});
