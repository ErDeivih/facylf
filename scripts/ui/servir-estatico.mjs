#!/usr/bin/env node
// servir-estatico.mjs — servidor HTTP mínimo (Node puro, sin dependencias) para la
// foto estática de la web publicada que vive en `tmp/site-pages`.
//
// Por qué existe: la app Next no puede renderizar ahora mismo (no hay PostgreSQL ni
// Docker), pero sí hay una exportación estática ya generada de la demo publicada. Esta
// foto está escrita con prefijo absoluto `/fondo-popular-demo/` en enlaces, CSS, iconos
// y escudos, PERO el CSS de Next referencia las fuentes en `/_next/static/media/...`
// sin prefijo. Por eso el servidor sirve el mismo directorio en dos espacios de ruta:
//
//   http://127.0.0.1:4173/fondo-popular-demo/...   (rutas de la foto)
//   http://127.0.0.1:4173/_next/...               (fuentes y assets sin prefijo)
//   http://127.0.0.1:4173/...                     (por comodidad, raíz del directorio)
//
// Resuelve rutas tipo exportación de Next (`/explorar/competiciones` → carpeta con
// index.html), adivina el tipo de los ficheros sin extensión (`escudos-fed/castilla-leon`
// es un PNG) y cuenta las peticiones para poder comprobar que una carga de página no
// deja ningún 404.
//
// Uso:
//   node scripts/ui/servir-estatico.mjs
//   node scripts/ui/servir-estatico.mjs --puerto 4173 --raiz tmp/site-pages --silencioso
//
// Endpoints de control (solo para la verificación, no forman parte de la foto):
//   GET /__estado      → JSON con contadores de peticiones, estados y rutas 404
//   GET /__reiniciar   → pone los contadores a cero
//
// Este script NO modifica `tmp/site-pages`: solo lo lee.

import { createServer } from 'node:http';
import { createReadStream, closeSync, openSync, readSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const RAIZ_PROYECTO = resolve(AQUI, '..', '..');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
};

const AYUDA = `Servidor estático para la foto de tmp/site-pages.

Opciones:
  --raiz <dir>       Directorio que se sirve. Por defecto: tmp/site-pages
  --prefijo <ruta>   Prefijo de la foto en la web. Por defecto: /fondo-popular-demo
                     (se sirve igualmente en la raíz; usa "" para desactivar el prefijo)
  --puerto <n>       Puerto. Por defecto: 4173
  --host <host>      Interfaz de escucha. Por defecto: 127.0.0.1
  --silencioso       No escribir una línea por petición en stdout
  --sin-contadores   Desactivar /__estado y /__reiniciar
  -h, --ayuda        Esta ayuda
`;

function normalizarPrefijo(valor) {
  const limpio = String(valor ?? '').trim().replace(/^\/+|\/+$/g, '');
  return limpio ? `/${limpio}` : '';
}

