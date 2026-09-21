/**
 * Las muestras de oro, comprobadas en cada `pnpm test` (sin reimportar nada).
 *
 * Reimportar un grupo de verdad tarda minutos y compite con los recolectores, así que eso se hace a
 * mano (`node scripts/oro.mjs verificar`). Lo que sí se comprueba siempre es que las muestras están
 * completas y que sus números son coherentes entre sí: una muestra rota da una falsa sensación de
 * seguridad peor que no tenerla.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CARPETA = join(import.meta.dirname, '..', '..', '..', 'pruebas', 'oro');

function muestras(): Array<{ federacion: string; ruta: string; datos: Record<string, unknown> }> {
  if (!existsSync(CARPETA)) return [];
  return readdirSync(CARPETA, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(join(CARPETA, d.name))
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({
        federacion: d.name,
        ruta: join(CARPETA, d.name, f),
        datos: JSON.parse(readFileSync(join(CARPETA, d.name, f), 'utf8')) as Record<string, unknown>,
      })));
}

describe('muestras de oro', () => {
  it('hay muestras y cubren los tipos de problema que manda la skill', () => {
    const lista = muestras();
    expect(lista.length).toBeGreaterThanOrEqual(5);
    const federaciones = new Set(lista.map((m) => m.federacion));
    // Caso rico (CyL), federación pequeña (Canarias), federación sin códigos (Cataluña), grupo a medias
    // (CyL 2026-27). La skill pide tipos de problema, no federaciones bonitas.
    expect(federaciones.has('castilla-leon')).toBe(true);
    expect(federaciones.has('canarias')).toBe(true);
    expect(federaciones.has('cataluna')).toBe(true);
    const aMedias = lista.filter((m) => Number((m.datos.recuentos as Record<string, number>).partidos) > 0
      && String(m.datos.temporadaCodigo) === '22');
    expect(aMedias.length, 'falta el caso de grupo a medias').toBeGreaterThan(0);
  });

  it('cada muestra dice su federación, su grupo, su temporada y de cuándo es', () => {
    for (const { federacion, ruta, datos } of muestras()) {
      const recuentos = datos.recuentos as Record<string, number>;
      expect(datos.federacion, ruta).toBe(federacion);
      expect(String(datos.grupo ?? '').length, ruta).toBeGreaterThan(0);
      expect(String(datos.temporadaCodigo ?? '').length, ruta).toBeGreaterThan(0);
      expect(String(datos.nota ?? '').length, `${ruta}: sin nota que explique qué caso cubre`).toBeGreaterThan(10);
      expect(datos.congelada_en, `${ruta}: sin fecha de congelación`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const clave of ['jornadas', 'partidos', 'partidosConResultado', 'actas', 'actasHechas',
        'participaciones', 'eventos', 'tecnicos']) {
        expect(typeof recuentos[clave], `${ruta}: falta ${clave}`).toBe('number');
      }
    }
  });

  it('los números de cada muestra son coherentes entre sí', () => {
    for (const { ruta, datos } of muestras()) {
      const r = datos.recuentos as Record<string, number>;
      const partidos = r.partidos ?? 0;
      const conResultado = r.partidosConResultado ?? 0;
      const actas = r.actas ?? 0;
      const actasHechas = r.actasHechas ?? 0;
      const participaciones = r.participaciones ?? 0;
      // Un grupo no puede tener más partidos con resultado que partidos, ni más actas hechas que actas,
      // ni actas sin partidos que las referencien.
      expect(conResultado, `${ruta}: más resultados que partidos`).toBeLessThanOrEqual(partidos);
      expect(actasHechas, `${ruta}: más actas hechas que actas`).toBeLessThanOrEqual(actas);
      expect(actas, `${ruta}: más actas que partidos`).toBeLessThanOrEqual(partidos);
      expect(partidos, `${ruta}: sin partidos`).toBeGreaterThan(0);
      if (actasHechas > 0) {
        // Cada acta analizada trae alineaciones: sin participaciones, algo se ha perdido.
        expect(participaciones, `${ruta}: actas analizadas y ninguna participación`).toBeGreaterThan(0);
      }
    }
  });
});
