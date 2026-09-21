#!/usr/bin/env node
/**
 * Pasada por las páginas principales de la web con las federaciones nuevas, para ver si alguna falla.
 *
 * Uso: node scripts/_diag-web-paginas.mjs [federacion]
 */
const federacion = process.argv[2] ?? 'cataluna';
const rutas = [
  '/',
  '/federaciones',
  `/competiciones?federacion=${federacion}`,
  `/partidos?federacion=${federacion}`,
  `/equipos?federacion=${federacion}`,
  `/jugadores?federacion=${federacion}`,
  `/tecnicos?federacion=${federacion}`,
  `/estadisticas?federacion=${federacion}`,
  '/arbitros-campos',
  '/buscar?q=girona',
];
for (const ruta of rutas) {
  const url = `http://127.0.0.1:3000${ruta}`;
  const inicio = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(240_000) });
    const cuerpo = await r.text();
    const texto = cuerpo.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const pista = texto.length > 200 ? texto.slice(0, 120) : texto;
    console.log(`${String(r.status).padStart(3)} ${String(cuerpo.length).padStart(8)} B ${String(Date.now() - inicio).padStart(6)} ms  ${ruta}`);
    if (r.status !== 200) console.log(`      ${pista}`);
  } catch (error) {
    console.log(`ERR ${String(Date.now() - inicio).padStart(6)} ms  ${ruta} → ${error.message}`);
  }
}
