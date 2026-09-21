/**
 * Vocabulario de roles del cuerpo técnico, con los literales MEDIDOS en las 18 colas.
 *
 * Los números entre paréntesis son las filas reales que trae cada literal en las colas de origen
 * (medido el 14/9/2026). No son ejemplos inventados: son los que aparecen.
 *
 * Antes de esta corrección, `2ºEntrenador` (76.509 filas) se normalizaba a `entrenador` —la regla de
 * «entrenador» se evaluaba antes— y `DEL. Equipo` (282.265), `A.T.S.` (7.781) o `DELEGAT EQUIP`
 * (14.714) pasaban tal cual, partiendo en dos identidades a la misma persona según cómo hubiera
 * escrito el rol la fuente.
 */
import { describe, expect, it } from 'vitest';
import { ROLES_CANONICOS, normalizaLiteralRol, resuelveRolTecnico, rolTecnicoNormalizado } from '../src/resolucion/roles.js';

describe('normalización del literal', () => {
  it('quita tildes, signos y mayúsculas sin cambiar las palabras', () => {
    expect(normalizaLiteralRol('2ºEntrenador')).toBe('2 entrenador');
    expect(normalizaLiteralRol('A.T.S.')).toBe('a t s');
    expect(normalizaLiteralRol('PREPARADOR  FÍSICO / PRESTATZAILE FISIKOA')).toBe('preparador fisico prestatzaile fisikoa');
    expect(normalizaLiteralRol('ENCGDO. MATERIAL')).toBe('encgdo material');
  });
});

describe('rol del cuerpo técnico', () => {
  const casos: Array<[string, string, number]> = [
    ['Entrenador', 'entrenador', 303367],
    ['ENTRENADOR', 'entrenador', 12584],
    ['entrenador', 'entrenador', 28355],
    ['Entrenatzailea', 'entrenador', 20637],
    ['ENTRENADOR TITULAR', 'entrenador', 302],
    ['2ºEntrenador', 'segundo entrenador', 76509],
    ['2º', 'segundo entrenador', 4329],
    ['segundo-entrenador', 'segundo entrenador', 6982],
    ['2ºEntrenatzailea', 'segundo entrenador', 3574],
    ['DEL. Equipo', 'delegado', 282265],
    ['delegado', 'delegado', 15103],
    ['DELEGAT EQUIP', 'delegado', 14714],
    ['Taldeko Delegatua', 'delegado', 14114],
    ['DEL. Campo', 'delegado de campo', 126921],
    ['delegado-campo', 'delegado de campo', 14472],
    ['DELEGAT CAMP', 'delegado de campo', 6899],
    ['Zelaiko Delegatua', 'delegado de campo', 10209],
    ['A.T.S.', 'fisioterapeuta', 7781],
    ['ATS o FTP', 'fisioterapeuta', 6093],
    ['FISIOTERAPEUTA', 'fisioterapeuta', 732],
    ['ATS / S.U.T.', 'fisioterapeuta', 1485],
    ['PREPARADOR FISICO', 'preparador fisico', 6189],
    ['Preparador Físic', 'preparador fisico', 850],
    ['preparador-fisico', 'preparador fisico', 3702],
    ['Especialista de Porteros', 'entrenador de porteros', 1803],
    ['ENTRENADOR PORTEROS', 'entrenador de porteros', 333],
    ['ENTRENADOR PORTERS', 'entrenador de porteros', 109],
    ['ESPECIALISTA DE PORTEROS / ATEZAINEN ENTRENATZAILEA', 'entrenador de porteros', 914],
    ['ENTRENADOR AUXILIAR', 'entrenador auxiliar', 670],
    ['entrenador-auxiliar', 'entrenador auxiliar', 1455],
    ['ENTRENADOR EN PRACTICAS', 'entrenador en practicas', 468],
    ['Entrenador Prácticas', 'entrenador en practicas', 380],
    ['ENCARGADO MATERIAL', 'encargado de material', 3106],
    ['ENC. MATERIAL', 'encargado de material', 5842],
    ['ENCARREGAT MATERIAL', 'encargado de material', 3744],
    ['ENCGDO. MATERIAL', 'encargado de material', 3003],
    ['ENCARGADO MATERIAL / MATERIAL ARDURADUNA', 'encargado de material', 1345],
    ['MONITOR', 'monitor', 324],
    ['AUXILIAR', 'auxiliar', 2190],
    ['AU', 'auxiliar', 7337],
    ['AUXILIAR / LAGUNTZAILEA', 'auxiliar', 267],
    ['COORDINADOR/A', 'coordinador', 57],
    ['ayudante-sanitario', 'ayudante sanitario', 2786],
    ['AYUDANTE TECNICO SANITARIO', 'ayudante sanitario', 1438],
    ['Médico', 'medico', 183],
    ['MÉDICO / MEDIKUA', 'medico', 21],
    ['METGE', 'medico', 14],
    ['Graduado en Enfermería', 'enfermero', 2],
    ['OFICIAL DIRECTIVO', 'oficial directivo', 3],
  ];

  for (const [literal, esperado, filas] of casos) {
    it(`«${literal}» (${filas.toLocaleString('es-ES')} filas) → ${esperado}`, () => {
      const { rol, reconocido } = resuelveRolTecnico(literal);
      expect(reconocido).toBe(true);
      expect(rol).toBe(esperado);
      expect(ROLES_CANONICOS).toContain(rol);
    });
  }

  it('el literal nunca se descarta: se conserva aparte del rol normalizado', () => {
    // `core.match_staff.rol` guarda el literal; aquí sólo se comprueba que la normalización no lo
    // convierte en una categoría inventada.
    expect(rolTecnicoNormalizado('DEL. Equipo')).toBe('delegado');
    expect(rolTecnicoNormalizado('Entrenador')).not.toBe('DEL. Equipo');
  });

  it('un literal que no encaja se deja pasar normalizado y marcado como no reconocido', () => {
    for (const raro of ['epr', 'M', 'NO', 'ALTRES']) {
      const { rol, reconocido } = resuelveRolTecnico(raro);
      expect(reconocido, `${raro} no debería darse por bueno`).toBe(false);
      expect(rol).toBe(normalizaLiteralRol(raro));
      expect(ROLES_CANONICOS).not.toContain(rol);
    }
  });

  it('un rol vacío no inventa nada', () => {
    expect(resuelveRolTecnico('')).toEqual({ rol: '', reconocido: false });
    expect(resuelveRolTecnico('   ')).toEqual({ rol: '', reconocido: false });
  });

  it('«entrenador de porteros» no cae en «entrenador» y «ayudante sanitario» no cae en «fisioterapeuta»', () => {
    // Son los dos errores de orden que tenía la regla anterior.
    expect(rolTecnicoNormalizado('ENTRENADOR PORTEROS')).toBe('entrenador de porteros');
    expect(rolTecnicoNormalizado('AYUDANTE SANITARIO')).toBe('ayudante sanitario');
    expect(rolTecnicoNormalizado('2ºEntrenador')).toBe('segundo entrenador');
  });
});
