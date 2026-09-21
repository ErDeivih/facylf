#!/usr/bin/env node
/**
 * Comprueba que la web local sirve de verdad una competición (no sólo que la base lo permita):
 * pide su página y mira si sale el calendario o un 404.
 *
 * Uso: node scripts/_diag-web-competicion.mjs <slug> [--puerto 3000]
 */
const slug = process.argv[2];
if (!slug) throw new Error('uso: node scripts/_diag-web-competicion.mjs <slug>');
const i = process.argv.indexOf('--puerto');
const puerto = i >= 0 ? process.argv[i + 1] : '3000';
for (const sufijo of ['', '/calendario', '/clasificacion']) {
  const url = `http://127.0.0.1:${puerto}/competicion/${slug}${sufijo}`;
  try {
    const t0 = Date.now();
    const r = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    const texto = await r.text();
    const marca = /no encontrada|404|Not Found/i.test(texto.slice(0, 2000)) ? ' (¿no encontrada?)' : '';
    console.log(`${String(r.status).padEnd(4)} ${String(texto.length).padStart(7)} B ${String(Date.now() - t0).padStart(6)} ms  ${url}${marca}`);
    if (r.status === 200 && sufijo === '') {
      const visible = texto.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`      texto: ${visible.slice(0, 220)}`);
    }
  } catch (error) {
    console.log(`FALLA ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
