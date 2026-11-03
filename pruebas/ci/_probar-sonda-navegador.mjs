#!/usr/bin/env node
// Sonda de diagnóstico, NO es una puerta de aceptación.
//
// Responde a una sola pregunta: ¿desde el sandbox de CI de este proyecto se
// puede lanzar un navegador real para capturar PNG? No arranca la web ni
// escribe en el árbol; sólo informa de plataforma, rutas candidatas y el
// resultado de intentar lanzar Chrome/Chromium con Playwright.
//
// Códigos: 0 si hay navegador lanzable; 3 si no lo hay; 9 si falla la sonda.

import { existsSync } from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

function informar(etiqueta, valor) {
  console.log(`SONDA ${etiqueta}=${valor}`);
}

const candidatos = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/google/chrome/chrome",
  "/ms-playwright",
  path.join(RAIZ, "node_modules", ".cache", "ms-playwright"),
];

async function main() {
  informar("platform", process.platform);
  informar("arch", process.arch);
  informar("node", process.versions.node);
  informar("cwd", RAIZ);
  informar("PLAYWRIGHT_BROWSERS_PATH", process.env.PLAYWRIGHT_BROWSERS_PATH ?? "");

  for (const c of candidatos) informar("existe", `${c}:${existsSync(c)}`);

  let playwright = null;
  try {
    playwright = await import("playwright");
    informar("import.playwright", "ok");
  } catch (error) {
    informar("import.playwright", `error:${error?.code ?? error?.message ?? "desconocido"}`);
  }
  if (!playwright) {
    informar("resultado", "sin-playwright");
    process.exit(3);
  }

  for (const canal of ["chrome", undefined]) {
    const etiqueta = canal ?? "chromium-bundled";
    try {
      const navegador = await playwright.chromium.launch(canal ? { channel: canal } : {});
      const pagina = await navegador.newPage();
      await pagina.setContent("<h1>sonda</h1>");
      const png = await pagina.screenshot();
      await navegador.close();
      informar(`launch.${etiqueta}`, `ok:png:${png.length}`);
      informar("resultado", `navegador-lanzable:${etiqueta}`);
      process.exit(0);
    } catch (error) {
      const mensaje = String(error?.message ?? error).split("\n")[0].slice(0, 300);
      informar(`launch.${etiqueta}`, `error:${mensaje}`);
    }
  }

  informar("resultado", "sin-navegador-lanzable");
  process.exit(3);
}

main().catch((error) => {
  informar("resultado", `sonda-rota:${error?.message ?? error}`);
  process.exit(9);
});
