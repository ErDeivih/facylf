#!/usr/bin/env node
/**
 * Detalle fino de una ficha de acta de la FCF: secciones, filas de alineación y marcas por jugador.
 *
 * Uso: node scripts/_diag-fcf-acta-filas.mjs [codacta]
 */
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const codacta = process.argv[2] ?? '3790857';
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));
const op = new chrome.Options();
op.addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1600,2000', '--lang=ca-ES',
  '--user-agent=FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)');

const driver = await new Builder().forBrowser('chrome').setChromeOptions(op).build();
try {
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000 });
  await driver.get(`https://www.fcf.cat/ca/competicio/acta/${codacta}`);
  await duerme(9000);

  const informe = await driver.executeScript(`
    const principal = document.querySelector('main') || document.body;
    const secciones = [...principal.querySelectorAll('h3')].map((h) => h.textContent.trim());
    // Bloques: cada sección es un div con cabecera propia; el cuerpo son sus filas.
    const bloques = [...principal.querySelectorAll('h3')].map((h) => {
      const raiz = h.closest('div[class*="rounded"]') || h.parentElement.parentElement;
      const filas = [...raiz.querySelectorAll(':scope > div')].slice(1)
        .flatMap((cuerpo) => [...cuerpo.children]);
      return {
        titulo: h.textContent.trim(),
        filas: filas.length,
        detalle: filas.slice(0, 3).map((fila) => {
          const svgs = [...fila.querySelectorAll('svg')].map((s) => ({
            clase: (s.getAttribute('class') || '').slice(0, 60),
            titulo: s.querySelector('title') ? s.querySelector('title').textContent : null,
          }));
          const imagenes = [...fila.querySelectorAll('img')].map((i) => i.getAttribute('alt'));
          return {
            texto: (fila.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
            svgs: svgs.slice(0, 6),
            imagenes: imagenes.slice(0, 3),
            html: fila.outerHTML.replace(/\\s+/g, ' ').slice(0, 1200),
          };
        }),
      };
    });
    return { secciones, bloques };`);

  console.log('secciones (h3):', JSON.stringify(informe.secciones));
  for (const bloque of informe.bloques) {
    console.log(`\n########## ${bloque.titulo} · ${bloque.filas} filas`);
    for (const fila of bloque.detalle) {
      console.log(`  texto: ${fila.texto}`);
      console.log(`  svgs: ${JSON.stringify(fila.svgs)} · imágenes: ${JSON.stringify(fila.imagenes)}`);
    }
  }
  console.log('\n--- una fila completa de Alineacions ---');
  const filaHtml = await driver.executeScript(`
    const principal = document.querySelector('main') || document.body;
    const h = [...principal.querySelectorAll('h3')].find((x) => /alineaci/i.test(x.textContent));
    if (!h) return null;
    const raiz = h.closest('div[class*="rounded"]') || h.parentElement.parentElement;
    const filas = [...raiz.querySelectorAll(':scope > div')].slice(1).flatMap((c) => [...c.children]);
    return filas.length ? filas[1].outerHTML.replace(/\\s+/g, ' ') : null;`);
  console.log(filaHtml ? filaHtml.slice(0, 2500) : '(sin filas)');
} catch (error) {
  console.error('FALLO:', error.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  await driver.quit().catch(() => {});
}
