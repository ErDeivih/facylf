/* Estado ACTUAL de los cuatro casos difíciles, con datos frescos y pausas respetuosas.
 *   - Madrid: robots.txt, la respuesta de 267 KB que falla, y qué rutas públicas existen.
 *   - Cataluña, Baleares, Melilla: robots.txt y qué devuelve hoy su portal.
 *
 * Este script SÓLO LEE información pública y espacia las peticiones. No modifica nada. */
const UA = 'FacylfBot/1.0 (proyecto personal; consulta espaciada y reanudable)';
const PAUSA = 6000;
let primera = true;

async function pide(url, { leerCuerpo = true } = {}) {
  if (!primera) await new Promise((r) => setTimeout(r, PAUSA));
  primera = false;
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.1' },
      redirect: 'follow', signal: AbortSignal.timeout(45_000),
    });
    const cuerpo = leerCuerpo ? await r.text() : '';
    return { ok: true, status: r.status, bytes: cuerpo.length, tipo: r.headers.get('content-type'), urlFinal: r.url, cuerpo, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e.message, ms: Date.now() - t0 };
  }
}

function reglasRobots(texto) {
  const reglas = [];
  let aplica = false;
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.replace(/#.*$/, '').trim();
    const [campo, ...resto] = l.split(':');
    const c = (campo ?? '').toLowerCase().trim();
    const v = resto.join(':').trim();
    if (c === 'user-agent') aplica = v === '*';
    else if (aplica && (c === 'disallow' || c === 'allow')) reglas.push(`${c}: ${v || '(vacío)'}`);
  }
  return reglas;
}

console.log('################ MADRID ################');
const rm = await pide('https://www.rffm.es/robots.txt');
console.log(`robots.txt: ${rm.ok ? `HTTP ${rm.status} · ${rm.bytes} B` : rm.error}`);
if (rm.ok) console.log('   ' + (reglasRobots(rm.cuerpo).join('\n   ') || '(sin reglas para *)'));

// La respuesta de 267 KB que el recolector no consigue interpretar como JSON.
const rg = await pide('https://www.rffm.es/api/filtros/grupos_fetch.php?cod_competicion=10618886');
console.log(`\ngrupos_fetch.php?cod_competicion=10618886:`);
console.log(`   ${rg.ok ? `HTTP ${rg.status} · ${rg.bytes} B · ${rg.tipo} · ${rg.ms} ms` : rg.error}`);
if (rg.ok) {
  const c = rg.cuerpo;
  console.log(`   empieza por: ${JSON.stringify(c.slice(0, 160))}`);
  console.log(`   termina por: ${JSON.stringify(c.slice(-120))}`);
  console.log(`   ¿es JSON? ${(() => { try { JSON.parse(c); return 'sí'; } catch { return 'no'; } })()}`);
  console.log(`   ¿tiene avisos de PHP? ${/Warning|Notice|Fatal|Deprecated/i.test(c)}`);
  console.log(`   ¿tiene HTML? ${/<html|<!DOCTYPE/i.test(c)}`);
  console.log(`   reparto de caracteres raros: ${JSON.stringify([...new Set(c.slice(0, 4000))].slice(0, 30).join(''))}`);
}

for (const [nombre, robots, pagina] of [
  ['CATALUÑA', 'https://www.fcf.cat/robots.txt', 'https://www.fcf.cat/ca/competicio'],
  ['BALEARES', 'https://www.ffib.es/robots.txt', 'https://www.ffib.es/Fed/'],
  ['MELILLA', 'https://www.rfmf.es/robots.txt', 'https://www.rfmf.es/pagina/index.php'],
]) {
  console.log(`\n################ ${nombre} ################`);
  const rr = await pide(robots);
  console.log(`robots.txt: ${rr.ok ? `HTTP ${rr.status} · ${rr.bytes} B` : rr.error}`);
  if (rr.ok && rr.status === 200) console.log('   ' + (reglasRobots(rr.cuerpo).join('\n   ') || '(sin reglas para *)'));
  const rp = await pide(pagina);
  console.log(`portal: ${rp.ok ? `HTTP ${rp.status} · ${rp.bytes} B · ${rp.tipo} · redirige a ${rp.urlFinal}` : rp.error}`);
  if (rp.ok) {
    const marcas = {
      'exige sesión/login': /iniciar sesi[oó]n|login|password|contrasenya|acceso privado/i.test(rp.cuerpo),
      'carga datos por JavaScript': /__NEXT_DATA__|window\.__|ajax|fetch\(/i.test(rp.cuerpo),
      'tiene tabla de competiciones': /clasificaci[oó]|calendari|competici[oó]/i.test(rp.cuerpo),
      'HTTP 500 en algún documento': false,
    };
    for (const [k, v] of Object.entries(marcas)) console.log(`   ${v ? 'SI' : 'NO'}  ${k}`);
  }
}

// Melilla: su zona documental era la que devolvía 500.
console.log('\n################ MELILLA · documentos ################');
for (const u of [
  'https://www.rfmf.es/pagina/index1.php?var=docu&tipo=Calendarios&tem=25-26',
  'https://www.rfmf.es/pagina/index1.php?var=docu&tipo=Clasificaciones&tem=25-26',
  'https://www.rfmf.es/pagina/index1.php?var=docu&tipo=Inf&cat=Actas',
]) {
  const r = await pide(u, { leerCuerpo: false });
  console.log(`   ${r.ok ? `HTTP ${r.status} · ${r.bytes} B` : r.error}  ${u.replace('https://www.rfmf.es', '')}`);
}
