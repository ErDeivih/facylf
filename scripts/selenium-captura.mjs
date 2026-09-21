// Captura por TEMPORADA usando el DESPLEGABLE de la página (con Selenium).
//
// El endpoint HTTP `LstCompeticiones?codtemporada=N` IGNORA el año y devuelve siempre las
// competiciones de la temporada actual. Por eso hay que usar el navegador: cargamos la
// página de "Resultados y clasificaciones", ELEGIMOS la temporada en el desplegable (eso
// recarga la lista), y leemos las competiciones y sus grupos de ese año.
//
// Uso:  node scripts/selenium-captura.mjs 22 18 8    (temporadas a capturar)
// Escribe: descargas-federacion/selenium/competiciones-<temp>.json
//          descargas-federacion/selenium/captura-<temp>.json   (crudo, para depurar)

import path from 'node:path';
import fs from 'node:fs';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const args = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const temporadas = args.length ? args : [22, 18, 8];
const carpeta = path.join(process.cwd(), 'descargas-federacion', 'selenium');
fs.mkdirSync(carpeta, { recursive: true });

const bot = `FacylfBot/1.0 (+${process.env.BOT_URL || 'https://xd.es/bot'}; ${process.env.BOT_CONTACTO || 'bot@xd.es'})`;
const options = new chrome.Options();
// Ventana REAL (no headless): el sitio no puebla el histórico para navegadores sin ventana.
options.addArguments('--window-size=1280,900', `--user-agent=${bot}`);
options.set('download.default_directory', carpeta);

const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

// Lee las opciones de TODOS los <select> (array de arrays [{value,texto}]).
async function todosSelects() {
  const sels = await driver.findElements({ css: 'select' });
  const out = [];
  for (const s of sels) {
    const ops = await s.findElements({ css: 'option' });
    const opciones = [];
    for (const o of ops) opciones.push({ value: await o.getAttribute('value'), texto: await o.getText() });
    out.push(opciones);
  }
  return out;
}

// Selecciona `value` en el <select> número `n`, disparando el cambio (onchange → recarga).
async function selecciona(n, value) {
  await driver.executeScript(
    (idx, v) => { const s = document.querySelectorAll('select')[idx]; if (s) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); } },
    n,
    value,
  );
  await driver.sleep(2000);
}

// Índice del <select> de TEMPORADA (valores tipo 22,21,…8) y del de COMPETICIÓN (8 dígitos).
function indices(selects) {
  const iTemp = selects.findIndex((s) => s.some((o) => /^\d{1,2}$/.test(o.value) && /^(20\d\d-20\d\d)$/.test(o.texto)));
  const iComp = selects.findIndex((s, i) => i !== iTemp && s.filter((o) => /^\d{8,}$/.test(o.value)).length >= 3);
  return { iTemp, iComp };
}

try {
  await driver.get('https://www.rfcylf.es/');
  await driver.sleep(1500);
  for (const selector of ['text=Aceptar', 'text=Acepto', 'button:has-text("Aceptar")', '#accept', '[aria-label="Aceptar"]']) {
    try { const b = await driver.findElement({ css: selector }); await b.click(); await driver.sleep(400); break; } catch { /* no existe */ }
  }

  await driver.get('https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22');
  await driver.sleep(1800);

  const selectsBase = await todosSelects();
  const { iTemp, iComp } = indices(selectsBase);
  console.log(`índices: temporada=${iTemp}, competición=${iComp}`);
  if (iTemp < 0 || iComp < 0) { console.log('⚠️  No he encontrado los desplegables. Mira captura-*.json (crudo).'); }

  for (const temp of temporadas) {
    console.log(`→ temporada ${temp} …`);
    try {
      await selecciona(iTemp, String(temp)); // elige la temporada → recarga
      const selects = await todosSelects();
      fs.writeFileSync(path.join(carpeta, `captura-${temp}.json`), JSON.stringify({ temporada: String(temp), selects }, null, 2));
      const result = [];
      const iC = iComp >= 0 ? iComp : selects.findIndex((s, i) => i !== iTemp && s.filter((o) => /^\d{8,}$/.test(o.value)).length >= 3);
      if (iC >= 0) {
        const comps = selects[iC].filter((o) => /^\d{8,}$/.test(o.value));
        for (const c of comps) {
          try {
            await selecciona(iC, c.value);
            const sels2 = await todosSelects();
            const iG = sels2.findIndex((s, i) => i !== iC && s.filter((o) => /^\d{8,}$/.test(o.value)).length >= 1);
            const grupos = iG >= 0 ? sels2[iG].filter((o) => /^\d{8,}$/.test(o.value)) : [];
            result.push({ codCompeticion: c.value, nombre: c.texto, grupos });
          } catch (e) {
            result.push({ codCompeticion: c.value, nombre: c.texto, error: e instanceof Error ? e.message : String(e) });
          }
          await driver.sleep(700);
        }
      }
      const ruta = path.join(carpeta, `competiciones-${temp}.json`);
      fs.writeFileSync(ruta, JSON.stringify({ temporada: String(temp), competiciones: result }, null, 2));
      console.log(`  · temporada ${temp}: ${result.length} competiciones → ${path.basename(ruta)}`);
    } catch (e) {
      console.error(`  ⚠️ temporada ${temp}: ${e instanceof Error ? e.message : e}`);
    }
    await driver.sleep(2500);
  }
  console.log('\n✅ Listo: leo los competiciones-*.json.');
} finally {
  await driver.quit();
}
