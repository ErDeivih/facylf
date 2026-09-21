import { readFileSync } from 'node:fs';
const AG = 'FacylfBot/1.0 (proyecto personal)';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': AG, accept: 'application/json,text/plain,*/*' }, redirect: 'follow' });
    const t = await r.text();
    return { status: r.status, ct: (r.headers.get('content-type') ?? '').split(';')[0], t };
  } catch (e) { return { status: 0, error: e.message, t: '' }; }
}

// códigos reales
const val = JSON.parse(readFileSync('descargas-federacion-sondeo/valencia-isquad-sondeo.json', 'utf8'));
const mad = JSON.parse(readFileSync('descargas-federacion-sondeo/madrid-isquad-sondeo.json', 'utf8'));
function primerConGrupos(d) {
  for (const t of d.temporadas) for (const c of t.competiciones ?? []) if ((c.grupos ?? []).length) return { temp: t.codigo, comp: c.codigo, grupo: c.grupos[0].codigo, nombre: c.nombre };
  return null;
}
const v = primerConGrupos(val), m = primerConGrupos(mad);
console.log('Valencia ejemplo:', JSON.stringify(v));
console.log('Madrid ejemplo:', JSON.stringify(m));

console.log('\n===== VALENCIA: candidatos *_fetch.php =====');
const candsV = ['jornadas_fetch', 'partidos_fetch', 'calendario_fetch', 'clasificacion_fetch', 'actas_fetch', 'resultados_fetch', 'jornada_fetch', 'equipos_fetch'];
for (const c of candsV) {
  const u = `https://ffcv.es/competiciones/api/filtros/${c}.php?cod_competicion=${v.comp}&cod_grupo=${v.grupo}`;
  const r = await get(u);
  const muestra = r.t.replace(/\s+/g, ' ').slice(0, 110);
  console.log(`  ${c.padEnd(20)} HTTP ${r.status} ${r.ct} ${r.t.length}B  ${muestra}`);
  await dormir(1200);
}

console.log('\n===== MADRID: candidatos /api/ =====');
const candsM = ['matches', 'match', 'calendar', 'calendars', 'rounds', 'matchdays', 'standings', 'classifications', 'results', 'games', 'classification', 'jornadas', 'partidos', 'actas'];
for (const c of candsM) {
  const u = `https://www.rffm.es/api/${c}?competicion=${m.comp}&grupo=${m.grupo}`;
  const r = await get(u);
  const muestra = r.t.replace(/\s+/g, ' ').slice(0, 110);
  console.log(`  ${c.padEnd(16)} HTTP ${r.status} ${r.ct} ${r.t.length}B  ${muestra}`);
  await dormir(1200);
}
