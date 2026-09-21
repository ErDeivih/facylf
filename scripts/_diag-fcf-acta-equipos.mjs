#!/usr/bin/env node
/**
 * ¿Cómo se sabe a qué equipo pertenece cada bloque de alineación en la ficha de la FCF?
 * Uso: node scripts/_diag-fcf-acta-equipos.mjs [codacta]
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
    const equipos = [...principal.querySelectorAll('img[alt]')].map((i) => i.getAttribute('alt'))
      .filter((a) => a && a.length > 4 && !/logo|fcf|banner/i.test(a));
    const unicos = [...new Set(equipos)];
    const filas = [...principal.querySelectorAll('h3')].map((h) => {
      const cadena = [];
      let nodo = h;
      for (let i = 0; i < 5 && nodo; i++) {
        nodo = nodo.parentElement;
        if (!nodo) break;
        const imagenes = [...nodo.querySelectorAll('img[alt]')].map((x) => x.getAttribute('alt'));
        cadena.push({ nivel: i + 1, clase: (nodo.className || '').toString().slice(0, 70),
          equiposDentro: [...new Set(imagenes.filter((a) => unicos.includes(a)))].slice(0, 3),
          encabezados: [...nodo.querySelectorAll('h3')].map((x) => x.textContent.trim()).slice(0, 12) });
      }
      return { titulo: h.textContent.trim(), cadena };
    });
    return { equipos: unicos, filas };`);

  console.log('escudos/alt de equipos en la página:', JSON.stringify(informe.equipos));
  for (const fila of informe.filas) {
    console.log(`\n########## h3 «${fila.titulo}»`);
    for (const nivel of fila.cadena) {
      console.log(`  nivel ${nivel.nivel} · ${nivel.clase}`);
      console.log(`     equipos dentro: ${JSON.stringify(nivel.equiposDentro)}`);
      console.log(`     h3 dentro: ${JSON.stringify(nivel.encabezados)}`);
    }
  }
} catch (error) {
  console.error('FALLO:', error.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  await driver.quit().catch(() => {});
}
