/**
 * Reconciliación entre la pareja de equipos del CALENDARIO y la del ACTA.
 *
 * Los casos no son inventados: son las SIETE jornadas del grupo 11379752 (Tercera Federación, 1ª Fase
 * Gr. VIII, Castilla y León 2024-25) cuyo calendario quedó mal en la cola, con los nombres y los
 * códigos reales de la fuente.
 *
 * Jornada 8, `orden` 0, acta 26061132:
 *   · la cola dice   «C.D. Almazán vs Burgos C.F. Promesas»
 *   · el acta dice   «Burgos C.F. Promesas vs C.D. Villaralbo» (2-1, 23-10-2024)
 *   · y Almazán —el equipo que descansaba esa jornada— no aparece en el acta en absoluto.
 *
 * Con la lógica anterior (los equipos del partido son SIEMPRE los del calendario) la primera prueba
 * falla: devolvía los códigos del calendario y no reparaba nada. Con la regla nueva se repara y, sobre
 * todo, la contradicción queda clasificada en vez de resuelta en silencio.
 */
import { describe, expect, it } from 'vitest';
import {
  equiposDeclaradosPorActa, reconciliaEquiposDelPartido, type EntradaReconciliacion,
} from '../src/resolucion/equipos-acta.js';

/** Normalizador de mentira: minúsculas y espacios, suficiente para fijar el comportamiento. */
const normaliza = (texto: string): string => texto.trim().toLowerCase().replace(/\s+/g, ' ');

/** Códigos externos reales del grupo 11379752. */
const CODIGOS = new Map<string, string>([
  ['c.d. almazán', '6157'],
  ['burgos c.f. promesas', '10105865'],
  ['c.d. villaralbo', '4984'],
  ['c.d. la virgen del camino', '4203'],
  ['c.d. laguna', '10293'],
  ['ciudad rodrigo c.f.', '12160'],
  ['c.d. becerril', '7796'],
  ['c.f. briviesca norpetrol', '8260'],
  ['c.d. mirandés s.a.d. "b"', '9343'],
  ['atlético tordesillas', '13001'],
  ['atlético bembibre', '4656'],
  ['júpiter leonés', '13122'],
  ['palencia c.f. s.a.d.', '13180'],
  ['c.d. palencia cristo atlético', '5583'],
  ['u.d. santa marta de tormes', '12184'],
]);

const base: Omit<EntradaReconciliacion, 'calendario' | 'acta'> = {
  clavePorNombre: CODIGOS,
  normaliza,
  localFantasmaJuegaOtroPartido: false,
};

describe('equiposDeclaradosPorActa', () => {
  it('lee la pareja que declara la cabecera del acta', () => {
    expect(equiposDeclaradosPorActa(JSON.stringify({ local: 'Burgos C.F. Promesas', visitante: 'C.D. Villaralbo' })))
      .toEqual({ local: 'Burgos C.F. Promesas', visitante: 'C.D. Villaralbo' });
  });

  it('no lanza con un `datos` ilegible, vacío o incompleto: se queda sin cabecera', () => {
    expect(equiposDeclaradosPorActa(null)).toBeNull();
    expect(equiposDeclaradosPorActa('')).toBeNull();
    expect(equiposDeclaradosPorActa('{no es json')).toBeNull();
    expect(equiposDeclaradosPorActa('[1,2,3]')).toBeNull();
    expect(equiposDeclaradosPorActa(JSON.stringify({ local: 'Solo uno' }))).toBeNull();
    expect(equiposDeclaradosPorActa(JSON.stringify({ local: '  ', visitante: 'X' }))).toBeNull();
  });
});

