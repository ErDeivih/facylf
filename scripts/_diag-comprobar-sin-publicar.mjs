#!/usr/bin/env node
/**
 * Vuelve a pedir unas pocas URLs que el recolector dio por «la fuente no publica» y enseña la
 * respuesta cruda. Sirve para distinguir «la fuente no lo tiene» de «lo pedimos mal».
 * Uso: node scripts/_diag-comprobar-sin-publicar.mjs <ruta-cola> [cuantas]
 */
import { DatabaseSync } from 'node:sqlite';

const [rutaDb, cuantas = '3'] = process.argv.slice(2);
const db = new DatabaseSync(rutaDb, { readOnly: true });
const filas = db.prepare(`select trabajo, url, detalle, iniciada_en from peticiones
  where resultado='sin_publicar' order by id desc limit ?`).all(Number(cuantas));
if (!filas.length) console.log('no hay peticiones sin_publicar');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [i, f] of filas.entries()) {
  console.log(`\n== ${f.trabajo} · ${f.detalle} · ${f.iniciada_en}`);
  console.log(`   ${f.url}`);
  try {
    const r = await fetch(f.url, {
      headers: { accept: 'application/json,text/plain;q=0.9,*/*;q=0.1', 'user-agent': 'FACyLF/1.0 (+recoleccion responsable)' },
      signal: AbortSignal.timeout(45_000),
    });
    const texto = await r.text();
    console.log(`   HTTP ${r.status} · ${texto.length} B · ${texto.slice(0, 400).replace(/\s+/g, ' ')}`);
  } catch (error) {
    console.log(`   error: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (i < filas.length - 1) await espera(4000);
}
db.close();
