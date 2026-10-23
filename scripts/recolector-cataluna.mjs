#!/usr/bin/env node
/**
 * Descubrimiento reanudable del selector público de competiciones de la FCF.
 *
 * La FCF no usa PNFG: los identificadores sólo aparecen al manejar sus cuatro
 * selectores (temporada, disciplina, competición y grupo). Este adaptador usa
 * un navegador normal, una sola acción cada 6-8 segundos y guarda progreso
 * después de cada selección. No adivina identificadores ni repite elementos
 * ya resueltos.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Builder, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const RAIZ = resolve(import.meta.dirname, '..');
const CARPETA = join(RAIZ, 'descargas-cataluna');
const CATALOGO = join(CARPETA, 'catalogo-fcf.json');
const CRUDOS = join(CARPETA, 'grupos-html');
const BLOQUEO = join(CARPETA, '.recolector-cataluna.lock');
const PORTAL = 'https://www.fcf.cat/ca/competicio';

function argumento(nombre, defecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : defecto;
}
const comando = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'descubrir';
const MAX = Math.max(1, Number(argumento('max', 30)) || 30);
const MIN_MS = Math.max(5000, Number(argumento('min-ms', 6000)) || 6000);
const MAX_MS = Math.max(MIN_MS, Number(argumento('max-ms', 8000)) || 8000);
// Orden de prioridad: las modalidades principales quedan utilizables primero.
const DISCIPLINAS_PRIORITARIAS = ['Futbol 11', 'Futbol 7', 'Futbol 5', 'Futbol Sala', 'Futbol Platja'];
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));
const pausa = async () => {
  const ms = Math.round(MIN_MS + Math.random() * (MAX_MS - MIN_MS));
  console.log(`  … pausa respetuosa de ${Math.round(ms / 1000)} s`);
  await duerme(ms);
};

function leeCatalogo() {
  if (!existsSync(CATALOGO)) return {
    federacion: 'cataluna', plataforma: 'fcf-selector-web', actualizadoEn: null,
    portal: PORTAL, temporadas: [], incidencias: [],
  };
  return JSON.parse(readFileSync(CATALOGO, 'utf8').replace(/^\uFEFF/, ''));
}

/**
 * ── HASTA QUÉ AÑO DEBE LLEGAR EL HISTORIAL, SEGÚN LA PROPIA FEDERACIÓN (08/10/2026) ──────────────────────
 *
 * El 08/10/2026 se descubrió que Cataluña llevaba **dos temporadas** en el catálogo (2025-26 y 2026-27)
 * cuando su configuración declara `alcance.desdeAnio: 2015`: le faltaban DIEZ temporadas enteras, y su
 * recolector de datos parecía «parado» porque sólo puede recoger lo que el catálogo tiene.
 *
 * La causa era una condición de este mismo fichero: `descubreTemporadas` sólo se llamaba
 * `if (!datos.temporadas.length)` — es decir, **si el catálogo estaba VACÍO**. Como ya tenía dos, la función
 * no se ejecutaba nunca. El resto de pasos sí corrían, así que el descubridor parecía trabajar (refinaba
 * competiciones y grupos cada vez) y nadie notó que el historial no se tocaba jamás.
 *
 * Se lee del fichero de configuración de la federación, no de una constante escrita aquí: si mañana se cambia
 * el alcance, el descubrimiento lo sigue sin tocar código.
 */
function anioMinimoConfigurado() {
  try {
    const ruta = join(RAIZ, 'recolector.cataluna.config.json');
    if (!existsSync(ruta)) return 0;
    return Number(JSON.parse(readFileSync(ruta, 'utf8')).alcance?.desdeAnio) || 0;
  } catch {
    /* Sin configuración legible se responde 0, que significa «no sé»: y ante la duda, no se cambia nada. */
    return 0;
  }
}

function guardaCatalogo(datos) {
  datos.actualizadoEn = new Date().toISOString();
  const temporal = `${CATALOGO}.tmp-${process.pid}`;
  writeFileSync(temporal, JSON.stringify(datos, null, 2));
  renameSync(temporal, CATALOGO);
}

