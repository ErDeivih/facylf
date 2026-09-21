#!/usr/bin/env node
/** Mira qué enseña de verdad la página de calendario de una competición. */
const slug = process.argv[2];
const r = await fetch(`http://127.0.0.1:3000/competicion/${slug}/calendario`, { signal: AbortSignal.timeout(180_000) });
const texto = await r.text();
console.log(`HTTP ${r.status} · ${texto.length} B`);
const visible = texto.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
console.log(visible.slice(0, 900));
