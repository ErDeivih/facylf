#!/usr/bin/env node
// Vista previa local de la web de informes para revisión manual.
//
// Arranca `next dev` escuchando SOLO en 127.0.0.1 y se queda en primer plano
// hasta que se pare (Ctrl+C o señal). No escribe en el árbol salvo lo que Next
// genera en `.next/` (ignorado por git). No contacta con ningún servicio
// externo: la telemetría de Next queda desactivada.
//
// Arranca con el motor de webpack (`--webpack`), el mismo que usa `next build`.
// Motivo medido: con el servidor de desarrollo de Turbopack la portada responde
// 500 con un ENOENT dentro de `.next/dev` en cuanto la copia no tiene su caché
// de compilación; con webpack la portada responde 200 aunque no haya base de
// datos (muestra el aviso de canónico no disponible). Si vuelve a fallar por
// caché, borra `apps/web/.next` y arranca otra vez.
//
// Uso:
//   node scripts/vista-previa.mjs            # http://127.0.0.1:3000/
//   PORT=4000 node scripts/vista-previa.mjs  # otro puerto (bash)
//   $env:PORT=4000; node scripts/vista-previa.mjs   # otro puerto (PowerShell)
//
// Si faltan las dependencias, instala una vez con `pnpm install --frozen-lockfile`
// (con FLUJO_VISTA_PREVIA_SALTAR_INSTALACION=1 no instala: falla y lo dice).
// Si alguna DATABASE_URL_* apunta a un host que no es local, se niega a arrancar
// para no tocar el servidor original: esta vista previa es para la copia.
//
// Al salir devuelve `apps/web/next-env.d.ts` y `tsconfig.json` a como estaban:
// `next dev` los reescribe al arrancar y no queremos que una vista previa deje
// el árbol de trabajo modificado.
//
// La prueba automática (`pruebas/ci/_probar-vista-previa.mjs`) pide la parada
// por el canal IPC (`"parar"`), que sigue el mismo cierre que Ctrl+C sin
// depender de señales: Windows no las entrega a un proceso en primer plano.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(RAIZ, "apps", "web");
const HOST = "127.0.0.1";
const VARS_BD = [
  "DATABASE_URL_LECTOR",
  "DATABASE_URL_PUBLICADOR",
  "DATABASE_URL_APP",
  "DATABASE_URL_MIGRACION",
];
const HOSTS_LOCALES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
// `next dev` reescribe estos ficheros si su contenido no coincide con el que
// espera la versión instalada. Se guardan al arrancar y se devuelven al salir
// para no dejar el árbol de trabajo modificado por una vista previa.
const FICHEROS_QUE_NEXT_REESCRIBE = [
  path.join(APP, "next-env.d.ts"),
  path.join(APP, "tsconfig.json"),
];
let originales = null;

function fallar(mensaje) {
  console.error(`[vista-previa] ${mensaje}`);
  process.exit(1);
}

function majorDeNode() {
  return Number(process.versions.node.split(".")[0]);
}

function comprobarUrlsLocales() {
  for (const nombre of VARS_BD) {
    const valor = (process.env[nombre] ?? "").trim();
    if (!valor) continue;
    let url;
    try {
      url = new URL(valor);
    } catch {
      fallar(`${nombre} no es una URL válida; no se arranca la vista previa.`);
    }
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      fallar(`${nombre} no es una cadena de PostgreSQL; no se arranca la vista previa.`);
    }
    const host = (url.hostname || "").toLowerCase();
    if (host && !HOSTS_LOCALES.has(host)) {
      fallar(
        `${nombre} apunta a "${url.hostname}", que no es local. ` +
          "La vista previa solo se conecta a una copia en 127.0.0.1; " +
          "no se arranca para no tocar el servidor original.",
      );
    }
  }
}

function puertoPedido() {
  const bruto = (process.env.PORT ?? "3000").trim();
  const puerto = Number(bruto);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    fallar(`PORT="${bruto}" no es un puerto válido (1-65535).`);
  }
  return puerto;
}

function puertoLibre(puerto) {
  return new Promise((resolve) => {
    const servidor = net.createServer();
    servidor.unref();
    servidor.once("error", () => resolve(false));
    servidor.listen(puerto, HOST, () => servidor.close(() => resolve(true)));
  });
}

function rutaDeNext() {
  const candidatos = [
    path.join(APP, "node_modules", "next", "dist", "bin", "next"),
    path.join(RAIZ, "node_modules", "next", "dist", "bin", "next"),
  ];
  return candidatos.find((ruta) => existsSync(ruta)) ?? null;
}

function guardarFicherosQueNextReescribe() {
  return FICHEROS_QUE_NEXT_REESCRIBE.map((ruta) => {
    try {
      return [ruta, readFileSync(ruta)];
    } catch {
      return [ruta, null];
    }
  });
}

