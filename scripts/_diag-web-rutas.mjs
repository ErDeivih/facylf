#!/usr/bin/env node
/** Prueba varias rutas de la web local para ver qué responde cada una. */
const rutas = process.argv.slice(2);
const lista = rutas.length ? rutas : ['/', '/federaciones', '/partidos', '/equipos', '/jugadores', '/api/salud'];
for (const r of lista) {
  try {
    const t0 = Date.now();
    const respuesta = await fetch(`http://127.0.0.1:3000${r}`, { signal: AbortSignal.timeout(120_000) });
    const texto = await respuesta.text();
    console.log(`${r.padEnd(22)} HTTP ${respuesta.status} · ${texto.length} B · ${Date.now() - t0} ms ${texto.length < 200 ? `· "${texto.trim()}"` : ''}`);
  } catch (error) {
    console.log(`${r.padEnd(22)} FALLA: ${error instanceof Error ? error.message : String(error)}`);
  }
}
