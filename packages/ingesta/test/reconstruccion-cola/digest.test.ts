/**
 * La huella semántica: qué cambio invalida un manifiesto y qué no.
 *
 * Lo que se demuestra aquí es la propiedad que hace útil el mecanismo: **un comentario no cambia la
 * huella y cualquier cosa que decida algo sí**. Un quitador de comentarios hecho a mano fallaría en los
 * casos adversarios de abajo —un `//` dentro de una cadena, un `/*` dentro de una expresión regular, una
 * plantilla multilínea— y el fallo sería del lado peligroso: un cambio real contado como comentario, o
 * sea una huella que NO cambia cuando debe.
 */
import { describe, expect, it } from 'vitest';
import { huella, huellaSemantica } from '../../src/reconstruccion-cola/digest.js';

const d = (texto: string, nombre = 'a.ts') => huellaSemantica(texto, nombre);

describe('huellaSemantica · lo que NO debe invalidar', () => {
  it('ignora un comentario de línea y uno de bloque', () => {
    const base = 'export const a = 1;';
    expect(d('// nota\nexport const a = 1;')).toBe(d(base));
    expect(d('/* nota\n   larga */\nexport const a = 1;')).toBe(d(base));
  });

  it('ignora el JSDoc, que sí vive dentro del árbol sintáctico', () => {
    const conDoc = '/**\n * Explica algo.\n * @param x nada\n */\nexport function f(x: number) { return x; }';
    const sinDoc = 'export function f(x: number) { return x; }';
    expect(d(conDoc)).toBe(d(sinDoc));
  });

  it('ignora espacios, sangría y saltos de línea, pero NO el punto y coma escrito', () => {
    expect(d('const a = 1;')).toBe(d('const   a\n  =\n  1;'));
    // El `;` es un token, no trivia: escribirlo o no es una decisión del código, y por eso sí cuenta.
    expect(d('const a = 1;')).not.toBe(d('const a = 1'));
  });

  it('un cambio de comentario en un fichero REAL no cambia la huella de sus líneas de código', () => {
    const fuente = 'export function f(a: number): number {\n  // este comentario es irrelevante\n  return a + 1;\n}';
    const reformateado = 'export function f( a: number ) : number {\n  /* otro comentario distinto */\n  return a + 1;\n}';
    expect(d(fuente)).toBe(d(reformateado));
  });
});

describe('huellaSemantica · lo que SÍ debe invalidar', () => {
  it('un número, un operador o un nombre distinto', () => {
    expect(d('const a = 1;')).not.toBe(d('const a = 2;'));
    expect(d('const a = b + c;')).not.toBe(d('const a = b - c;'));
    expect(d('function f() {}')).not.toBe(d('function g() {}'));
  });

  it('un cambio DENTRO de una cadena', () => {
    expect(d('const a = "uno";')).not.toBe(d('const a = "dos";'));
  });

  it('un cambio DENTRO de una expresión regular, aunque contenga // o /*', () => {
    expect(d('const r = /ab\\/\\/c/g;')).not.toBe(d('const r = /ab\\/c/g;'));
    expect(d('const r = /a{2}/;')).not.toBe(d('const r = /a{3}/;'));
    expect(d('const r = /x/*y*/ /;')).not.toBe(d('const r = /x/*z*/ /;'));
  });

  it('un cambio DENTRO de una plantilla, con y sin sustitución', () => {
    expect(d('const t = `uno`;')).not.toBe(d('const t = `dos`;'));
    expect(d('const t = `a ${b} c`;')).not.toBe(d('const t = `a ${b} d`;'));
    // Un texto dentro de una plantilla que PARECE un comentario es contenido, no un comentario.
    expect(d('const t = `// no es un comentario`;')).not.toBe(d('const t = `// tampoco`;'));
  });

  it('un cambio dentro de una plantilla multilínea, que en el scanner desnudo se perdía', () => {
    // Este es el caso que hizo descartar el escáner de TypeScript a pelo: al entrar en una plantilla sin
    // volver a pedir el token, todo el resto del fichero se leía como texto de plantilla.
    const antes = 'const a = 1;\nconst s = `\nlinea uno\nlinea dos\n`;\nconst z = 9;';
    const despues = antes.replace('linea dos', 'linea tres');
    expect(d(antes)).not.toBe(d(despues));
    // Y un cambio de formato FUERA de la plantilla sigue sin cambiar nada.
    expect(d(antes)).toBe(d(antes.replace('const z = 9;', 'const   z\n  = 9;')));
  });

  it('un fichero real de este repositorio: cambiar un literal cambia su huella', () => {
    const fuente = 'export const M = ["(sailkatua)", "(irabazlea)"] as const;';
    const cambiado = 'export const M = ["(sailkatua)", "(ganador)"] as const;';
    expect(d(fuente)).not.toBe(d(cambiado));
  });
});

describe('huella (la de bytes)', () => {
  it('es estable y sensible a cualquier diferencia, incluidos los comentarios', () => {
    expect(huella('a')).toBe(huella('a'));
    expect(huella('a')).not.toBe(huella('// a'));
    expect(huella('a')).toHaveLength(16);
  });
});
