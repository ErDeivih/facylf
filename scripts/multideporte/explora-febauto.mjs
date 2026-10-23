#!/usr/bin/env node
/** Sondeo de FEB autonómicas (competiciones.feb.es/autonomicas): temporadas y categorías por «postback», calendario
 *  por GET y su paginación. 5-6 peticiones espaciadas 6 s. Uso: node explora-febauto.mjs [a=3] [temporada=2015] */
import { pedirHttp } from './motor.mjs';
const [a = '3', temp = '2015'] = process.argv.slice(2);
const B = 'https://competiciones.feb.es/autonomicas/';
const espera = () => new Promise((r) => setTimeout(r, 6000));
const txt = async (u, cuerpo) => { const r = await pedirHttp(u, { cuerpo }); console.log(`  ${r.estado} ${cuerpo ? 'POST' : 'GET '} ${u} ${r.bruto.length} B`); return r.bruto.toString('utf8'); };
const opciones = (h, nombre) => { const m = new RegExp(`<select[^>]*name="[^"]*${nombre}"[^>]*>([\\s\\S]*?)</select>`).exec(h); return m ? [...m[1].matchAll(/<option([^>]*)value="([^"]*)"[^>]*>([^<]*)/g)].map((o) => [o[2], o[3].trim(), /selected/.test(o[1])]) : []; };
const ocultos = (h) => Object.fromEntries([...h.matchAll(/<input type="hidden" name="([^"]+)"[^>]*value="([^"]*)"/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&').replace(/&#43;/g, '+').replace(/&#47;/g, '/')]));
const postback = (h, target, extra = {}) => new URLSearchParams({ ...ocultos(h), __EVENTTARGET: target, __EVENTARGUMENT: '', ...extra }).toString();
const resumenCal = (h) => {
  const filas = [...h.matchAll(/partidosDataGrid_\d+_Label1_\d+">([^<]*)<\/span>[\s\S]*?Label2_\d+">([^<]*)<\/span>[\s\S]*?Label3_\d+">([^<]*)<\/span>/g)];
  const jornadas = [...h.matchAll(/tituloLabel_\d+"[^>]*>([^<]*)</g)].map((m) => m[1]);
  return `${jornadas.length} jornadas (${jornadas[0]} … ${jornadas.at(-1)}), ${filas.length} partidos; ej: ${filas.slice(0, 2).map((f) => `${f[1]} | ${f[2]} | ${f[3]}`).join(' ;; ')} · paginación: ${[...h.matchAll(/__doPostBack\(&#39;([^&]+)&#39;/g)].map((m) => m[1]).join(',')}`;
};
const h0 = await txt(`${B}Resultados.aspx?a=${a}`);
const temps = opciones(h0, 'temporadasDropDownList'); console.log('temporadas:', temps.map((t) => t[0]).join(' '));
console.log('categorías (actual):', opciones(h0, 'categoriasDropDownList').length);
await espera();
const h1 = await txt(`${B}Resultados.aspx?a=${a}`, postback(h0, 'controlNavegacion$temporadasDropDownList', { 'controlNavegacion:temporadasDropDownList': temp, 'controlNavegacion:categoriasDropDownList': opciones(h0, 'categoriasDropDownList')[0]?.[0] ?? '' }));
const cats = opciones(h1, 'categoriasDropDownList');
console.log(`categorías ${temp}:`, cats.length, cats.slice(0, 12).map((c) => `${c[0]}=${c[1]}`).join(' | '), '· temporada marcada:', opciones(h1, 'temporadasDropDownList').find((t) => t[2])?.[0]);
const c = cats.find((x) => !/FEB|ENDESA|L\.F|LEB|EBA|ESPA/i.test(x[1]))?.[0] ?? cats[0]?.[0];
await espera();
const h2 = await txt(`${B}Calendarios.aspx?a=${a}&c=${c}&med=0`);
console.log('grupos:', opciones(h2, 'gruposDropDownList').map((g) => `${g[0]}=${g[1]}`).join(' | '));
console.log('cal p1:', resumenCal(h2));
const sig = /__doPostBack\(&#39;([^&]+)&#39;,&#39;&#39;\)">Jornadas Posteriores/.exec(h2)?.[1];
if (sig) { await espera(); const h3 = await txt(`${B}Calendarios.aspx?a=${a}&c=${c}&med=0`, postback(h2, sig)); console.log('cal p2:', resumenCal(h3)); }
const gs = opciones(h2, 'gruposDropDownList');
if (gs.length > 1) { await espera(); const h4 = await txt(`${B}Calendarios.aspx?a=${a}&c=${c}&g=${gs[1][0]}&med=0`); console.log('GET con g=', gs[1][0], '→ grupo marcado:', opciones(h4, 'gruposDropDownList').find((g) => g[2])?.[0], resumenCal(h4).slice(0, 200)); }
