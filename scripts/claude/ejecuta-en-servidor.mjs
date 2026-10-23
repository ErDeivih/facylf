#!/usr/bin/env node
/**
 * Ejecuta un .sh del repositorio EN EL SERVIDOR sin pelearse con las comillas de PowerShell: se manda por la
 * entrada estándar de ssh (sin CR) y la salida vuelve tal cual, en UTF-8.
 *   node scripts/claude/ejecuta-en-servidor.mjs scripts/servidor/actualiza-importador.sh
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const ruta = process.argv[2];
if (!ruta) { console.error('Uso: node scripts/claude/ejecuta-en-servidor.mjs <guion.sh> [alias]'); process.exit(2); }
const alias = process.argv[3] || process.env.FACYLF_SSH_ALIAS || 'servidor';
const destino = `/tmp/claude-${basename(ruta).replace(/[^\w.-]/g, '_')}`;
const hijo = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', alias, `cat > ${destino} && bash ${destino}; rm -f ${destino}`],
  { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
hijo.stdin.end(readFileSync(ruta, 'utf8').replace(/\r/g, ''));
hijo.on('close', (c) => process.exit(c ?? 1));
