#!/usr/bin/env node
/**
 * Sube ficheros del repositorio del PC al MISMO sitio del repositorio del servidor (/srv/data/facylf/…),
 * por la entrada estándar de ssh (sin scp, sin comillas de PowerShell). Truncar en el sitio con `cat >`
 * conserva el inodo, así que los montajes de un solo fichero de los contenedores ven el cambio.
 *   node scripts/claude/sube-al-servidor.mjs scripts/importar-masivo.mjs [otro…]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const alias = process.env.FACYLF_SSH_ALIAS || 'servidor';
for (const f of process.argv.slice(2)) {
  const rel = f.replace(/\\/g, '/').replace(/^.*?facylf\//, '');
  if (!/^[\w./-]+$/.test(rel) || rel.includes('..')) { console.error(`ruta rara: ${f}`); process.exit(2); }
  const r = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', alias,
    `cat > /srv/data/facylf/${rel} && md5sum /srv/data/facylf/${rel}`], { input: readFileSync(f), encoding: 'utf8' });
  console.log(`${rel}: ${r.status === 0 ? r.stdout.trim().slice(0, 12) + ' (subido)' : 'ERROR ' + r.stderr}`);
}
