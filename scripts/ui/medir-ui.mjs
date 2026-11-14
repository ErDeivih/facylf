#!/usr/bin/env node
// medir-ui.mjs — mide la interfaz de Fondo Popular con un navegador de verdad (Chromium
// de Playwright) y deja evidencia: `medicion.json` y capturas PNG a 390×844 y escritorio.
//
// QUÉ MIDE (los tres criterios del encargo, más tres que se ven en las capturas):
//   1. primer contenido visible: ¿hay contenido útil dentro de la primera pantalla o el usuario
//      mira una cabecera vacía?
//   2. scroll horizontal: ¿la página se sale a lo ancho? En móvil es el fallo que más se nota.
//   3. texto cortado: elementos de texto con overflow que recorta lo escrito.
//   4. además: cuántos elementos desbordan (y cuáles), objetivos táctiles pequeños, imágenes
//      sin texto alternativo y número de nodos del DOM (coste de pintar).
//
// CONTRA QUÉ SE MIDE:
//   · la foto estática publicada (`tmp/site-pages`), servida por `scripts/ui/servir-estatico.mjs`;
//   · o la app real en `http://127.0.0.1:3100` (necesita PostgreSQL; sin él sólo enseña el aviso
//     de "canónico no disponible").
//
// Uso:
//   node scripts/ui/medir-ui.mjs --base http://127.0.0.1:4173 --prefijo /fondo-popular-demo
//   node scripts/ui/medir-ui.mjs --base http://127.0.0.1:3100 --rutas /banco-ui/panel
//   node scripts/ui/medir-ui.mjs --ayuda
//
// Las capturas van a `capturas/ui-<etiqueta>-<ruta>-<ancho>.png` y el JSON a `medicion.json`
// (o a --salida). El script NO modifica el sitio medido: sólo lo lee.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
export const RAIZ_PROYECTO = resolve(AQUI, '..', '..');

/** Tamaños pedidos por el encargo, en formato ancho x alto. */
export const TAMANOS = {
  '390x844': { ancho: 390, alto: 844 },
  '1440x900': { ancho: 1440, alto: 900 },
};

const AYUDA = `Mide la interfaz de Fondo Popular en un Chromium real y deja medicion.json + capturas.

Opciones:
  --base <url>        Origen a medir. Por defecto: http://127.0.0.1:4173
  --prefijo <ruta>    Prefijo de la foto estática (p. ej. /fondo-popular-demo). Por defecto: ninguno
  --rutas <lista>     Rutas separadas por comas. Por defecto: las tres pantallas
  --tamanos <lista>   Tamaños ancho x alto separados por comas. Por defecto: 390x844,1440x900
  --salida <fichero>  JSON de medición. Por defecto: medicion.json en la raíz del proyecto
  --capturas <dir>    Directorio de capturas. Por defecto: capturas/
  --etiqueta <texto>  Prefijo de los ficheros de captura (antes / despues). Por defecto: medicion
  --sin-capturas      No escribir PNG (más rápido)
  --exigir-todo       Sale con código 1 si alguna pantalla incumple un criterio
  --ayuda             Esta ayuda
`;

const RUTAS_POR_DEFECTO = ['/explorar/calidad', '/explorar/competiciones', '/explorar/competicion/2939'];

// ─────────────────────────────── piezas puras (probadas) ───────────────────────────────

/**
 * Nombre de fichero estable para una ruta: sin tildes, sin barras, en minúsculas.
 * '/explorar/competicion/2939/jornada/6/' → 'explorar-competicion-2939-jornada-6'
 */
export function slugDe(ruta) {
  const limpia = String(ruta ?? '')
    .split('?')[0]
    .split('#')[0]
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const slug = limpia
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' || slug === 'index' ? 'inicio' : slug;
}

/**
 * Normaliza la lista de rutas recibida por `--rutas`: acepta un array o una cadena con comas,
 * recorta espacios, tira los huecos y garantiza la barra inicial.
 */
export function normalizarRutas(valor) {
  const trozos = [];
  const lista = Array.isArray(valor) ? valor : valor === undefined || valor === null ? [] : [valor];
  for (const item of lista) {
    for (const trozo of String(item ?? '').split(',')) trozos.push(trozo);
  }
  const salida = [];
  for (const trozo of trozos) {
    let ruta = trozo.trim();
    if (ruta === '') continue;
    if (!ruta.startsWith('/')) ruta = `/${ruta}`;
    salida.push(ruta);
  }
  return salida;
}

