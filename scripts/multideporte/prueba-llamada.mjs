#!/usr/bin/env node
/** Una llamada suelta (GET o POST JSON/form) para comprobar una API; imprime estado y el principio de la
 *  respuesta SIN DNI ni correos. Uso: node prueba-llamada.mjs <url> [cuerpo] */
import { retiraIdentificadores, AGENTE } from './motor.mjs';
const [url, cuerpo] = process.argv.slice(2);
const r = await fetch(url, { method: cuerpo ? 'POST' : 'GET', body: cuerpo,
  headers: { 'user-agent': AGENTE, accept: 'application/json,text/html,*/*', ...(cuerpo ? { 'content-type': /^\s*[[{]/.test(cuerpo) ? 'application/json' : 'application/x-www-form-urlencoded' } : {}) } });
const t = await r.text();
console.log(`${r.status} ${r.headers.get('content-type')} ${t.length} B\n${retiraIdentificadores(t).slice(0, 2500)}`);
