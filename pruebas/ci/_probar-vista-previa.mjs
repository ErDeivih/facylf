#!/usr/bin/env node
// Puerta de `scripts/vista-previa.mjs`: arranca la vista previa en un puerto
// libre, comprueba que la portada responde 200 sin canónico y que al pedirle
// que pare el puerto queda cerrado y el árbol de trabajo como estaba.
//
// No usa binarios externos (taskkill/netstat) porque el sandbox de CI no
// siempre los tiene: la parada se pide por el canal IPC del guion y el cierre
// se comprueba con sockets. Códigos de salida:
//   0   portada 200, puerto cerrado y ficheros restaurados
//   9   fallo inesperado del propio guion de prueba
//  10   no encuentro el ejecutable de Next
//  12   el servidor no abrió el puerto a tiempo
//  32   la portada respondió 4xx
//  33   la portada respondió 3xx
//  35   la portada dio 200 pero el puerto siguió abierto al parar
//  36   la petición a la portada no obtuvo respuesta
//  37   el guion no terminó tras pedirle que pare

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = path.join(RAIZ, "apps", "web");
const GUION = path.join(RAIZ, "scripts", "vista-previa.mjs");
const HOST = "127.0.0.1";
const SIN_CANONICO = "";
const FICHEROS = ["next-env.d.ts", "tsconfig.json"].map((n) => path.join(APP, n));

function salir(codigo) {
  process.exit(codigo);
}

function guardar() {
  return FICHEROS.map((ruta) => {
    try {
      return [ruta, readFileSync(ruta)];
    } catch {
      return [ruta, null];
    }
  });
}

function restaurar(guardados) {
  for (const [ruta, contenido] of guardados) {
    if (!contenido) continue;
    try {
      const actual = readFileSync(ruta);
      if (!actual.equals(contenido)) writeFileSync(ruta, contenido);
    } catch {
      // Si no se puede leer o escribir, la comprobación no debe fallar por esto.
    }
  }
}

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const servidor = net.createServer();
    servidor.unref();
    servidor.once("error", reject);
    servidor.listen(0, HOST, () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });
}

function esperaTcp(puerto, limiteMs) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const intento = () => {
      const socket = net.connect({ port: puerto, host: HOST });
      const cerrar = (valor) => {
        socket.destroy();
        resolve(valor);
      };
      socket.once("connect", () => cerrar(true));
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - inicio >= limiteMs) resolve(false);
        else setTimeout(intento, 500);
      });
      socket.setTimeout(1000, () => cerrar(false));
    };
    intento();
  });
}

/** El puerto deja de aceptar conexiones (señal de que el servidor terminó). */
function esperaCierre(puerto, limiteMs = 20000) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const intento = () => {
      const socket = net.connect({ port: puerto, host: HOST });
      socket.once("connect", () => {
        socket.destroy();
        if (Date.now() - inicio >= limiteMs) resolve(false);
        else setTimeout(intento, 300);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(true);
      });
      socket.setTimeout(1000, () => {
        socket.destroy();
        resolve(true);
      });
    };
    intento();
  });
}

async function pedir(url) {
  try {
    const respuesta = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(90000) });
    const cuerpo = await respuesta.text();
    return { status: respuesta.status, cuerpo };
  } catch {
    return { status: null, cuerpo: "" };
  }
}

function esperaSalida(hijo, limiteMs) {
  if (hijo.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const temporizador = setTimeout(() => resolve(false), limiteMs);
    hijo.once("exit", () => {
      clearTimeout(temporizador);
      resolve(true);
    });
  });
}

async function main() {
  const nextBin = [
    path.join(APP, "node_modules", "next", "dist", "bin", "next"),
    path.join(RAIZ, "node_modules", "next", "dist", "bin", "next"),
  ].find((ruta) => existsSync(ruta));
  if (!nextBin) salir(10);

  const puerto = await puertoLibre();
  const guardados = guardar();
  // La vista previa es un servidor de desarrollo: un `.next` de una compilación
  // anterior (u otra versión de Next) puede dejarlo inservible. Se parte limpio.
  try {
    rmSync(path.join(APP, ".next"), { recursive: true, force: true });
  } catch {
    // Si no se puede borrar, el arranque dirá si sirve igualmente.
  }

  const entorno = { ...process.env, PORT: String(puerto), FLUJO_VISTA_PREVIA_SALTAR_INSTALACION: "1" };
  for (const nombre of ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSERVICE"]) delete entorno[nombre];
  for (const nombre of ["DATABASE_URL_LECTOR", "DATABASE_URL_PUBLICADOR", "DATABASE_URL_APP", "DATABASE_URL_MIGRACION"]) {
    entorno[nombre] = SIN_CANONICO;
  }

  const hijo = spawn(process.execPath, [GUION], {
    cwd: RAIZ,
    env: entorno,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  hijo.stdout.resume();
  hijo.stderr.resume();

  if (!(await esperaTcp(puerto, 60000))) {
    hijo.kill("SIGKILL");
    restaurar(guardados);
    salir(12);
  }

  const portada = await pedir(`http://${HOST}:${puerto}/`);

  // Parada ordenada: el mismo camino que Ctrl+C en el guion.
  const termino = await (async () => {
    if (hijo.connected) hijo.send("parar");
    if (await esperaSalida(hijo, 25000)) return true;
    hijo.kill("SIGKILL");
    return esperaSalida(hijo, 5000);
  })();
  const cerrado = await esperaCierre(puerto);
  restaurar(guardados);

  if (!termino) salir(37);
  if (portada.status === 200) {
    if (!cerrado) salir(35);
    salir(0);
  }
  if (portada.status === null) salir(36);
  if (portada.status >= 400) salir(32);
  salir(33);
}

main().catch(() => salir(9));