/**
 * Cruza los tres criterios del encargo en un veredicto. No inventa: si no se midió el primer
 * contenido, `primerContenidoVisible` es null y el veredicto no puede ser bueno.
 */
export function evaluarVeredicto(medida) {
  const primerContenidoVisible = medida?.primerContenido ? Boolean(medida.primerContenido.visible) : null;
  const sinScrollHorizontal = medida?.scrollHorizontal === false;
  const textosCortados = medida?.textosCortados?.total ?? 0;
  const sinTextoRecortado = textosCortados === 0;
  // Un pie fijo (o barra inferior) no puede tapar un control al final del scroll: es el fallo que
  // apareció en Garmin y EntrenoLab. Si no hay controles tapados, este criterio se cumple.
  const controlesTapados = medida?.controlesTapados?.total ?? 0;
  const sinControlesTapados = controlesTapados === 0;
  const ok = primerContenidoVisible === true && sinScrollHorizontal && sinTextoRecortado && sinControlesTapados;
  return { primerContenidoVisible, sinScrollHorizontal, sinTextoRecortado, sinControlesTapados, ok };
}

/**
 * Fila resumen: una por ruta × tamaño, con lo justo para comparar antes y después en una tabla.
 */
export function filaResumen(ruta, tamano, medida) {
  const veredicto = evaluarVeredicto(medida);
  return {
    ruta,
    tamano,
    status: medida?.status ?? null,
    bytesHtml: medida?.bytesHtml ?? null,
    primerContenido: medida?.primerContenido ?? null,
    scrollHorizontal: medida?.scrollHorizontal ?? null,
    desbordan: (medida?.desbordan ?? []).length,
    desbordanMuestra: (medida?.desbordan ?? []).slice(0, 5),
    textosCortados: medida?.textosCortados?.total ?? 0,
    textosCortadosMuestra: (medida?.textosCortados?.muestra ?? []).slice(0, 5),
    objetivosPequenos: medida?.objetivosPequenos?.total ?? 0,
    controlesTapados: medida?.controlesTapados?.total ?? 0,
    controlesTapadosMuestra: (medida?.controlesTapados?.muestra ?? []).slice(0, 5),
    barrasFijas: medida?.barrasFijas ?? [],
    imagenesSinAlt: (medida?.imagenesSinAlt ?? []).length,
    nodosDom: medida?.nodosDom ?? null,
    veredicto,
  };
}

/**
 * Se ejecuta DENTRO de la página (page.evaluate). Tiene que ser autocontenida: no puede cerrar
 * sobre variables del módulo. Recibe las opciones de medida y devuelve el objeto de medición.
 */
