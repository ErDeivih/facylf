#!/usr/bin/env node
/** Busca en los registros de los workers las líneas nuevas del cierre por ficha sin datos. */
import { readdirSync, existsSync, readFileSync } from 'node:fs';

const patrones = process.argv.slice(2);
const buscados = patrones.length ? patrones : ['viene sin datos', 'marcado como «la fuente no publica este grupo»'];
for (const d of readdirSync('.').filter((x) => x.startsWith('descargas-')).sort()) {
  const ruta = `${d}/recolector-local/worker-programado.log`;
  if (!existsSync(ruta)) continue;
  const texto = readFileSync(ruta, 'utf8');
  const lineas = texto.split('\n');
  for (const patron of buscados) {
    const encontradas = lineas.filter((l) => l.includes(patron));
    if (encontradas.length) {
      console.log(`${d.replace('descargas-', '')}: ${encontradas.length} líneas con «${patron}»`);
      for (const l of encontradas.slice(-2)) console.log(`    ${l.trim().slice(0, 160)}`);
    }
  }
}
