/**
 * robots.txt con las reglas que de verdad usan los portales que nos interesan: grupos por agente, el
 * grupo `*` como respaldo, comodines `*` y ancla `$`, y la regla MÁS LARGA manda (a igualdad, Allow).
 *
 * Por qué no vale el lector de `sondeo-isquad.mjs`: usa `startsWith`, y datos.madrid.es veta
 * `/dataset/*\/resource/*`, Futormes `/mod/soccer/match.aspx` y Competize a ClaudeBot por su nombre.
 * Con `startsWith` lo primero se leía como permitido.
 *
 * Criterio del proyecto: sin robots.txt legible (404) se permite; si el servidor falla (5xx, red) NO se
 * pide nada de ese sitio hasta poder leerlo.
 */

/** @returns {{ grupos: Array<{ agentes: string[], reglas: Array<{tipo:'allow'|'disallow', ruta:string}> }>, crawlDelay: number|null }} */
export function interpretaRobots(texto) {
  const grupos = [];
  let actual = null;
  let crawlDelay = null;
  let ultimaFueAgente = false;
  for (const bruta of String(texto ?? '').split(/\r?\n/)) {
    const linea = bruta.replace(/#.*$/, '').trim();
    if (!linea) continue;
    const i = linea.indexOf(':');
    if (i < 0) continue;
    const campo = linea.slice(0, i).trim().toLowerCase();
    const valor = linea.slice(i + 1).trim();
    if (campo === 'user-agent') {
      if (!ultimaFueAgente || !actual) { actual = { agentes: [], reglas: [] }; grupos.push(actual); }
      actual.agentes.push(valor.toLowerCase());
      ultimaFueAgente = true;
      continue;
    }
    ultimaFueAgente = false;
    if (!actual) continue;
    if (campo === 'allow' || campo === 'disallow') actual.reglas.push({ tipo: campo, ruta: valor });
    else if (campo === 'crawl-delay' && actual.agentes.includes('*')) {
      const n = Number(valor);
      if (Number.isFinite(n) && n >= 0) crawlDelay = n;
    }
  }
  return { grupos, crawlDelay };
}

function patronARegex(ruta) {
  const ancla = ruta.endsWith('$');
  const cuerpo = (ancla ? ruta.slice(0, -1) : ruta)
    .split('*').map((t) => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${cuerpo}${ancla ? '$' : ''}`);
}

/** Reglas que aplican a un agente: su grupo propio si existe; si no, el de `*`. */
export function reglasPara(robots, agente) {
  const a = String(agente).toLowerCase();
  const propios = robots.grupos.filter((g) => g.agentes.some((x) => x !== '*' && a.includes(x)));
  const elegidos = propios.length ? propios : robots.grupos.filter((g) => g.agentes.includes('*'));
  return elegidos.flatMap((g) => g.reglas);
}

/** ¿Puede `agente` pedir `rutaYConsulta` (path + query)? */
export function permitido(robots, agente, rutaYConsulta) {
  let mejor = null;
  for (const regla of reglasPara(robots, agente)) {
    if (regla.tipo === 'disallow' && regla.ruta === '') continue; // «Disallow:» vacío = todo permitido
    if (!patronARegex(regla.ruta).test(rutaYConsulta)) continue;
    const largo = regla.ruta.length;
    if (!mejor || largo > mejor.largo || (largo === mejor.largo && regla.tipo === 'allow')) mejor = { largo, tipo: regla.tipo };
  }
  return !mejor || mejor.tipo === 'allow';
}
