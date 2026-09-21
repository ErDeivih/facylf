#!/usr/bin/env node
/** Muestra cómo está estructurada una fila de partido en la vista CALENDARI de la FCF. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = join(import.meta.dirname, '..', 'descargas-cataluna', '_muestras');
const h = readFileSync(join(carpeta, 'vista-calendari.html'), 'utf8');

const i = h.indexOf('/ca/competicio/acta/');
console.log('--- contexto del primer enlace de acta ---');
console.log(h.slice(Math.max(0, i - 2200), i + 600).replace(/\s+/g, ' '));
console.log('\n--- texto visible de la vista ---');
const texto = h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, '\n')
  .split('\n').map((l) => l.trim()).filter(Boolean);
const j = texto.findIndex((l) => /CALENDARI/.test(l));
console.log(JSON.stringify(texto.slice(j, j + 70), null, 1));
