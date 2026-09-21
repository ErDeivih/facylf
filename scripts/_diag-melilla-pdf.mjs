#!/usr/bin/env node
/**
 * ¿Qué partes de la web de Melilla SÍ responden? Se prueban sólo rutas enlazadas por su propia
 * portada: los PDF de resultados/clasificaciones, una noticia y emision.php.
 */
const UA = 'FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)';
const rutas = [
  '/pagina/images/rdTv20-21.pdf',
  '/pagina/images/rdTv19-20.pdf',
  '/pagina/images/rdTv16-17.pdf',
  '/pagina/index1.php?var=docu&tipo=noti&noticia=1251',
  '/pagina/emision.php',
];
for (const ruta of rutas) {
  const url = `https://www.rfmf.es${ruta}`;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
    const buf = Buffer.from(await r.arrayBuffer());
    const tipo = r.headers.get('content-type') ?? '';
    console.log(`${String(r.status).padStart(4)} ${String(buf.length).padStart(9)} B  ${tipo.slice(0, 30).padEnd(30)} ${ruta}`);
    if (buf.length < 500) console.log(`      ${JSON.stringify(buf.toString('utf8').slice(0, 120))}`);
    if (/pdf/i.test(tipo) && buf.length > 1000) {
      const cabecera = buf.subarray(0, 8).toString('latin1');
      console.log(`      cabecera PDF: ${JSON.stringify(cabecera)}`);
    }
  } catch (error) {
    console.log(`ERROR ${error.message}  ${ruta}`);
  }
}
