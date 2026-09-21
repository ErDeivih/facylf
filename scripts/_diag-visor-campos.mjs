#!/usr/bin/env node
/** Enseña las federaciones del visor que no son cola (sondeo/catálogo) y los campos que faltan. */
const visor = process.argv[2] ?? 'http://127.0.0.1:3777';
const estado = await (await fetch(`${visor}/api/estado`, { signal: AbortSignal.timeout(120_000) })).json();
console.log('federaciones que NO son cola:');
for (const f of estado.filter((x) => x.tipo !== 'cola')) {
  console.log(`  ${f.nombre} · tipo=${f.tipo} · adaptador=${f.adaptador} · sinBase=${f.sinBase} · pend=${f.pend} · nota=${String(f.nota ?? '').slice(0, 60)}`);
  console.log(`     claves con valor nulo: ${Object.entries(f).filter(([, v]) => v === null).map(([k]) => k).join(', ') || 'ninguna'}`);
}
const sinMetricas = estado.filter((f) => f.tipo === 'cola' && (!f.porTemporada || !f.porTemporada.length));
console.log(`\nfederaciones de cola sin reparto por temporada: ${sinMetricas.map((f) => f.nombre).join(', ') || 'ninguna'}`);
for (const f of estado) {
  const edades = [];
  if (f.metricasActualizadasEn) edades.push(`métricas ${((Date.now() - Date.parse(f.metricasActualizadasEn)) / 60000).toFixed(1)} min`);
  if (f.ultimaEdad != null) edades.push(`última petición hace ${f.ultimaEdad} s`);
  console.log(`${f.nombre.padEnd(20)} ${edades.join(' · ')}`);
}
