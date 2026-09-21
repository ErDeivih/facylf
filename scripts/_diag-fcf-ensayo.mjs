#!/usr/bin/env node
/**
 * Ensayo en vivo del capturador de datos de la FCF.
 *
 * Comprueba tres cosas que necesita el worker y que no se pueden deducir del HTML guardado:
 *   1. ¿Basta la URL con `temporadaId&disciplinaId&competicioId&grupId` para abrir el grupo?
 *   2. ¿Cómo se despliega una jornada y dónde quedan sus partidos en el DOM?
 *   3. ¿Se pueden extraer jornada, equipos, marcador y código de acta con un solo paso por el DOM?
 *
 * Uso: node scripts/_diag-fcf-ensayo.mjs [temporadaId] [disciplinaId] [competicioId] [grupId]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const [, , temporadaId = '22', disciplinaId = '19308233', competicioId = '58162422', grupId = '58315186'] = process.argv;
const URL = `https://www.fcf.cat/ca/competicio?temporadaId=${temporadaId}&disciplinaId=${disciplinaId}&competicioId=${competicioId}&grupId=${grupId}`;
const SALIDA = join(import.meta.dirname, '..', 'descargas-cataluna', '_muestras');
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));

function opciones() {
  const op = new chrome.Options();
  op.addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1440,1400',
    '--disable-background-networking', '--lang=ca-ES',
    '--user-agent=FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)');
  return op;
}

/** Todo el trabajo de lectura se hace dentro de la página, que es quien tiene el DOM.
 *
 *  Los partidos se agrupan por fila subiendo desde cada nombre de equipo con `title` hasta el hijo
 *  directo del bloque de la jornada: así no depende de nombres de clase, que cambian con el diseño. */
const EXTRAE_JORNADA = `
  const titulo = arguments[0];
  const cabecera = [...document.querySelectorAll('span,div,h3,h4')]
    .filter((e) => e.children.length === 0 && e.textContent.trim() === titulo)[0];
  if (!cabecera) return { error: 'no encuentro ' + titulo };
  let bloque = cabecera.parentElement;
  while (bloque && bloque !== document.body && bloque.querySelectorAll('a[href*="/ca/competicio/acta/"]').length === 0
         && bloque.querySelectorAll('span[title]').length < 2) bloque = bloque.parentElement;
  if (!bloque) return { error: 'sin bloque para ' + titulo };
  // Cada partido es una fila hermana dentro del contenedor de partidos de esa jornada. La fila que
  // tiene acta se localiza por su enlace; las que aún no la tienen, por ser hermanas con dos nombres.
  const enlaces = [...bloque.querySelectorAll('a[href*="/ca/competicio/acta/"]')];
  const filas = [];
  const contenedores = new Set();
  for (const enlace of enlaces) {
    const fila = enlace.parentElement;
    contenedores.add(fila.parentElement);
    filas.push({ fila, codacta: (enlace.getAttribute('href').match(/(\\d+)\\s*$/) || [])[1] ?? null });
  }
  for (const contenedor of contenedores) {
    for (const hija of contenedor.children) {
      if (filas.some((f) => f.fila === hija)) continue;
      if (hija.querySelectorAll('span[title]').length >= 2) filas.push({ fila: hija, codacta: null });
    }
  }
  const partidos = filas.map(({ fila, codacta }) => {
    const nombres = [...fila.querySelectorAll('span[title]')].map((s) => s.getAttribute('title').trim());
    const texto = (fila.innerText || '').replace(/\\s+/g, ' ').trim();
    const marcador = texto.match(/(\\d+)\\s*-\\s*(\\d+)/);
    return {
      local: nombres[0] ?? null,
      visitante: nombres.length > 1 ? nombres[nombres.length - 1] : null,
      golesLocal: marcador ? Number(marcador[1]) : null,
      golesVisitante: marcador ? Number(marcador[2]) : null,
      codacta,
      texto: texto.slice(0, 140),
    };
  });
  const fecha = (bloque.innerText || '').match(/\\d{4}-\\d{2}-\\d{2}/);
  return { titulo, fecha: fecha ? fecha[0] : null, partidos,
    filasEncontradas: filas.length, contenedores: contenedores.size, clasesBloque: bloque.className.slice(0, 120) };
`;

const driver = await new Builder().forBrowser('chrome').setChromeOptions(opciones()).build();
try {
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000 });
  console.log(`→ ${URL}`);
  await driver.get(URL);
  await duerme(9000);
  const estado = await driver.executeScript(`
    const principal = document.querySelector('main') || document.body;
    const botones = [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean);
    return { url: location.href, cargando: /Carregant dades/i.test(principal.innerText || ''),
      botones: botones.slice(-10), texto: (principal.innerText || '').replace(/\\s+/g, ' ').slice(0, 200) };`);
  console.log(`  URL final: ${estado.url}`);
  console.log(`  ¿sigue cargando? ${estado.cargando}`);
  console.log(`  botones: ${JSON.stringify(estado.botones)}`);
  console.log(`  texto: ${estado.texto}`);

  console.log('\n=== CALENDARI ===');
  await driver.executeScript(`[...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'CALENDARI').pop().click()`);
  await duerme(9000);
  const cabeceras = await driver.executeScript(`
    return [...document.querySelectorAll('span,div,h3,h4')]
      .filter((e) => e.children.length === 0 && /^JORNADA \\d+$/.test(e.textContent.trim()))
      .map((e) => e.textContent.trim());`);
  console.log(`  jornadas visibles: ${cabeceras.length} → ${JSON.stringify(cabeceras.slice(0, 4))}`);

  // Despliega la primera jornada y la extrae.
  const primera = cabeceras[0];
  await driver.executeScript(`
    const t = arguments[0];
    const cabecera = [...document.querySelectorAll('span,div,h3,h4')]
      .filter((e) => e.children.length === 0 && e.textContent.trim() === t)[0];
    const clicable = cabecera.closest('div[class*="cursor-pointer"]') || cabecera.parentElement;
    clicable.click();`, primera);
  await duerme(4000);
  const extraida = await driver.executeScript(EXTRAE_JORNADA, primera);
  console.log(`  bloque: ${extraida.clasesBloque ?? extraida.error}`);
  console.log(`  partidos: ${JSON.stringify(extraida.partidos, null, 1)}`);
  writeFileSync(join(SALIDA, 'ensayo-calendari-jornada1.json'), JSON.stringify(extraida, null, 2));
} catch (error) {
  console.error('FALLO:', error.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  await driver.quit().catch(() => {});
}
