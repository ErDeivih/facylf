import { writeFileSync } from 'node:fs';
const base = 'http://127.0.0.1:3777';
const html = await (await fetch(base + '/')).text();
const m = html.match(/<script>([\s\S]*?)<\/script>/);
writeFileSync('_tmp_dash.js', m ? m[1] : '');
const est = await (await fetch(base + '/api/estado')).json();
for (const n of ['canarias', 'ceuta', 'castilla-leon', 'euskadi']) {
  const f = est.find((x) => x.nombre === n);
  if (!f) continue;
  console.log(`${n.padEnd(14)} actas ${f.actasHechas}/${f.actasEstimadas != null ? '~' + f.actasEstimadas : '—'} (${f.pctActas}%) | JUGABLE ${f.pctActasJugables}% (${f.actasHechas}/${f.actasJugables}) | futuras ~${f.actasFuturas} en ${f.jornadasFuturas} jornadas`);
}