function resumen(datos) {
  const disciplinas = datos.temporadas.flatMap((t) => t.disciplinas ?? []);
  const competiciones = disciplinas.flatMap((d) => d.competiciones ?? []);
  const grupos = competiciones.flatMap((c) => c.grupos ?? []);
  return {
    temporadas: datos.temporadas.length,
    disciplinas: disciplinas.filter((d) => d.id).length,
    competiciones: competiciones.length,
    competicionesConId: competiciones.filter((c) => c.id).length,
    competicionesDescartadas: competiciones.filter((c) => (c.fallos ?? 0) >= 3).length,
    grupos: grupos.length,
    gruposConId: grupos.filter((g) => g.id).length,
    gruposConHtml: grupos.filter((g) => g.archivo).length,
    gruposDescartados: grupos.filter((g) => (g.fallos ?? 0) >= 3).length,
    incidencias: (datos.incidencias ?? []).length,
    actualizadoEn: datos.actualizadoEn,
  };
}

function adquiereBloqueo() {
  mkdirSync(CARPETA, { recursive: true });
  mkdirSync(CRUDOS, { recursive: true });
  if (existsSync(BLOQUEO) && Date.now() - statSync(BLOQUEO).mtimeMs > 6 * 60 * 60_000) rmSync(BLOQUEO);
  let fd;
  try {
    fd = openSync(BLOQUEO, 'wx');
  } catch (error) {
    // Ya hay una sesión en marcha (por ejemplo, la tarea programada mientras el supervisor
    // trabaja). No es un error: se sale en limpio para no dejar la tarea en «fallo».
    if (error?.code === 'EEXIST') {
      console.log('Ya hay una sesión de descubrimiento en marcha; esta copia termina sin tocar nada.');
      process.exit(0);
    }
    throw error;
  }
  writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
  closeSync(fd);
}

function opcionesChrome() {
  const op = new chrome.Options();
  op.addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1440,1100',
    '--disable-background-networking', '--lang=ca-ES',
    '--user-agent=FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)');
  op.setUserPreferences({ 'profile.default_content_setting_values.notifications': 2 });
  return op;
}

async function esperaSelector(driver, selector, ms = 30000) {
  await driver.wait(async () => Boolean(await driver.executeScript(
    'return Boolean(document.querySelector(arguments[0]))', selector)), ms);
}

async function clickBoton(driver, texto) {
  // Hay botones con el mismo texto en el menú de navegación y en el selector de resultados (p. ej.
  // "Competició"). Se prefiere siempre el que NO está dentro de header/nav, y de los candidatos se
  // toma el ÚLTIMO, que es el del selector. Sin esto se abría el menú de navegación y el desplegable
  // real nunca aparecía.
  const ok = await driver.executeScript(`
    const texto = arguments[0];
    const todos = [...document.querySelectorAll('button')]
      .filter((b) => b.innerText.trim() === texto);
    if (!todos.length) return false;
    const fuera = todos.filter((b) => !b.closest('header,nav'));
    const boton = (fuera.length ? fuera : todos).pop();
    boton.scrollIntoView({ block: 'center' });
    boton.click(); return true;`, texto);
  if (!ok) throw new Error(`No se encontró el botón «${texto}»`);
}

/** Marca la lista desplegada que corresponde a un botón.
 *
 *  La web de la FCF no usa ids en los desplegables: son botones («2026-27», «Futbol 11»,
 *  «Competició», «Grup») y la lista `<ul><li>` cuelga del contenedor del botón que la abre. Por eso
 *  se busca por el texto del botón y se deja marcada la `<ul>` encontrada, para poder leer sus
 *  opciones y pulsar una después sin volver a deducir dónde estaba. */
const MARCA_LISTA = 'data-facylf-lista';

async function abreLista(driver, id, textosBoton) {
  for (let intento = 1; intento <= 3; intento++) {
    for (const texto of textosBoton) {
      const existe = await driver.executeScript(`return [...document.querySelectorAll('button')]
        .some((b) => b.innerText.trim() === arguments[0])`, texto);
      if (!existe) continue;
      await clickBoton(driver, texto);
      try {
        await driver.wait(async () => Boolean(await driver.executeScript(`
          const [texto, id, marca] = arguments;
          const botones = [...document.querySelectorAll('button')]
            .filter((b) => b.innerText.trim() === texto);
          const fuera = botones.filter((b) => !b.closest('header,nav'));
          for (const b of (fuera.length ? fuera : botones).reverse()) {
            const ul = b.parentElement && b.parentElement.querySelector('ul');
            if (ul && ul.querySelectorAll('li').length) {
              document.querySelectorAll('[' + marca + ']').forEach((x) => x.removeAttribute(marca));
              ul.setAttribute(marca, id);
              return true;
            }
          }
          return false;`, texto, id, MARCA_LISTA)), 45000);
        return;
      } catch (error) {
        if (intento === 3) throw error;
        console.log(`  ↻ la lista de «${texto}» aún no está disponible; reintento ${intento}/3`);
        await pausa();
      }
    }
  }
  throw new Error(`No se pudo abrir la lista ${id}`);
}

