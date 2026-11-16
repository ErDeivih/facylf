import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';

test('lee los equipos sin enlace de una jornada y omite el descanso', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'facylf-cal-'));
  try {
    const grupo = join(raiz, 't22-2026-27', 'comp-100', 'grupo-200');
    mkdirSync(grupo, { recursive: true });
    writeFileSync(join(grupo, 'calendario.html.gz'), gzipSync(`
      <table>
        <thead><tr><th>Jornada 11 <span id="fecha_jornada_org_11">(22-11-2026)</span></th></tr></thead>
        <tbody>
          <tr><td>UD Norte &amp; Este</td><td class="anchogoles"><script>throw new Error()</script>-</td><td>CD Sur</td></tr>
          <tr><td>Descansa</td><td class="anchogoles">-</td><td>CD Oeste</td></tr>
        </tbody>
      </table>`));
    const script = fileURLToPath(new URL('./calendario-archivado.mjs', import.meta.url));
    const [archivo] = JSON.parse(execFileSync(process.execPath, [script, raiz, '2026-27'], { encoding: 'utf8' }));
    assert.equal(archivo.competicion, '100');
    assert.equal(archivo.grupo, '200');
    assert.deepEqual(archivo.cruces, [{ jornada: 11, orden: 1, fecha: '2026-11-22',
      local: { codigo: null, nombre: 'UD Norte & Este' }, visitante: { codigo: null, nombre: 'CD Sur' } }]);
  } finally {
    assert.equal(dirname(resolve(raiz)), resolve(tmpdir()));
    rmSync(raiz, { recursive: true, force: true });
  }
});
