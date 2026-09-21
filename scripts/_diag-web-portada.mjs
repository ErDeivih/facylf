#!/usr/bin/env node
/** Pide la portada de la web local y enseña el error si responde 500. */
const respuesta = await fetch('http://127.0.0.1:3000', { signal: AbortSignal.timeout(60_000) });
console.log(`HTTP ${respuesta.status} ${respuesta.statusText}`);
const texto = await respuesta.text();
console.log(`--- ${texto.length} bytes de respuesta ---`);
const limpio = texto
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
console.log(limpio.slice(0, 3000));