async function valoresLista(driver, id) {
  return await driver.executeScript(`return [...document.querySelectorAll('[' + arguments[1] + '="' + arguments[0] + '"] li')]
    .map((li) => (li.getAttribute('title') || li.innerText || '').trim()).filter(Boolean)`, id, MARCA_LISTA);
}

async function eligeLista(driver, id, texto) {
  const ok = await driver.executeScript(`
    const [id, texto, marca] = arguments;
    const li = [...document.querySelectorAll('[' + marca + '="' + id + '"] li')]
      .find((e) => (e.getAttribute('title') || e.innerText || '').trim() === texto);
    if (!li) return false;
    li.click(); return true;`, id, texto, MARCA_LISTA);
  if (!ok) throw new Error(`No aparece «${texto}» en la lista ${id}`);
}

function parametro(url, nombre) {
  return new URL(url).searchParams.get(nombre);
}

/**
 * ── EL AVISO DE COOKIES TAPA EL SELECTOR (diagnosticado el 08/10/2026) ───────────────────────────────────
 *
 * La FCF muestra su aviso de consentimiento en cada página —lo vi en pantalla en la primera investigación de
 * Cataluña: `{"botones":["partners","MORE OPTIONS","DISAGREE","AGREE","CA","ACCEDIR",…]}`—. Entonces se
 * concluyó que «la página carga bien», y era verdad a medias: **carga, pero el aviso se queda encima**.
 *
 * La firma del clic interceptado está medida: el botón de la temporada **existe** (por eso `abreLista` entra a
 * su rama de reintento y no al `continue`), **se pulsa**, y **la lista no se despliega** — tres reintentos de
 * 45 s y la sesión muere con `Wait timed out after 45112ms`. Y el catálogo no se actualiza desde el 12/09.
 *
 * Se pulsa SÓLO el botón de aceptar, y sólo si está. **No se toca `MORE OPTIONS` ni `partners`**: configurar
 * consentimientos ajenos a ciegas no es asunto de este recolector. Si algún día cambia el texto del botón, se
 * verá en el registro como «no se encontró», no como un fallo silencioso.
 */
async function aceptaConsentimiento(driver) {
  /*
   * ── EL AVISO APARECE TARDE, Y HAY QUE ESPERARLO (medido el 08/10/2026) ────────────────────────────────
   *
   * La primera versión de esto miraba los botones UNA vez, justo después de `driver.get`. **Y no encontraba
   * nada**: el aviso de Quantcast (`qc-cmp-cleanslate`) se pinta **con retraso**, así que en ese instante
   * todavía no está. Después aparece y **tapa todos los botones del selector**.
   *
   * Lo dice el diagnóstico `scripts/diagnostica-selector-cataluna.mjs`, con la posición de cada botón y quién
   * lo tapa:
   *
   *   [19] «2026-27» visible pos(85,687)  ← TAPADO POR DIV.qc-cmp-cleanslate css-1ij9nli
   *   [3]  «AGREE»   visible pos(918,662)
   *
   * El botón de la temporada existe, está visible… **y el clic no le llega**. Por eso los 81 `<li>` de la
   * página no cambiaban en 50 segundos: no es que la lista tardara, es que nadie pulsaba nada.
   *
   * Así que se espera hasta 25 s a que el aviso aparezca y se cierra en cuanto esté: desde el 16/10/2026 con
   * `DISAGREE` (rechazar) si existe, y si no con aceptar. `MORE OPTIONS` y `partners` no se tocan.
   */
  // 16/10/2026: primero se RECHAZA (lo que menos datos cede, y lo mismo que ya hace `recolector-cataluna-datos.mjs`);
  // si el aviso no tiene botón de rechazo, se acepta como antes, porque sin cerrarlo no se puede pulsar nada.
  const TEXTO_ACEPTAR = ['DISAGREE', 'REJECT ALL', 'REBUTJA', 'REBUTJAR', 'RECHAZAR', 'AGREE', 'ACCEPT', 'ACCEPTAR', 'ACCEPTA', 'ACCEPTAR-HO', 'ACEPTO'];
  for (let intento = 1; intento <= 12; intento++) {
    try {
      const pulsado = await driver.executeScript(`
        const textos = arguments[0];
        const botones = [...document.querySelectorAll('button')];
        const b = textos.map((t) => botones.find((x) => (x.innerText || '').trim().toUpperCase() === t)).find(Boolean);
        if (!b) return '';
        b.click();
        return (b.innerText || '').trim();`, TEXTO_ACEPTAR);
      if (pulsado) {
        console.log(`  · aviso de cookies cerrado («${pulsado}») tras ${intento} comprobación(es): ` +
          'sin esto, la capa tapa todos los botones del selector.');
        await duerme(1500); // que la capa termine de desaparecer antes de tocar nada más
        return true;
      }
    } catch { /* se reintenta: el aviso puede estar justo pintándose */ }
    await duerme(2000);
  }
  console.log('  · no se encontró botón de aceptar cookies en 25 s: se sigue igual (puede que no haya aviso).');
  return false;
}

