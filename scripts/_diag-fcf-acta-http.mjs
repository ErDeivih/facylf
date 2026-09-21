#!/usr/bin/env node
/** ¿Sirve la FCF la ficha de acta ya renderizada (sin navegador)? */
const UA = 'FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)';
const codacta = process.argv[2] ?? '3791092';
for (const ruta of [`/ca/competicio/acta/${codacta}`]) {
  const url = `https://www.fcf.cat${ruta}`;
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
  const html = await r.text();
  console.log(`${url} → ${r.status} ${r.headers.get('content-type')} ${Buffer.byteLength(html)} B`);
  const texto = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`texto visible: ${texto.length} caracteres`);
  console.log(texto.slice(0, 1200));
  for (const pista of ['__NEXT_DATA__', 'TITULARS', 'SUPLENTS', 'Titulars', 'GOLS', 'Gols', 'ÀRBITRE', 'Àrbitre', 'Carregant dades']) {
    const n = html.split(pista).length - 1;
    if (n) console.log(`  «${pista}»: ${n}`);
  }
  const enlaces = [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    .filter((u) => /jugador|equip|acta|partit/i.test(u)))];
  console.log('enlaces de datos:', JSON.stringify(enlaces.slice(0, 12), null, 1));
}
