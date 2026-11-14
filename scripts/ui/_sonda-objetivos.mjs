// Sonda temporal: clasifica los objetivos táctiles de la foto ANTES para decidir la regla.
// No forma parte del medidor; se borra al terminar.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const RAIZ = 'F:/Proyectos/facylf';
const web = createRequire(join(RAIZ, 'apps', 'web', 'package.json'));
const { chromium } = web('@playwright/test');

const rutas = (process.argv[2] || '/,/explorar/calidad,/explorar/competiciones,/explorar/competicion/2939').split(',');
const tamanos = (process.argv[3] || '390,1440').split(',').map(Number);

const navegador = await chromium.launch();
for (const ancho of tamanos) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: ancho <= 640 ? 844 : 900 }, locale: 'es-ES' });
  const pagina = await ctx.newPage();
  for (const ruta of rutas) {
    await pagina.goto(`http://127.0.0.1:4173/fondo-popular-demo${ruta}`, { waitUntil: 'load' });
    await pagina.waitForTimeout(150);
    const datos = await pagina.evaluate(({ umbral }) => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const e = getComputedStyle(el);
        return e.visibility !== 'hidden' && e.display !== 'none' && e.opacity !== '0';
      };
      const rutaCss = (el) => {
        const partes = [];
        let a = el, n = 0;
        while (a && a !== document.body && n < 3) {
          let p = a.tagName.toLowerCase();
          if (a.id) { p += '#' + a.id; partes.unshift(p); break; }
          const c = String(a.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
          if (c) p += '.' + c;
          partes.unshift(p); a = a.parentElement; n++;
        }
        return partes.join(' > ');
      };
      const sel = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], summary';
      const salida = [];
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width >= umbral && r.height >= umbral) continue;
        const e = getComputedStyle(el);
        const padre = el.parentElement;
        const propio = String(el.textContent || '').trim();
        const enPadre = padre ? String(padre.textContent || '').trim() : '';
        salida.push({
          sel: rutaCss(el),
          tag: el.tagName.toLowerCase(),
          w: Math.round(r.width), h: Math.round(r.height),
          display: e.display, lineHeight: e.lineHeight, fontSize: e.fontSize,
          texto: (propio || el.getAttribute('aria-label') || '').slice(0, 40),
          contextoFrase: padre ? enPadre.replace(propio, '').trim().length > 0 : false,
        });
      }
      return { umbral, total: salida.length, items: salida };
    }, { umbral: ancho <= 640 ? 44 : 32 });
    console.log(`\n### ${ruta} ${ancho} umbral=${datos.umbral} pequeños=${datos.total}`);
    for (const it of datos.items) console.log('   ', JSON.stringify(it));
  }
  await ctx.close();
}
await navegador.close();
