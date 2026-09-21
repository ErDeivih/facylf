#!/usr/bin/env node
/** Comprueba el portal de Melilla (rfmf.es) y el de la FCF. */
const UA = 'FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)';

for (const url of [
  'https://www.rfmf.es/pagina/index.php',
  'https://www.rfmf.es/pagina/index1.php?var=docu&tipo=1',
  'https://www.rfmf.es/robots.txt',
]) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
    const cuerpo = await r.text();
    console.log(`${r.status} ${String(Buffer.byteLength(cuerpo)).padStart(8)} B  ${url}`);
    if (!r.ok || Buffer.byteLength(cuerpo) < 400) console.log(`    cuerpo: ${JSON.stringify(cuerpo.slice(0, 200))}`);
  } catch (error) {
    console.log(`ERROR ${error.message}  ${url}`);
  }
}
