/*
 * Quita la marca de orden de bytes (BOM) de un fichero si la lleva.
 *
 * Para qué: se puso BOM por error a un `.mjs` al arreglar el de los `.ps1`. Node tolera el BOM al importar,
 * pero las herramientas del proyecto (eslint, vitest) no lo esperan en un módulo y no hay ninguna razón para
 * tenerlo: el BOM es cosa de los guiones de PowerShell, que es donde PowerShell 5.1 lo necesita para leer los
 * acentos. Uso: node scripts/_quita-bom.mjs <fichero> [...]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BOM = [0xEF, 0xBB, 0xBF];
for (const ruta of process.argv.slice(2)) {
  const bytes = readFileSync(ruta);
  const tiene = bytes[0] === BOM[0] && bytes[1] === BOM[1] && bytes[2] === BOM[2];
  if (!tiene) { console.log(`  ${ruta}: no tenía BOM`); continue; }
  writeFileSync(ruta, bytes.subarray(3));
  console.log(`  ${ruta}: BOM quitado`);
}
