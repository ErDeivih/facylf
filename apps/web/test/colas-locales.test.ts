import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rutasDeColasLocales } from '../../../scripts/lib/colas-locales.mjs';

/**
 * En este PC las carpetas `descargas-*` de la raíz son **junctions** a `E:`. `readdirSync` con
 * `withFileTypes` las marca como enlace y `entrada.isDirectory()` devuelve `false`, así que un escaneo
 * ingenuo las descarta todas y el ritmo del PC sale 0 aunque esté pidiendo. Se comprueba con una
 * junction de verdad (Windows), no con una suposición.
 */
const esWindows = process.platform === 'win32';

function preparaCola(raiz: string, nombre: string, conCola = true) {
  const carpeta = join(raiz, nombre);
  mkdirSync(join(carpeta, 'recolector-local'), { recursive: true });
  if (conCola) writeFileSync(join(carpeta, 'recolector-local', 'cola-v2.sqlite'), '');
  return carpeta;
}

describe('colas locales del PC', () => {
  it('encuentra las colas normales y las que son junctions (como en este PC)', () => {
    if (!esWindows) return;
    const raiz = mkdtempSync(join(tmpdir(), 'facylf-colas-'));
    const destino = mkdtempSync(join(tmpdir(), 'facylf-destino-'));
    try {
      preparaCola(raiz, 'descargas-real');
      preparaCola(raiz, 'descargas-algo-sondeo', true);
      preparaCola(raiz, 'descargas-prueba-10gb', true);
      preparaCola(destino, 'descargas-enlazada');
      symlinkSync(join(destino, 'descargas-enlazada'), join(raiz, 'descargas-junction'), 'junction');

      const rutas = rutasDeColasLocales(raiz).map((c) => c.federacion).sort();
      expect(rutas).toContain('real');
      expect(rutas).toContain('junction');
      expect(rutas).not.toContain('sondeo');
      expect(rutas).not.toContain('prueba-10gb');
    } finally {
      rmSync(raiz, { recursive: true, force: true });
      rmSync(destino, { recursive: true, force: true });
    }
  });

  it('no devuelve una carpeta descargas sin cola', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'facylf-colas-'));
    try {
      preparaCola(raiz, 'descargas-vacia', false);
      expect(rutasDeColasLocales(raiz)).toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});