describe('reconciliación del partido con su acta', () => {
  it('repara la fuga de la fila «Descansa» y la clasifica (jornada 8 del grupo 11379752)', () => {
    const decision = reconciliaEquiposDelPartido({
      ...base,
      calendario: {
        localClave: '6157', visitanteClave: '10105865',
        local: 'C.D. Almazán', visitante: 'Burgos C.F. Promesas',
      },
      acta: { local: 'Burgos C.F. Promesas', visitante: 'C.D. Villaralbo' },
    });
    // Con la lógica anterior esto era «6157 / 10105865»: el equipo que descansaba como local.
    expect(decision.local).toBe('10105865');
    expect(decision.visitante).toBe('4984');
    expect(decision.reparado).toBe(true);
    expect(decision.discrepancia?.forma).toBe('fuga');
    expect(decision.discrepancia?.calendario).toEqual({ local: 'C.D. Almazán', visitante: 'Burgos C.F. Promesas' });
    expect(decision.discrepancia?.acta).toEqual({ local: 'Burgos C.F. Promesas', visitante: 'C.D. Villaralbo' });
  });

  it('las siete jornadas del grupo tienen la misma forma: fantasma al local, local verdadero al visitante', () => {
    // [jornada, local del calendario, visitante del calendario, local del acta, visitante del acta]
    const casos: Array<[number, string, string, string, string]> = [
      [9, 'C.F. Briviesca Norpetrol', 'U.D. Santa Marta de Tormes', 'U.D. Santa Marta de Tormes', 'Burgos C.F. Promesas'],
      [23, 'Atlético Bembibre', 'C.F. Briviesca Norpetrol', 'C.F. Briviesca Norpetrol', 'Júpiter Leonés'],
      [33, 'C.D. Mirandés S.A.D. "B"', 'Atlético Tordesillas', 'Atlético Tordesillas', 'C.D. La Virgen del Camino'],
      [34, 'C.D. Becerril', 'C.D. Laguna', 'C.D. Laguna', 'Ciudad Rodrigo C.F.'],
      [36, 'Palencia C.F. S.A.D.', 'C.D. Laguna', 'C.D. Laguna', 'C.D. Mirandés S.A.D. "B"'],
      [37, 'Júpiter Leonés', 'C.D. Palencia Cristo Atlético', 'C.D. Palencia Cristo Atlético', 'C.D. Laguna'],
    ];
    for (const [jornada, localCal, visitCal, localActa, visitActa] of casos) {
      const codigoFantasma = 'FANTASMA';
      const codigoLocalCalendario = 'LOCAL-DEL-CALENDARIO';
      const decision = reconciliaEquiposDelPartido({
        ...base,
        // Marcadores para los dos códigos del calendario: lo que se prueba es la forma de la fuga y que
        // los lados acaban siendo los que nombra el acta, resueltos por SU nombre dentro del grupo.
        calendario: { localClave: codigoFantasma, visitanteClave: codigoLocalCalendario, local: localCal, visitante: visitCal },
        acta: { local: localActa, visitante: visitActa },
      });
      const etiqueta = `J${jornada}`;
      expect(normaliza(decision.discrepancia?.calendario.local ?? ''), etiqueta).toBe(normaliza(localCal));
      expect(decision.discrepancia?.forma, etiqueta).toBe('fuga');
      expect(decision.reparado, etiqueta).toBe(true);
      // El fantasma desaparece: los dos lados son los del acta.
      expect(decision.local, etiqueta).toBe(CODIGOS.get(normaliza(localActa)));
      expect(decision.visitante, etiqueta).toBe(CODIGOS.get(normaliza(visitActa)));
      expect(decision.local, etiqueta).not.toBe(codigoFantasma);
      expect(decision.local, etiqueta).not.toBe(codigoLocalCalendario);
    }
  });

  it('NO repara si el equipo que el calendario pone como local juega otro partido de esa jornada', () => {
    // Sin esta comprobación, una contradicción entre dos filas legítimas se «arreglaría» inventando.
    const decision = reconciliaEquiposDelPartido({
      ...base,
      localFantasmaJuegaOtroPartido: true,
      calendario: {
        localClave: '6157', visitanteClave: '10105865',
        local: 'C.D. Almazán', visitante: 'Burgos C.F. Promesas',
      },
      acta: { local: 'Burgos C.F. Promesas', visitante: 'C.D. Villaralbo' },
    });
    expect(decision.reparado).toBe(false);
    expect(decision.local).toBe('6157');
    expect(decision.visitante).toBe('10105865');
    expect(decision.discrepancia?.forma).toBe('otro');
  });

  it('repara el campo invertido', () => {
    const decision = reconciliaEquiposDelPartido({
      ...base,
      calendario: {
        localClave: '4984', visitanteClave: '10105865',
        local: 'C.D. Villaralbo', visitante: 'Burgos C.F. Promesas',
      },
      acta: { local: 'Burgos C.F. Promesas', visitante: 'C.D. Villaralbo' },
    });
    expect(decision.discrepancia?.forma).toBe('invertido');
    expect(decision.reparado).toBe(true);
    expect(decision.local).toBe('10105865');
    expect(decision.visitante).toBe('4984');
  });

  it('no toca nada cuando el calendario y el acta dicen lo mismo', () => {
    const decision = reconciliaEquiposDelPartido({
      ...base,
      calendario: {
        localClave: '10105865', visitanteClave: '4984',
        local: 'Burgos C.F. Promesas', visitante: 'C.D. Villaralbo',
      },
      acta: { local: 'Burgos C.F. Promesas', visitante: 'C.D. Villaralbo' },
    });
    expect(decision.discrepancia).toBeNull();
    expect(decision.reparado).toBe(false);
    expect(decision.actaSinResolver).toBe(false);
    expect(decision.local).toBe('10105865');
  });

  it('sin cabecera de acta no hay nada que reconciliar y el partido se queda como estaba', () => {
    const decision = reconciliaEquiposDelPartido({
      ...base,
      calendario: { localClave: 'A', visitanteClave: 'B', local: 'Equipo A', visitante: 'Equipo B' },
      acta: null,
    });
    expect(decision).toEqual({ local: 'A', visitante: 'B', discrepancia: null, actaSinResolver: false, reparado: false });
  });

  it('si el acta nombra equipos que el grupo no resuelve, se mide pero no se corrige', () => {
    // Un nombre que resuelve a dos equipos distintos del grupo queda FUERA del mapa: elegir uno sería
    // inventar y contaminaría dos plantillas. Se comporta igual que un nombre desconocido.
    const decision = reconciliaEquiposDelPartido({
      ...base,
      calendario: {
        localClave: '6157', visitanteClave: '10105865',
        local: 'C.D. Almazán', visitante: 'Burgos C.F. Promesas',
      },
      acta: { local: 'Burgos C.F. Promesas', visitante: 'Un Equipo De Otro Grupo' },
    });
    expect(decision.actaSinResolver).toBe(true);
    expect(decision.reparado).toBe(false);
    expect(decision.discrepancia).toBeNull();
    expect(decision.local).toBe('6157');
    expect(decision.visitante).toBe('10105865');
  });

  it('no confunde el «otro» con una fuga cuando no comparten ningún equipo', () => {
    const decision = reconciliaEquiposDelPartido({
      ...base,
      calendario: {
        localClave: '5583', visitanteClave: '10293',
        local: 'C.D. Palencia Cristo Atlético', visitante: 'C.D. Laguna',
      },
      acta: { local: 'Burgos C.F. Promesas', visitante: 'C.D. Villaralbo' },
    });
    expect(decision.discrepancia?.forma).toBe('otro');
    expect(decision.reparado).toBe(false);
    // Nada se toca: quien llama tiene que detener el lote.
    expect(decision.local).toBe('5583');
    expect(decision.visitante).toBe('10293');
  });

  it('acepta que un lado no resuelva del calendario sin romper la decisión', () => {
    const decision = reconciliaEquiposDelPartido({
      ...base,
      calendario: { localClave: null, visitanteClave: '10105865', local: 'C.D. Almazán', visitante: 'Burgos C.F. Promesas' },
      acta: { local: 'Burgos C.F. Promesas', visitante: 'C.D. Villaralbo' },
    });
    expect(decision.local).toBe('10105865');
    expect(decision.visitante).toBe('4984');
  });
});