function analizarArgumentos(argv) {
  const opciones = {
    raiz: join(RAIZ_PROYECTO, 'tmp', 'site-pages'),
    prefijo: '/fondo-popular-demo',
    puerto: 4173,
    host: '127.0.0.1',
    silencioso: false,
    contadores: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const valor = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Falta el valor de ${arg}`);
      return v;
    };
    switch (arg) {
      case '--raiz':
        opciones.raiz = resolve(RAIZ_PROYECTO, valor());
        break;
      case '--prefijo':
        opciones.prefijo = normalizarPrefijo(valor());
        break;
      case '--puerto':
        opciones.puerto = Number.parseInt(valor(), 10);
        break;
      case '--host':
        opciones.host = valor();
        break;
      case '--silencioso':
        opciones.silencioso = true;
        break;
      case '--sin-contadores':
        opciones.contadores = false;
        break;
      case '-h':
      case '--ayuda':
        process.stdout.write(AYUDA);
        process.exit(0);
      default:
        throw new Error(`Opción desconocida: ${arg}\n\n${AYUDA}`);
    }
  }
  if (!Number.isInteger(opciones.puerto) || opciones.puerto < 1 || opciones.puerto > 65535) {
    throw new Error(`Puerto no válido: ${opciones.puerto}`);
  }
  return opciones;
}

const OPCIONES = analizarArgumentos(process.argv.slice(2));
const RAIZ = resolve(OPCIONES.raiz);
const PREFIJO = OPCIONES.prefijo;
const PUERTO = OPCIONES.puerto;
const HOST = OPCIONES.host;

// Comprobación temprana: mejor fallar aquí que servir 404 a todo.
try {
  const info = statSync(RAIZ);
  if (!info.isDirectory()) throw new Error('no es un directorio');
} catch (error) {
  console.error(`[servir-estatico] No puedo leer el directorio raíz ${RAIZ}: ${error.message}`);
  process.exit(1);
}

const contadores = {
  inicio: new Date().toISOString(),
  peticiones: 0,
  porEstado: Object.create(null),
  rutas404: new Map(),
  ultimas: [],
};

function registrar(peticion) {
  contadores.peticiones += 1;
  contadores.porEstado[peticion.estado] = (contadores.porEstado[peticion.estado] || 0) + 1;
  if (peticion.estado === 404) {
    contadores.rutas404.set(peticion.ruta, (contadores.rutas404.get(peticion.ruta) || 0) + 1);
  }
  contadores.ultimas.push(peticion);
  if (contadores.ultimas.length > 25) contadores.ultimas.shift();
  if (!OPCIONES.silencioso) {
    const destino = peticion.archivo ? ` -> ${peticion.archivo}` : '';
    process.stdout.write(
      `[${peticion.estado}] ${peticion.metodo} ${peticion.ruta} ${peticion.bytes ?? 0} B ${peticion.ms} ms (${peticion.tipo})${destino}\n`,
    );
  }
}

function estadoJson() {
  const rutas404 = [...contadores.rutas404.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([ruta, veces]) => ({ ruta, veces }));
  return {
    inicio: contadores.inicio,
    raiz: RAIZ,
    prefijo: PREFIJO || null,
    peticiones: contadores.peticiones,
    porEstado: contadores.porEstado,
    noEncontradas: contadores.porEstado[404] || 0,
    rutas404,
    ultimas: contadores.ultimas.slice(-15),
  };
}

function reiniciarContadores() {
  contadores.inicio = new Date().toISOString();
  contadores.peticiones = 0;
  contadores.porEstado = Object.create(null);
  contadores.rutas404.clear();
  contadores.ultimas.length = 0;
}

function tipoPorExtension(archivo) {
  return TIPOS[extname(archivo).toLowerCase()] || null;
}

// `escudos-fed/castilla-leon` no tiene extensión y es un PNG: lo reconocemos por firma.
function tipoPorContenido(archivo) {
  let fd;
  try {
    fd = openSync(archivo, 'r');
    const cabecera = Buffer.alloc(16);
    const leidos = readSync(fd, cabecera, 0, 16, 0);
    const b = cabecera.subarray(0, leidos);
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.length >= 6 && b.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
    if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (b.length >= 4 && b[0] === 0x1f && b[1] === 0x8b) return 'application/gzip';
    const texto = b.toString('utf8').trimStart();
    if (/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(texto)) return 'image/svg+xml';
    return 'application/octet-stream';
  } catch {
    return 'application/octet-stream';
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* nada */
      }
    }
  }
}

// Quita el prefijo de la foto y comprueba que no se sale del directorio.
function rutaRelativa(pathname) {
  let ruta;
  try {
    ruta = decodeURIComponent(pathname);
  } catch {
    return null; // porcentaje mal formado
  }
  if (ruta.includes('\0')) return null;
  ruta = ruta.replace(/\\/g, '/');
  if (PREFIJO && (ruta === PREFIJO || ruta.startsWith(PREFIJO + '/'))) {
    ruta = ruta.slice(PREFIJO.length) || '/';
  }
  if (!ruta.startsWith('/')) ruta = '/' + ruta;
  return ruta;
}

// Devuelve el fichero a servir, o null si no existe dentro de la foto.
function resolverArchivo(ruta) {
  const relativa = ruta.replace(/^\/+/, '');
  const absoluta = resolve(RAIZ, relativa);
  if (absoluta !== RAIZ && !absoluta.startsWith(RAIZ + sep)) return null;

  const candidatos = [];
  if (ruta.endsWith('/')) {
    candidatos.push(join(absoluta, 'index.html'));
  } else {
    candidatos.push(absoluta, `${absoluta}.html`, join(absoluta, 'index.html'));
  }
  for (const candidato of candidatos) {
    try {
      if (statSync(candidato).isFile()) return candidato;
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

function rutaLegible(archivo) {
  const relativa = archivo.slice(RAIZ.length).replace(/^[\\/]+/, '');
  return relativa.split(sep).join('/');
}

function responderTexto(res, estado, texto, cabeceras = {}) {
  const cuerpo = Buffer.from(texto, 'utf8');
  res.writeHead(estado, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': cuerpo.length,
    'Cache-Control': 'no-store',
    ...cabeceras,
  });
  res.end(cuerpo);
}

function servirArchivo(req, res, archivo, estado, ruta, inicio) {
  let info;
  try {
    info = statSync(archivo);
  } catch {
    responderTexto(res, 404, 'No encontrado');
    registrar({ metodo: req.method, ruta, estado: 404, tipo: 'text/plain', bytes: 0, ms: Date.now() - inicio });
    return;
  }
  const tipo = tipoPorExtension(archivo) || tipoPorContenido(archivo);
  res.writeHead(estado, {
    'Content-Type': tipo,
    'Content-Length': info.size,
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    registrar({ metodo: req.method, ruta, estado, tipo, bytes: 0, ms: Date.now() - inicio, archivo: rutaLegible(archivo) });
    return;
  }
  const flujo = createReadStream(archivo);
  flujo.on('error', () => {
    res.destroy();
  });
  flujo.pipe(res);
  registrar({ metodo: req.method, ruta, estado, tipo, bytes: info.size, ms: Date.now() - inicio, archivo: rutaLegible(archivo) });
}

const servidor = createServer((req, res) => {
  const inicio = Date.now();
  const metodo = req.method || 'GET';

  let url;
  try {
    url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PUERTO}`}`);
  } catch {
    responderTexto(res, 400, 'Petición no válida');
    return;
  }

  // Endpoints de control (fuera del prefijo de la foto).
  if (OPCIONES.contadores && (url.pathname === '/__estado' || url.pathname === '/__estado/')) {
    const cuerpo = Buffer.from(`${JSON.stringify(estadoJson(), null, 2)}\n`, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': cuerpo.length,
      'Cache-Control': 'no-store',
    });
    res.end(cuerpo);
    return;
  }
  if (OPCIONES.contadores && (url.pathname === '/__reiniciar' || url.pathname === '/__reiniciar/')) {
    reiniciarContadores();
    const cuerpo = Buffer.from('{"reiniciado":true}\n', 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': cuerpo.length,
      'Cache-Control': 'no-store',
    });
    res.end(cuerpo);
    return;
  }

  if (metodo !== 'GET' && metodo !== 'HEAD') {
    responderTexto(res, 405, 'Método no permitido', { Allow: 'GET, HEAD' });
    registrar({ metodo, ruta: url.pathname, estado: 405, tipo: 'text/plain', bytes: 0, ms: Date.now() - inicio });
    return;
  }

  const ruta = rutaRelativa(url.pathname);
  if (ruta === null) {
    responderTexto(res, 400, 'Ruta no válida');
    registrar({ metodo, ruta: url.pathname, estado: 400, tipo: 'text/plain', bytes: 0, ms: Date.now() - inicio });
    return;
  }

  const archivo = resolverArchivo(ruta);
  if (archivo) {
    servirArchivo(req, res, archivo, 200, url.pathname, inicio);
    return;
  }

  // 404: misma página de la foto, pero con estado 404 (como en GitHub Pages).
  const noEncontrado = resolverArchivo('/404.html');
  if (noEncontrado) {
    servirArchivo(req, res, noEncontrado, 404, url.pathname, inicio);
    return;
  }
  responderTexto(res, 404, 'No encontrado');
  registrar({ metodo, ruta: url.pathname, estado: 404, tipo: 'text/plain', bytes: 0, ms: Date.now() - inicio });
});

servidor.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[servir-estatico] El puerto ${PUERTO} ya está ocupado. Prueba --puerto 4174.`);
  } else {
    console.error(`[servir-estatico] Error del servidor: ${error.message}`);
  }
  process.exit(1);
});

servidor.listen(PUERTO, HOST, () => {
  const base = `http://${HOST}:${PUERTO}`;
  console.log(`[servir-estatico] Foto estática: ${RAIZ}`);
  console.log(`[servir-estatico] Escuchando en ${base}`);
  console.log(`[servir-estatico] Prefijo de la foto: ${PREFIJO || '(ninguno)'}`);
  console.log(`[servir-estatico] Inicio: ${base}${PREFIJO || ''}/`);
  if (OPCIONES.contadores) console.log(`[servir-estatico] Estado: ${base}/__estado`);
});

function apagar(senal) {
  console.log(`\n[servir-estatico] ${senal}: cerrando.`);
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