async function navega(driver, url) {
  console.log(`→ ${url}`);
  await driver.get(url);
  // ANTES de esperar el título y los selectores: mientras el aviso esté encima, todo clic se lo come él.
  await aceptaConsentimiento(driver);
  /*
   * ── UN TÍTULO LENTO NO ES UNA PÁGINA ROTA (arreglado el 08/10/2026) ──────────────────────────────────
   *
   * Antes esto era `await driver.wait(until.titleContains('Competicions'), 45000)` a secas: si el título no
   * llegaba en 45 s, **lanzaba y mataba la sesión de descubrimiento entera**. Medido ese día: dos reintentos de
   * «la lista de 2026-27 aún no está disponible» y después `Wait timed out after 45112ms`, con el
   * descubrimiento del historial a cero.
   *
   * Es la MISMA trampa que ya se corrigió en `recolector-cataluna-datos.mjs`: confundir «la página va lenta»
   * con «el navegador se ha caído». Y la respuesta es la misma: no se tira la sesión por un título. **Lo que
   * decide si la página sirve es si aparecen sus selectores**, y eso se comprueba en la línea siguiente — que
   * sigue lanzando si de verdad no hay nada con lo que trabajar.
   */
  try {
    await driver.wait(until.titleContains('Competicions'), 45000);
  } catch {
    console.log('  · el título tardó más de 45 s; se sigue con la página tal y como esté.');
  }
  await esperaSelector(driver, 'button');
  await pausa();
}

async function descubreTemporadas(driver, datos, consume) {
  await navega(driver, PORTAL); consume();
  const urlActual = await driver.getCurrentUrl();
  const nombreActual = await driver.executeScript(`return [...document.querySelectorAll('button')]
    .map((b) => b.innerText.trim()).find((t) => /^\\d{4}-\\d{2}$/.test(t)) || ''`);
  const idActual = parametro(urlActual, 'temporadaId');
  if (nombreActual && idActual && !datos.temporadas.some((t) => t.id === idActual)) {
    datos.temporadas.push({ id: idActual, nombre: nombreActual, disciplinas: [] });
    guardaCatalogo(datos);
  }
  await abreLista(driver, 'list-temporada', [nombreActual]);
  const nombres = await valoresLista(driver, 'list-temporada');
  for (const nombre of nombres) {
    if (datos.temporadas.some((t) => t.nombre === nombre)) continue;
    await eligeLista(driver, 'list-temporada', nombre);
    await pausa(); consume();
    const id = parametro(await driver.getCurrentUrl(), 'temporadaId');
    if (id) datos.temporadas.push({ id, nombre, disciplinas: [] });
    guardaCatalogo(datos);
    if (nombres.some((n) => !datos.temporadas.some((t) => t.nombre === n))) {
      const seleccionado = nombre;
      await abreLista(driver, 'list-temporada', [seleccionado]);
    }
  }
  datos.temporadas.sort((a, b) => Number(b.id) - Number(a.id));
  guardaCatalogo(datos);
}