function restaurarFicherosQueNextReescribe(guardados) {
  if (!guardados) return;
  for (const [ruta, contenido] of guardados) {
    if (!contenido) continue;
    try {
      const actual = readFileSync(ruta);
      if (!actual.equals(contenido)) writeFileSync(ruta, contenido);
    } catch {
      // Si no se puede leer o escribir, el cierre no debe fallar por esto.
    }
  }
}

function instalarSiHaceFalta() {
  if (rutaDeNext()) return;
  if (process.env.FLUJO_VISTA_PREVIA_SALTAR_INSTALACION === "1") {
    fallar(
      "No encuentro Next en node_modules y la instalación automática está desactivada " +
        "(FLUJO_VISTA_PREVIA_SALTAR_INSTALACION=1). Ejecuta `pnpm install` a mano.",
    );
  }
  console.error("[vista-previa] Faltan dependencias; ejecutando pnpm install...");
  const argumentos = ["install"];
  if (existsSync(path.join(RAIZ, "pnpm-lock.yaml"))) argumentos.push("--frozen-lockfile");
  const resultado = spawnSync("pnpm", argumentos, {
    cwd: RAIZ,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (resultado.error) {
    fallar(
      `No se pudo ejecutar pnpm (${resultado.error.code ?? resultado.error.message}). ` +
        "Instala pnpm 10 o ejecuta `pnpm install` a mano.",
    );
  }
  if (resultado.status !== 0) {
    fallar(`pnpm install terminó con código ${resultado.status}.`);
  }
  if (!rutaDeNext()) {
    fallar("Tras instalar no aparece Next en node_modules; revisa el workspace.");
  }
}

let hijo = null;
let cerrando = false;

function matarArbol(pid) {
  if (!pid) return;
  // `process.kill` es lo único que hay garantizado (no depende de binarios del
  // sistema); taskkill solo se usa, si existe, para alcanzar nietos.
  try {
    // En POSIX el hijo va en su propio grupo, así que se mata el grupo entero.
    if (process.platform !== "win32") process.kill(-pid, "SIGKILL");
    else process.kill(pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // El proceso ya no existe.
    }
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
}

function cerrarYsalir(codigo) {
  if (cerrando) return;
  cerrando = true;
  console.error("[vista-previa] Cerrando servidor de vista previa...");
  if (hijo && hijo.exitCode === null) matarArbol(hijo.pid);
  process.exit(codigo);
}

for (const senal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(senal, () => cerrarYsalir(0));
}

// Parada ordenada por canal IPC: la usa la prueba automática para pedir el
// mismo cierre que Ctrl+C sin depender de señales, que Windows no entrega a un
// proceso en primer plano.
process.on("message", (mensaje) => {
  if (mensaje === "parar") cerrarYsalir(0);
});

process.on("exit", () => {
  restaurarFicherosQueNextReescribe(originales);
});

async function principal() {
  if (majorDeNode() < 22) {
    fallar(`Se necesita Node >= 22; hay ${process.versions.node}.`);
  }
  if (!existsSync(path.join(APP, "package.json"))) {
    fallar(`No encuentro apps/web en ${APP}. Ejecuta el guion desde el repositorio.`);
  }

  comprobarUrlsLocales();
  const puerto = puertoPedido();

  if (!(await puertoLibre(puerto))) {
    fallar(
      `El puerto ${puerto} ya está ocupado. Para otro: PORT=<puerto> node scripts/vista-previa.mjs`,
    );
  }

  instalarSiHaceFalta();
  const binNext = rutaDeNext();
  if (!binNext) {
    fallar("No encuentro el ejecutable de Next. Ejecuta `pnpm install`.");
  }

  const entorno = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    PORT: String(puerto),
    HOSTNAME: HOST,
  };
  if (!entorno.NODE_OPTIONS) entorno.NODE_OPTIONS = "--max-old-space-size=4096";

  console.error("");
  console.error(`[vista-previa] Arrancando la web en http://${HOST}:${puerto}/`);
  console.error("[vista-previa] Pulsa Ctrl+C para pararla.");
  console.error("");

  originales = guardarFicherosQueNextReescribe();

  hijo = spawn(
    process.execPath,
    [binNext, "dev", "--webpack", "-p", String(puerto), "-H", HOST],
    {
      cwd: APP,
      env: entorno,
      stdio: "inherit",
      detached: process.platform !== "win32",
    },
  );

  hijo.on("error", (error) => {
    fallar(`No se pudo arrancar Next: ${error.message}`);
  });

  hijo.on("exit", (codigo, senal) => {
    if (cerrando) return;
    if (senal) {
      console.error(`[vista-previa] Next terminó por la señal ${senal}.`);
      process.exit(1);
    }
    process.exit(codigo ?? 1);
  });
}

principal().catch((error) => {
  fallar(error instanceof Error ? error.message : String(error));
});