describe('letra repetida en el nombre del acta (17/11/2026)', () => {
  /*
   * Caso real del grupo 24219059, jornada 3, acta 26178041 (2026-27): el calendario dice
   * `C.D. Colegios Diocesanos "E"` y el acta `CC.D. Colegios Diocesanos E`. El marcador del acta (1-3)
   * coincide con el del calendario, así que es el mismo partido con una errata.
   */
  const conEquipos = { ...base, clavePorNombre: new Map([...CODIGOS, ['real ávila e', 'AVILA'], ['c.d. colegios diocesanos e', 'COLE']]) };

  it('una letra repetida en un lado no convierte el acta en «otro partido»', () => {
    const decision = reconciliaEquiposDelPartido({
      ...conEquipos,
      calendario: { localClave: 'AVILA', visitanteClave: 'COLE', local: 'Real Ávila E', visitante: 'C.D. Colegios Diocesanos E' },
      acta: { local: 'Real Ávila E', visitante: 'CC.D. Colegios Diocesanos E' },
    });
    expect(decision.discrepancia?.forma).toBe('escritura');
    expect(decision.local).toBe('AVILA');
    expect(decision.visitante).toBe('COLE');
  });

  it('dos equipos DISTINTOS que sólo se parecen siguen siendo «otro»', () => {
    const decision = reconciliaEquiposDelPartido({
      ...base,
      calendario: { localClave: 'A', visitanteClave: 'B', local: 'Sella', visitante: 'C.D. Uno' },
      acta: { local: 'Sela', visitante: 'C.D. Uno' },
    });
    // Un lado coincide exacto (C.D. Uno), pero «Sella» y «Sela» no son una abreviatura con letra repetida
    // («ll» no va seguido de punto), así que no se tolera: el acta no resuelve y no se elige nada.
    expect(decision.actaSinResolver).toBe(true);
    expect(decision.reparado).toBe(false);
  });
});