export async function medirEnPagina(opciones) {
  const { alto, ancho, tamanoTactil } = opciones;
  const doc = document.documentElement;
  const vw = window.innerWidth;

  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const estilo = window.getComputedStyle(el);
    return estilo.visibility !== 'hidden' && estilo.display !== 'none' && estilo.opacity !== '0';
  };

  const rutaCss = (el) => {
    if (!el || el === document.body) return 'body';
    const partes = [];
    let actual = el;
    let nivel = 0;
    while (actual && actual !== document.body && nivel < 4) {
      let parte = actual.tagName.toLowerCase();
      if (actual.id) {
        parte += `#${actual.id}`;
        partes.unshift(parte);
        break;
      }
      const clases = String(actual.getAttribute('class') || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join('.');
      if (clases) parte += `.${clases}`;
      partes.unshift(parte);
      actual = actual.parentElement;
      nivel += 1;
    }
    return partes.join(' > ');
  };

  // 1. Primer contenido visible: el primer bloque con sustancia dentro de la primera pantalla.
  const candidatos = ['main h1', 'h1', 'main table', 'main [role="table"]', 'main ul', 'main', 'body'];
  let primerContenido = null;
  for (const selector of candidatos) {
    const el = document.querySelector(selector);
    if (!el || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    primerContenido = {
      selector,
      y: Math.round(r.top + window.scrollY),
      alto: Math.round(r.height),
      visible: r.top < alto && r.bottom > 0,
      texto: String(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
    };
    break;
  }

  // 2. Scroll horizontal: la página y todos sus bloques.
  const scrollHorizontal = doc.scrollWidth > doc.clientWidth + 1;

  // 3. Qué desborda (para no tener que adivinar mirando la captura).
  const desbordan = [];
  const todos = document.querySelectorAll('body *');
  // Un elemento que desborda DENTRO de un contenedor con overflow-x (la tabla ancha del producto)
  // no es un fallo: es justo el patrón que se quiere (el documento no se mueve; el contenedor sí).
  const dentroDeScrollX = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const e = getComputedStyle(a);
      if (e.overflowX === 'auto' || e.overflowX === 'scroll') return true;
    }
    return false;
  };
  for (const el of todos) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (dentroDeScrollX(el)) continue;
    if (r.right > vw + 1 || r.left < -1) {
      desbordan.push({
        selector: rutaCss(el),
        ancho: Math.round(r.width),
        izquierda: Math.round(r.left),
        derecha: Math.round(r.right),
      });
      if (desbordan.length >= 40) break;
    }
  }

  // 4. Texto cortado: hojas de texto cuyo contenido no cabe en la caja que lo recorta.
  const textosCortados = { total: 0, muestra: [] };
  for (const el of todos) {
    if (!visible(el)) continue;
    if (el.children.length > 0) continue;
    const texto = String(el.textContent || '').trim();
    if (texto === '') continue;
    const caja = el.getBoundingClientRect();
    // Texto oculto a la vista (patrón sr-only: 1x1 px) no es texto recortado: nadie lo ve cortado.
    if (caja.width <= 2 || caja.height <= 2) continue;
    const estilo = window.getComputedStyle(el);
    const recorta = ['hidden', 'clip'].includes(estilo.overflowX) || estilo.textOverflow === 'ellipsis';
    if (!recorta) continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      textosCortados.total += 1;
      if (textosCortados.muestra.length < 10) {
        textosCortados.muestra.push({
          selector: rutaCss(el),
          texto: texto.slice(0, 60),
          visible: Math.round(el.clientWidth),
          real: Math.round(el.scrollWidth),
        });
      }
    }
  }

  // 5. Objetivos táctiles pequeños.
  const interactivos = document.querySelectorAll(
    'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], summary',
  );
  const objetivosPequenos = { total: 0, muestra: [] };
  for (const el of interactivos) {
    if (!visible(el)) continue;
    let r = el.getBoundingClientRect();
    // Una casilla o un radio no es un objetivo de 44 px por sí mismo: el objetivo es la etiqueta que
    // lo envuelve (la que se toca). Se mide la etiqueta cuando es lo bastante grande.
    const tipo = String(el.getAttribute('type') || '').toLowerCase();
    if ((tipo === 'checkbox' || tipo === 'radio') && el.closest('label')) {
      const cajaEtiqueta = el.closest('label').getBoundingClientRect();
      if (cajaEtiqueta.height >= tamanoTactil) continue;
      r = cajaEtiqueta;
    }
    if (r.width < tamanoTactil || r.height < tamanoTactil) {
      objetivosPequenos.total += 1;
      if (objetivosPequenos.muestra.length < 10) {
        objetivosPequenos.muestra.push({
          selector: rutaCss(el),
          ancho: Math.round(r.width),
          alto: Math.round(r.height),
          texto: String(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
        });
      }
    }
  }

  // 6. Imágenes sin alternativa textual.
  const imagenesSinAlt = [];
  for (const img of document.querySelectorAll('img')) {
    if (!img.getAttribute('alt') && img.getAttribute('alt') !== '') {
      imagenesSinAlt.push({ selector: rutaCss(img), src: String(img.getAttribute('src') || '').slice(0, 120) });
      if (imagenesSinAlt.length >= 20) break;
    }
  }

  // 7. Controles tapados por una barra fija al FINAL del scroll (y, de paso, la barra: su alto y su
  //    safe-area). El fallo típico es un pie sticky que se come el último campo o el botón de enviar.
  const yAntes = window.scrollY;
  window.scrollTo(0, document.documentElement.scrollHeight);
  await new Promise((listo) => requestAnimationFrame(() => requestAnimationFrame(listo)));

  const barrasFijas = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const estilo = window.getComputedStyle(el);
    if (estilo.position !== 'fixed' && estilo.position !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height === 0) continue;
    // Sólo barras ancladas abajo (pie fijo o barra inferior), no la cabecera pegajosa de arriba ni
    // una celda `sticky` de la tabla (que es estrecha y no ocupa el ancho de la pantalla).
    if (r.bottom < window.innerHeight - 2 || r.top < window.innerHeight * 0.4) continue;
    if (r.width < window.innerWidth * 0.5) continue;
    const rellenoInferior = parseFloat(estilo.paddingBottom) || 0;
    barrasFijas.push({
      selector: rutaCss(el),
      posicion: estilo.position,
      alto: Math.round(r.height),
      bottom: Math.round(window.innerHeight - r.bottom),
      safeArea: Math.round(rellenoInferior),
    });
    if (barrasFijas.length >= 5) break;
  }

  const tapados = [];
  for (const el of document.querySelectorAll(
    'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], summary',
  )) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height === 0) continue;
    if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
    const cx = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2));
    const cy = Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const encima = document.elementFromPoint(cx, cy);
    if (!encima) continue;
    if (el === encima || el.contains(encima) || encima.contains(el)) continue;
    // Sólo cuenta como tapado si lo que hay encima es una barra fija anclada abajo.
    let barra = null;
    for (let a = encima; a && a !== document.body; a = a.parentElement) {
      const estilo = window.getComputedStyle(a);
      if (estilo.position === 'fixed' || estilo.position === 'sticky') {
        const rb = a.getBoundingClientRect();
        if (rb.bottom >= window.innerHeight - 2) { barra = rutaCss(a); break; }
      }
    }
    if (barra === null) continue;
    tapados.push({
      selector: rutaCss(el),
      texto: String(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
      tapadoPor: barra,
    });
    if (tapados.length >= 20) break;
  }
  window.scrollTo(0, yAntes);

  return {
    ancho,
    alto,
    scrollHorizontal,
    primerContenido,
    desbordan,
    textosCortados,
    objetivosPequenos,
    imagenesSinAlt,
    controlesTapados: { total: tapados.length, muestra: tapados },
    barrasFijas,
    nodosDom: document.querySelectorAll('*').length,
  };
}

