// Selenium: baja las JORNADAS de cada competición (grupos de `grupos-por-temporada.json`),
// de la temporada más reciente a la más antigua. Guarda el HTML en el patrón que ya leen
// los parsers (`<slug>-jornada-<j>.html`), para que después `ingesta`/`reconstruir` los procesen.
// Ventana real (sin anti-bot), cadencia y freno. Reanudable (no repite lo ya bajado).
//
// Uso:  node scripts/selenium-jornadas.mjs            (todas)
//       node scripts/selenium-jornadas.mjs 22         (solo temporada 22)
//       node scripts/selenium-jornadas.mjs 22 21 20   (varias)

import path from 'node:path';
import fs from 'node:fs';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const args = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const soloTemp = new Set(args);
const raiz = process.cwd();
const carpeta = path.join(raiz, 'descargas-federacion', 'selenium');
const rutaGrupos = path.join(carpeta, 'grupos-por-temporada.json');
const salida = path.join(raiz, 'descargas-federacion');
const progRuta = path.join(carpeta, '.jornadas-progreso.json');

if (!fs.existsSync(rutaGrupos)) { console.log('Falta grupos-por-temporada.json. Primero: node scripts/selenium-grupos.mjs'); process.exit(1); }
const porTemporada = JSON.parse(fs.readFileSync(rutaGrupos, 'utf8'));
let progreso = {};
if (fs.existsSync(progRuta)) progreso = JSON.parse(fs.readFileSync(progRuta, 'utf8'));

const bot = `FacylfBot/1.0 (+${process.env.BOT_URL || 'https://xd.es/bot'}; ${process.env.BOT_CONTACTO || 'bot@xd.es'})`;
const options = new chrome.Options();
options.addArguments('--window-size=1280,900', `--user-agent=${bot}`); // ventana real
const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Lee el número (máx.) de jornadas del desplegable "jornada" de la página.
async function numJornadas() {
  return await driver.executeScript(`
    const sels = [...document.querySelectorAll('select')];
    const s = sels.find(s => [...s.options].filter(o => /^\\d+$/.test(o.value) && o.value != 0).length > 1);
    if (!s) return 0;
    return Math.max(...[...s.options].map(o => Number(o.value)).filter(n => n > 0));
  `);
}

try {
  console.log('→ Sesión …');
  await driver.get('https://www.rfcylf.es/');
  await dormir(1500);
  for (const selector of ['text=Aceptar', 'text=Acepto', 'button:has-text("Aceptar")', '#accept', '[aria-label="Aceptar"]']) {
    try { const b = await driver.findElement({ css: selector }); await b.click(); await dormir(400); break; } catch { /* no existe */ }
  }

  const temporadas = Object.keys(porTemporada).filter((t) => soloTemp.size === 0 || soloTemp.has(Number(t))).sort((a, b) => Number(b) - Number(a));
  let frenado = false;

  for (const temp of temporadas) {
    if (frenado) break;
    const comps = porTemporada[temp] || [];
    console.log(`\n→ temporada ${temp} (${comps.length} competiciones) …`);
    for (const c of comps) {
      if (frenado) break;
      for (const g of (c.grupos || [])) {
        const slug = `comp-${c.codCompeticion}-gr-${g.codGrupo}-t${temp}`;
        const rutaCal = path.join(salida, `${slug}-calendario.xls`);
        // Saltamos si ya hay jornadas de esta competición
        const yaHay = fs.readdirSync(salida).some((f) => f.startsWith(`${slug}-jornada-`));
        if (yaHay || progreso[slug]) { progreso[slug] = true; continue; }

        const url = `https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=${c.codCompeticion}&CodGrupo=${g.codGrupo}&CodTemporada=${temp}&CodJornada=1`;
        try {
          await driver.get(url);
          await dormir(5000);
          const n = await numJornadas();
          if (n === 0) { console.log(`  · ${slug}: sin jornadas detectadas`); }
          for (let j = 1; j <= (n || 0); j++) {
            const rutaJ = path.join(salida, `${slug}-jornada-${j}.html`);
            if (fs.existsSync(rutaJ) && fs.readFileSync(rutaJ).length > 0) continue;
            if (j > 1) await driver.get(url.replace('CodJornada=1', `CodJornada=${j}`));
            await dormir(4000);
            const html = await driver.executeScript('return document.documentElement.outerHTML');
            if (!html || html.length < 500) { frenado = true; console.log(`  ⛔ frenado en ${slug} jornada ${j}`); break; }
            fs.writeFileSync(rutaJ, html, 'utf8');
            console.log(`  · ${slug} jornada ${j} (${html.length} b)`);
          }
          progreso[slug] = true;
          fs.writeFileSync(progRuta, JSON.stringify(progreso, null, 2));
        } catch (e) {
          console.log(`  ⚠️ ${slug}: ${e instanceof Error ? e.message : e}`);
        }
        await dormir(3000);
      }
    }
    console.log(`  ← temporada ${temp} hecha`);
  }
  console.log('\n✅ Jornadas bajadas. Ahora: pnpm reconstruir …  (o ingesta:todas para actas).');
  console.log('Reanudable: relanza y continúa donde se quedó.');
} finally {
  await driver.quit();
}