async function descubreDisciplinas(driver, datos, consume, quedan) {
  for (const temporada of datos.temporadas) {
    for (const nombre of DISCIPLINAS_PRIORITARIAS) {
      if (!quedan()) return;
      let disciplina = (temporada.disciplinas ??= []).find((d) => d.nombre === nombre);
      if (disciplina?.id) continue;
      await navega(driver, `${PORTAL}?temporadaId=${temporada.id}`); consume();
      await abreLista(driver, 'list-disciplina', ['Disciplina']);
      const disponibles = await valoresLista(driver, 'list-disciplina');
      if (!disponibles.includes(nombre)) continue;
      await eligeLista(driver, 'list-disciplina', nombre);
      await pausa(); consume();
      const id = parametro(await driver.getCurrentUrl(), 'disciplinaId');
      disciplina ??= { nombre, competiciones: [] };
      disciplina.id = id;
      if (!temporada.disciplinas.includes(disciplina)) temporada.disciplinas.push(disciplina);
      guardaCatalogo(datos);
      console.log(`  ✓ ${temporada.nombre} · ${nombre} = ${id}`);
    }
  }
}

async function catalogaCompeticiones(driver, datos, consume, quedan) {
  for (const temporada of datos.temporadas) for (const disciplina of temporada.disciplinas ?? []) {
    if (!quedan()) return;
    if (!disciplina.id || disciplina.catalogadaEn) continue;
    await navega(driver, `${PORTAL}?temporadaId=${temporada.id}&disciplinaId=${disciplina.id}`); consume();
    await abreLista(driver, 'list-competicio', ['Competició']);
    const nombres = (await valoresLista(driver, 'list-competicio')).filter((n) => n !== 'Sense selecció');
    disciplina.competiciones ??= [];
    for (const nombre of nombres) if (!disciplina.competiciones.some((c) => c.nombre === nombre)) {
      disciplina.competiciones.push({ nombre, id: null, grupos: [] });
    }
    disciplina.catalogadaEn = new Date().toISOString();
    guardaCatalogo(datos);
    console.log(`  ✓ ${temporada.nombre} · ${disciplina.nombre}: ${nombres.length} competiciones`);
  }
}

/** Abre el desplegable de grupos.
 *
 *  Es el único desplegable cuyo rótulo cambia solo: mientras no hay grupo elegido pone «Grup»
 *  y después muestra el nombre del grupo elegido («GRUP 2»). Por eso se prueban varias
 *  etiquetas y sólo se acepta la lista que además contiene nombres de grupo conocidos (si no,
 *  se marcaría el desplegable vecino). NO lanza: un grupo que falle se contabiliza sin tumbar
 *  la sesión entera, que era lo que dejaba el catálogo atascado sin ningún `grupId`. */
async function abreListaGrupo(driver, etiquetas, conocidos) {
  const candidatas = [...new Set(etiquetas.filter(Boolean))];
  for (let intento = 1; intento <= 2; intento++) {
    for (const texto of candidatas) {
      const existe = await driver.executeScript(`return [...document.querySelectorAll('button')]
        .some((b) => b.innerText.trim() === arguments[0])`, texto);
      if (!existe) continue;
      await clickBoton(driver, texto);
      try {
        await driver.wait(async () => Boolean(await driver.executeScript(`
          const [texto, id, marca, conocidos] = arguments;
          const textoDe = (li) => (li.getAttribute('title') || li.innerText || '').trim();
          const botones = [...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === texto);
          const fuera = botones.filter((b) => !b.closest('header,nav'));
          for (const b of (fuera.length ? fuera : botones).reverse()) {
            const ul = b.parentElement && b.parentElement.querySelector('ul');
            if (!ul) continue;
            const items = [...ul.querySelectorAll('li')];
            if (!items.length) continue;
            if (conocidos.length && !items.some((li) => conocidos.includes(textoDe(li)))) continue;
            document.querySelectorAll('[' + marca + ']').forEach((x) => x.removeAttribute(marca));
            ul.setAttribute(marca, id);
            return true;
          }
          return false;`, texto, 'list-grup', MARCA_LISTA, conocidos ?? [])), 30000);
        return true;
      } catch { /* se prueba la siguiente etiqueta */ }
    }
    if (intento === 1) await pausa();
  }
  return false;
}