// ─────────────────────────────── CLI ───────────────────────────────

function analizarArgumentos(argv) {
  const opciones = {
    base: 'http://127.0.0.1:4173',
    prefijo: '',
    rutas: RUTAS_POR_DEFECTO,
    tamanos: Object.keys(TAMANOS),
    salida: join(RAIZ_PROYECTO, 'medicion.json'),
    capturas: join(RAIZ_PROYECTO, 'capturas'),
    etiqueta: 'medicion',
    capturar: true,
    exigirTodo: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const valor = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Falta el valor de ${arg}`);
      return v;
    };
    switch (arg) {
      case '--base':
        opciones.base = valor().replace(/\/+$/, '');
        break;
      case '--prefijo':
        opciones.prefijo = `/${String(valor()).replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
        break;
      case '--rutas':
        opciones.rutas = normalizarRutas(valor());
        break;
      case '--tamanos':
        opciones.tamanos = String(valor())
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        break;
      case '--salida':
        opciones.salida = resolve(RAIZ_PROYECTO, valor());
        break;
      case '--capturas':
        opciones.capturas = resolve(RAIZ_PROYECTO, valor());
        break;
      case '--etiqueta':
        opciones.etiqueta = valor();
        break;
      case '--sin-capturas':
        opciones.capturar = false;
        break;
      case '--exigir-todo':
        opciones.exigirTodo = true;
        break;
      case '-h':
      case '--ayuda':
        process.stdout.write(AYUDA);
        process.exit(0);
        break;
      default:
        throw new Error(`Opción desconocida: ${arg}\n\n${AYUDA}`);
    }
  }
  for (const tamano of opciones.tamanos) {
    if (!TAMANOS[tamano]) throw new Error(`Tamaño no previsto: ${tamano} (usa ${Object.keys(TAMANOS).join(' o ')})`);
  }
  return opciones;
}

function cargarPlaywright() {
  const desdeWeb = createRequire(join(RAIZ_PROYECTO, 'apps', 'web', 'package.json'));
  try {
    return desdeWeb('@playwright/test');
  } catch {
    const desdeRaiz = createRequire(join(RAIZ_PROYECTO, 'package.json'));
    return desdeRaiz('@playwright/test');
  }
}

