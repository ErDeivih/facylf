/*
 * Añade la marca de orden de bytes (BOM) a un .ps1 que tiene acentos y no la lleva.
 *
 * Por qué: PowerShell 5.1 lee un fichero UTF-8 SIN BOM como ANSI. Si el guion tiene acentos, lo que escribe
 * en su registro sale doble-codificado («La captura terminÃ³ con cÃ³digo -1» en el supervisor de Cataluña, que
 * es el único de los cuatro que lleva acentos). Con BOM se lee bien. Es la misma trampa que ya está anotada en
 * docs/plataforma-web/RECOLECCION-10GB.md y la razón de que los demás supervisores estén escritos sin acentos.
 *
 * Uso: node scripts/_pon-bom-ps1.mjs <fichero.ps1> [...]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BOM = [0xEF, 0xBB, 0xBF];
let tocados = 0;

for (const ruta of process.argv.slice(2)) {
  const bytes = readFileSync(ruta);
  const tieneBom = bytes[0] === BOM[0] && bytes[1] === BOM[1] && bytes[2] === BOM[2];
  const acentos = (bytes.toString('utf8').match(/[áéíóúÁÉÍÓÚñÑüÜ«»—]/g) ?? []).length;
  if (tieneBom) { console.log(`  ${ruta}: ya tenía BOM (acentos: ${acentos})`); continue; }
  writeFileSync(ruta, Buffer.concat([Buffer.from(BOM), bytes]));
  tocados++;
  console.log(`  ${ruta}: BOM añadido (acentos: ${acentos})`);
}
console.log(`  ficheros tocados: ${tocados}`);
