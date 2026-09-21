#!/usr/bin/env node
/** Comprueba la ruta exacta que usará la web para la clasificación de un grupo de Cataluña. */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const db = new DatabaseSync(join(RAIZ, 'descargas-cataluna', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const t = db.prepare('select codigo, etiqueta from temporadas').all();
console.log('temporadas:', JSON.stringify(t));
const g = db.prepare(`select g.temporada, t.etiqueta, g.competicion, g.codigo from grupos g
  join temporadas t on t.codigo=g.temporada where g.temporada='21' and g.competicion='54322949'`).get();
console.log('grupo:', JSON.stringify(g));
const carpeta = join(RAIZ, 'descargas-cataluna', `t${g.temporada}-${g.etiqueta}`, `comp-${g.competicion}`, `grupo-${g.codigo}`);
const fichero = join(carpeta, 'clasificacion.json');
console.log('ruta calculada:', fichero);
console.log('¿existe?', existsSync(fichero), existsSync(fichero) ? statSync(fichero).size + ' B' : '');
db.close();