async function main() {
  const opciones = analizarArgumentos(process.argv.slice(2));
  const { chromium } = cargarPlaywright();

  if (opciones.capturar && !existsSync(opciones.capturas)) mkdirSync(opciones.capturas, { recursive: true });
  if (!existsSync(dirname(opciones.salida))) mkdirSync(dirname(opciones.salida), { recursive: true });

  const navegador = await chromium.launch();
  const filas = [];
  const detalle = [];
  let fallos = 0;

  try {
    for (const tamano of opciones.tamanos) {
      const { ancho, alto } = TAMANOS[tamano];
      const contexto = await navegador.newContext({
        viewport: { width: ancho, height: alto },
        deviceScaleFactor: 1,
        locale: 'es-ES',
        timezoneId: 'Europe/Madrid',
        reducedMotion: 'reduce',
      });
      let pagina = await contexto.newPage();

      for (const ruta of opciones.rutas) {
        const url = `${opciones.base}${opciones.prefijo}${ruta}`;
        const inicio = Date.now();
        let status = null;
        let bytesHtml = null;
        let medida;
        let error = null;
        try {
          const respuesta = await pagina.goto(url, { waitUntil: 'load', timeout: 45000 });
          status = respuesta ? respuesta.status() : null;
          bytesHtml = respuesta ? Number(respuesta.headers()['content-length'] || 0) || null : null;
          // Deja asentar fuentes e imágenes antes de medir (una captura movida no vale como prueba).
          await pagina.evaluate(async () => {
            if (document.fonts?.ready) await document.fonts.ready;
            await new Promise((listo) => requestAnimationFrame(() => requestAnimationFrame(listo)));
          });
          await pagina.waitForTimeout(250);
          medida = await pagina.evaluate(medirEnPagina, { ancho, alto, tamanoTactil: ancho <= 640 ? 44 : 32 });
          if (!bytesHtml) {
            bytesHtml = Buffer.byteLength(await pagina.content(), 'utf8');
          }
        } catch (fallo) {
          error = fallo.message;
          medida = {
            scrollHorizontal: null,
            primerContenido: null,
            desbordan: [],
            textosCortados: { total: 0, muestra: [] },
            objetivosPequenos: { total: 0, muestra: [] },
            imagenesSinAlt: [],
            nodosDom: null,
          };
        }

        const medidaConEstado = { ...medida, status, bytesHtml, ms: Date.now() - inicio, error };
        const fila = filaResumen(ruta, tamano, medidaConEstado);
        fila.ms = medidaConEstado.ms;
        if (error) fila.error = error;
        filas.push(fila);
        detalle.push({ ...fila, muestra: medida });

        if (opciones.capturar && !error) {
          const base = `ui-${opciones.etiqueta}-${slugDe(ruta)}-${ancho}`;
          await pagina.screenshot({ path: join(opciones.capturas, `${base}.png`), fullPage: false });
          await pagina.screenshot({ path: join(opciones.capturas, `${base}-completa.png`), fullPage: true });
          fila.capturas = [relative(RAIZ_PROYECTO, join(opciones.capturas, `${base}.png`)).split('\\').join('/'),
            relative(RAIZ_PROYECTO, join(opciones.capturas, `${base}-completa.png`)).split('\\').join('/')];
        }

        if (!fila.veredicto.ok) fallos += 1;
        const veredicto = fila.veredicto.ok ? 'OK' : 'REVISAR';
        process.stdout.write(
          `${veredicto} ${tamano.padEnd(8)} ${ruta.padEnd(34)} status=${status} primerContenido=${fila.primerContenido?.visible} scrollH=${fila.scrollHorizontal} cortados=${fila.textosCortados} objetivos<${ancho <= 640 ? 44 : 32}=${fila.objetivosPequenos} nodos=${fila.nodosDom} ${fila.ms}ms\n`,
        );

        // Repinta la página entre rutas del mismo tamaño (estado limpio).
        await pagina.close();
        pagina = await contexto.newPage();
      }
      await contexto.close();
    }
  } finally {
    await navegador.close();
  }

  const informe = {
    generado: new Date().toISOString(),
    base: opciones.base,
    prefijo: opciones.prefijo || null,
    etiqueta: opciones.etiqueta,
    criterios: [
      'primer contenido visible en la primera pantalla',
      'sin scroll horizontal',
      'sin texto recortado',
      'objetivos táctiles ≥44 px en móvil y ≥32 px en escritorio',
      'imágenes con texto alternativo',
    ],
    filas,
    detalle,
  };
  writeFileSync(opciones.salida, `${JSON.stringify(informe, null, 2)}\n`, 'utf8');
  process.stdout.write(`\n[medir-ui] ${filas.length} mediciones → ${opciones.salida}\n`);
  process.stdout.write(`[medir-ui] incumplen: ${fallos}/${filas.length}\n`);
  if (opciones.exigirTodo && fallos > 0) process.exitCode = 1;
}

const esEjecutableDirecto = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (esEjecutableDirecto) {
  main().catch((error) => {
    console.error(`[medir-ui] ${error.message}`);
    process.exit(1);
  });
}
