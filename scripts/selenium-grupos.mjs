// Selenium: obtiene los GRUPOS de cada competición NAVEGANDO a su URL (no cambia el desplegable)
// y leyendo el desplegable de grupo. Ventana real (el HTTP puro nos bloquea). Reanudable.
// Uso:  node scripts/selenium-grupos.mjs 18   |   node scripts/selenium-grupos.mjs
// Escribe: descargas-federacion/selenium/grupos-por-temporada.json + .grupos-progreso.json

import path from 'node:path';
import fs from 'node:fs';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const args = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const soloTemporadas = new Set(args);
const carpeta = path.join(process.cwd(), 'descargas-federacion', 'selenium');
const rutaComps = path.join(process.cwd(), 'descargas-federacion', 'competiciones-por-temporada.json');
const salida = path.join(carpeta, 'grupos-por-temporada.json');
const progRuta = path.join(carpeta, '.grupos-progreso.json');

const porTemporada = JSON.parse(fs.readFileSync(rutaComps, 'utf8'));
let progreso = fs.existsSync(progRuta) ? JSON.parse(fs.readFileSync(progRuta, 'utf8')) : {};
let gruposPorTemp = fs.existsSync(salida) ? JSON.parse(fs.readFileSync(salida, 'utf8')) : {};

const bot = `FacylfBot/1.0 (+${process.env.BOT_URL || 'https://xd.es/bot'}; ${process.env.BOT_CONTACTO || 'bot@xd.es'})`;
const options = new chrome.Options();
options.addArguments('--window-size=1280,900', `--user-agent=${bot}`); // ventana real
const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Lee el desplegable #grupo (o select[name=grupo]); respaldo: el <select> no-temporada
// con más opciones de 5+ dígitos.
async function leeGrupos() {
  const a = await driver.executeScript(`
    const s = document.querySelector('#grupo') || document.querySelector('select[name=grupo]');
    if (s) return [...s.options].filter(o => /^\\d+$/.test(o.value) && o.value != 0).map(o => ({ codGrupo: o.value, nombre: o.text.trim() }));
    return null;
  `);
  if (a && a.length) return a;
  const b = await driver.executeScript(`
    const s = [...document.querySelectorAll('select')]
      .sort((x, y) => [...y.options].filter(o => /^\\d{5,}$/.test(o.value)).length - [...x.options].filter(o => /^\\d{5,}$/.test(o.value)).length)[0];
    if (!s) return [];
    return [...s.options].filter(o => /^\\d{1,}$/.test(o.value) && o.value != 0).map(o => ({ codGrupo: o.value, nombre: o.text.trim() }));
  `);
  return b || [];
}

try {
  console.log('→ Sesión …');
  await driver.get('https://www.rfcylf.es/');
  await dormir(1500);
  for (const selector of ['text=Aceptar', 'text=Acepto', 'button:has-text("Aceptar")', '#accept', '[aria-label="Aceptar"]']) {
    try { const b = await driver.findElement({ css: selector }); await b.click(); await dormir(400); break; } catch { /* no existe */ }
  }

  const temporadas = Object.keys(porTemporada).filter((t) => soloTemporadas.size === 0 || soloTemporadas.has(Number(t))).sort((a, b) => Number(b) - Number(a));
  const cooldown = 90_000; // si el sitio frena, espera 90 s y reintenta
  let frenosConsecutivos = 0;

  for (const temp of temporadas) {
    const resultado = [];
    for (const c of (porTemporada[temp] || [])) {
      const key = `${temp}|${c.codCompeticion}`;
      if (progreso[key]) { const ex = (gruposPorTemp[temp] || []).find((x) => x.codCompeticion === c.codCompeticion); resultado.push(ex || { codCompeticion: c.codCompeticion, nombre: c.nombre, grupos: [] }); continue; }

      const url = `https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=${c.codCompeticion}&CodTemporada=${temp}&CodJornada=1`;
      let grupos = [];
      let intento = 0;
      let ok = false;
      while (intento < 4 && !ok) {
        try {
          await driver.get(url);
          await dormir(4500);
          const html = await driver.executeScript('return document.documentElement.outerHTML');
          if (!html || html.length < 1000) {
            frenosConsecutivos++;
            console.log(`  ⛔ freno en ${c.codCompeticion} (${frenosConsecutivos}º). Esperando ${Math.round(cooldown / 1000)} s …`);
            await dormir(cooldown);
            intento++;
            continue;
          }
          frenosConsecutivos = 0;
          grupos = await leeGrupos();
          ok = true;
        } catch (e) {
          console.log(`  ⚠️ ${c.codCompeticion}: ${e instanceof Error ? e.message : e}`);
          intento++;
        }
      }
      if (!ok) {
        console.log(`  · ${c.codCompeticion} quedará PENDIENTE (se reintenta la próxima pasada) — ${grupos.length} grupos`);
        continue; // no se guarda ni se marca hecha
      }
      resultado.push({ codCompeticion: c.codCompeticion, nombre: c.nombre, grupos });
      progreso[key] = true;
      console.log(`  · ${c.codCompeticion} (${c.nombre}): ${grupos.length} grupos`);
      await dormir(3000);
    }
    gruposPorTemp[temp] = resultado;
    fs.writeFileSync(salida, JSON.stringify(gruposPorTemp, null, 2));
    fs.writeFileSync(progRuta, JSON.stringify(progreso, null, 2));
    console.log(`  ← temporada ${temp} hecha`);
  }
  console.log('\n✅ Listo: grupos-por-temporada.json. Reanudable: si se corta, relanza y sigue.');
} finally {
  await driver.quit();
}
