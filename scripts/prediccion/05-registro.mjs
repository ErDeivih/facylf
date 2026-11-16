#!/usr/bin/env node
/** Vincula y puntúa las emisiones ya congeladas cuando llegan nuevos resultados. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./publica.py', import.meta.url));
const proceso = spawnSync('python', ['-B', script, '--solo-registro', ...process.argv.slice(2)], { stdio: 'inherit' });
if (proceso.error) console.error(proceso.error.message);
process.exitCode = proceso.status ?? 1;
