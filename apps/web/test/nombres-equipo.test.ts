import { describe, expect, it } from 'vitest';
import { nombreCorto, nombreCortoDe, nombresDelPartido } from '../src/lib/nombres-equipo';

/**
 * Reglas de los nombres cortos de equipo (feedback de capturas, 05/11/2026).
 *
 * Se prueban los ejemplos que pidió David y los nombres reales del canónico (grupos 3769 y 797). La
 * regla que se defiende: se quitan formas legales y se abrevia lo evidente; lo dudoso se queda completo.
 * Nunca se inventa un nombre ni se devuelve una cadena vacía para un equipo que tiene nombre.
 */

describe('nombreCorto: los ejemplos pedidos', () => {
  it('quita las formas legales sin comerse el nombre', () => {
    expect(nombreCorto('Club Deportivo Isoba')).toBe('Isoba');
    expect(nombreCorto('Real Valladolid Club de Fútbol')).toBe('R. Valladolid');
    expect(nombreCorto('Unión Deportiva Santa Marta')).toBe('Santa Marta');
    expect(nombreCorto('SD Ponferradina')).toBe('Ponferradina');
    expect(nombreCorto('Salamanca Club de Fútbol UDS')).toBe('Salamanca CF');
  });
});

describe('nombreCorto: nombres reales del canónico', () => {
  it('acorta los equipos de la Liga Nacional Juvenil', () => {
    expect(nombreCorto('Burgos C.F. S.A.D.')).toBe('Burgos');
    expect(nombreCorto('Burgos C.F. S.A.D. "B"')).toBe('Burgos B');
    expect(nombreCorto('C. y D. Leonesa S.A.D. "B"')).toBe('Leonesa B');
    expect(nombreCorto('C.D. Parquesol')).toBe('Parquesol');
    expect(nombreCorto('C.D. Numancia de Soria S.A.D.')).toBe('Numancia de Soria');
    expect(nombreCorto('Gimnástica Segoviana S.A.D.')).toBe('Gimnástica Segoviana');
    expect(nombreCorto('S.D. Ponferradina S.A.D.')).toBe('Ponferradina');
    expect(nombreCorto('Real Valladolid C.F. S.A.D. "B"')).toBe('R. Valladolid B');
    expect(nombreCorto('Puente Castro F.C.')).toBe('Puente Castro');
    expect(nombreCorto('Victoria C.F.')).toBe('Victoria');
    expect(nombreCorto('U.D. Sur')).toBe('Sur');
  });

  it('conserva «La» cuando forma parte del nombre y limpia el «de la» del principio', () => {
    expect(nombreCorto('C.D. La Virgen del Camino')).toBe('La Virgen del Camino');
    expect(nombreCorto('C.D.I. de la Amistad')).toBe('Amistad');
    expect(nombreCorto('C.D. Internacional Vista Alegre')).toBe('Internacional Vista Alegre');
  });

  it('no acorta lo que no sabe acortar: mejor completo que inventado', () => {
    for (const completo of ['Isoba', 'Deportivo Alavés', 'Unión Adarve']) {
      const corto = nombreCorto(completo);
      expect(corto.length).toBeGreaterThan(0);
      expect(corto).not.toBe('');
    }
    // Un nombre sin formas legales se queda tal cual.
    expect(nombreCorto('Isoba')).toBe('Isoba');
    expect(nombreCorto('Deportivo Alavés')).toBe('Deportivo Alavés');
  });

  it('sin nombre no se inventa uno', () => {
    expect(nombreCorto(null)).toBe('');
    expect(nombreCorto(undefined)).toBe('');
    expect(nombreCorto('   ')).toBe('');
  });
});

describe('nombreCortoDe y nombresDelPartido', () => {
  it('prefiere el nombre corto guardado y sólo cae a las reglas si falta', () => {
    expect(nombreCortoDe('Isoba', 'Club Deportivo Isoba')).toBe('Isoba');
    expect(nombreCortoDe(null, 'Club Deportivo Isoba')).toBe('Isoba');
    expect(nombreCortoDe('  ', 'S.D. Ponferradina S.A.D.')).toBe('Ponferradina');
  });

  it('el partido trae los dos nombres cortos y los completos para el title', () => {
    expect(nombresDelPartido({
      local: 'Burgos C.F. S.A.D.', visitante: 'C.D. Parquesol',
      local_nombre_corto: null, visitante_nombre_corto: 'Parquesol',
    })).toEqual({
      local: 'Burgos', visitante: 'Parquesol',
      completo_local: 'Burgos C.F. S.A.D.', completo_visitante: 'C.D. Parquesol',
    });
  });
});