function apuntaIncidencia(datos, mensaje) {
  datos.incidencias.push({ fecha: new Date().toISOString(), mensaje });
  datos.incidencias = datos.incidencias.slice(-200);
  guardaCatalogo(datos);
  console.log(`  ⚠ ${mensaje}`);
}

/** Resuelve los grupos de UNA competición y guarda el HTML de cada uno.
 *
 *  Se navega una sola vez a la competición y luego se eligen los grupos seguidos (el
 *  desplegable se cierra tras cada elección y se reabre con el rótulo ya conocido), en vez de
 *  recargar la página por grupo. El `grupId` de la URL es la única prueba de que el cambio se
 *  aplicó, así que se espera a que CAMBIE respecto al anterior: si no, se anotaría otra vez el
 *  identificador del grupo previo. `listaAbierta` evita la recarga cuando el llamante acaba de
 *  abrir la lista. */
async function resuelveGruposDeCompeticion(driver, datos, temporada, disciplina, competicion, consume, quedan, listaAbierta) {
  const pendientes = (competicion.grupos ?? []).filter((g) => !g.id && (g.fallos ?? 0) < 3);
  if (!pendientes.length) return;
  const nombres = (competicion.grupos ?? []).map((g) => g.nombre);
  if (!listaAbierta) {
    if (!quedan()) return;
    await navega(driver, `${PORTAL}?temporadaId=${temporada.id}&disciplinaId=${disciplina.id}&competicioId=${competicion.id}`); consume();
    if (!await abreListaGrupo(driver, ['Grup', ...nombres], nombres)) {
      for (const grupo of pendientes) grupo.fallos = (grupo.fallos ?? 0) + 1;
      apuntaIncidencia(datos, `${competicion.nombre}: la lista de grupos no se abre`);
      return;
    }
  }
  for (const grupo of pendientes) {
    if (!quedan()) return;
    try {
      const disponibles = await valoresLista(driver, 'list-grup');
      if (!disponibles.includes(grupo.nombre)) {
        if (!await abreListaGrupo(driver, ['Grup', grupo.nombre, ...nombres], nombres)) {
          throw new Error('la lista de grupos no se abre');
        }
        if (!(await valoresLista(driver, 'list-grup')).includes(grupo.nombre)) {
          throw new Error(`el desplegable no ofrece «${grupo.nombre}»`);
        }
      }
      const antes = parametro(await driver.getCurrentUrl(), 'grupId');
      await eligeLista(driver, 'list-grup', grupo.nombre);
      await driver.wait(async () => {
        const actual = parametro(await driver.getCurrentUrl(), 'grupId');
        return Boolean(actual) && actual !== antes;
      }, 30000);
      grupo.id = parametro(await driver.getCurrentUrl(), 'grupId');
      grupo.fallos = 0;
      grupo.descubiertoEn = new Date().toISOString();
      const html = String(await driver.executeScript('return document.documentElement.outerHTML'));
      grupo.archivo = join(CRUDOS, `t${temporada.id}-d${disciplina.id}-c${competicion.id}-g${grupo.id}.html`);
      writeFileSync(grupo.archivo, html);
      guardaCatalogo(datos);
      console.log(`  ✓ ${temporada.nombre} · ${competicion.nombre} · ${grupo.nombre} = ${grupo.id}`);
    } catch (error) {
      grupo.fallos = (grupo.fallos ?? 0) + 1;
      apuntaIncidencia(datos, `${competicion.nombre} · ${grupo.nombre}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await pausa(); consume();
  }
}

async function resuelveCompeticiones(driver, datos, consume, quedan) {
  for (const temporada of datos.temporadas) for (const disciplina of temporada.disciplinas ?? []) {
    for (const competicion of disciplina.competiciones ?? []) {
      if (!quedan()) return;
      if (competicion.id || (competicion.fallos ?? 0) >= 3) continue;
      try {
        await navega(driver, `${PORTAL}?temporadaId=${temporada.id}&disciplinaId=${disciplina.id}`); consume();
        await abreLista(driver, 'list-competicio', ['Competició']);
        await eligeLista(driver, 'list-competicio', competicion.nombre);
        await pausa(); consume();
        competicion.id = parametro(await driver.getCurrentUrl(), 'competicioId');
        if (!competicion.id) throw new Error('la FCF no devolvió identificador');
        await abreLista(driver, 'list-grup', ['Grup']);
        const grupos = (await valoresLista(driver, 'list-grup')).filter((n) => n !== 'Sense selecció');
        competicion.grupos = grupos.map((nombre) => competicion.grupos.find((g) => g.nombre === nombre) ?? { nombre, id: null });
        competicion.fallos = 0;
        guardaCatalogo(datos);
        console.log(`  ✓ ${competicion.nombre} = ${competicion.id}; ${grupos.length} grupos`);
        // Los grupos se resuelven aquí mismo, con la lista recién abierta: antes se dejaban
        // para una fase posterior que casi nunca llegaba a ejecutarse (el presupuesto de
        // acciones se agotaba resolviendo competiciones) y el catálogo se quedaba sin grupId.
        await resuelveGruposDeCompeticion(driver, datos, temporada, disciplina, competicion, consume, quedan, true);
      } catch (error) {
        competicion.fallos = (competicion.fallos ?? 0) + 1;
        apuntaIncidencia(datos, `${competicion.nombre}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

/** Repesca: competiciones ya identificadas a las que les quedan grupos sin resolver. */
async function resuelveGrupos(driver, datos, consume, quedan) {
  for (const temporada of datos.temporadas) for (const disciplina of temporada.disciplinas ?? []) {
    for (const competicion of disciplina.competiciones ?? []) {
      if (!quedan()) return;
      if (!competicion.id) continue;
      await resuelveGruposDeCompeticion(driver, datos, temporada, disciplina, competicion, consume, quedan, false);
    }
  }
}

async function main() {
  mkdirSync(CARPETA, { recursive: true });
  const datos = leeCatalogo();
  if (comando === 'estado') {
    console.log(JSON.stringify(resumen(datos), null, 2));
    return;
  }
  adquiereBloqueo();
  let usadas = 0;
  const consume = () => { usadas++; };
  const quedan = () => usadas < MAX;
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(opcionesChrome()).build();
  try {
    await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000 });
    /*
     * ── EL HISTORIAL NO SE DESCUBRÍA NUNCA (arreglado el 08/10/2026) ─────────────────────────────────────
     *
     * Antes: `if (!datos.temporadas.length)`. Es decir, sólo se buscaban temporadas con el catálogo VACÍO.
     * Con dos ya dentro, la condición era falsa para siempre y **las diez temporadas anteriores no se buscaban
     * jamás** — mientras el resto de pasos sí corrían y el descubridor parecía funcionar. Cataluña se quedó en
     * 2 temporadas teniendo que llegar a 2015.
     *
     * Ahora también se busca **si al catálogo le falta historial** respecto al `desdeAnio` que declara la
     * federación. Es aditivo: con el catálogo completo, `faltaHistorial` es falso y no cambia nada.
     */
    const anioMinimo = anioMinimoConfigurado();
    const anios = datos.temporadas
      .map((t) => Number(String(t.nombre ?? '').slice(0, 4)))
      .filter(Number.isFinite);
    const masAntigua = anios.length ? Math.min(...anios) : null;
    const faltaHistorial = anioMinimo > 0 && (masAntigua === null || masAntigua > anioMinimo);
    if (faltaHistorial) {
      console.log(`  · el catálogo llega hasta ${masAntigua ?? '—'} y la federación declara desde ${anioMinimo}: ` +
        'se buscan las temporadas que faltan.');
    }
    if ((!datos.temporadas.length || faltaHistorial) && quedan()) await descubreTemporadas(driver, datos, consume);
    if (quedan()) await descubreDisciplinas(driver, datos, consume, quedan);
    if (quedan()) await catalogaCompeticiones(driver, datos, consume, quedan);
    if (quedan()) await resuelveCompeticiones(driver, datos, consume, quedan);
    if (quedan()) await resuelveGrupos(driver, datos, consume, quedan);
  } catch (error) {
    datos.incidencias.push({ fecha: new Date().toISOString(), mensaje: error instanceof Error ? error.message : String(error) });
    datos.incidencias = datos.incidencias.slice(-100);
    guardaCatalogo(datos);
    throw error;
  } finally {
    await driver.quit().catch(() => {});
    rmSync(BLOQUEO, { force: true });
  }
  console.log(JSON.stringify({ ...resumen(datos), accionesSesion: usadas }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
