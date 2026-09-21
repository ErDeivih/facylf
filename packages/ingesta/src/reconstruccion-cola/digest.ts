/**
 * Huellas de la reconstrucción de cola.
 *
 * Hay DOS huellas y no se pueden confundir:
 *
 * - `huella(texto)` es un sha256 recortado, sin más. Se usa para el CONTENIDO de un archivo (el HTML
 *   archivado) y para valores que se comparan byte a byte.
 * - `huellaSemantica(texto, nombre)` es un sha256 del **árbol sintáctico** del fichero, no de sus
 *   bytes. Ignora comentarios, espacios, saltos de línea y formato; y **no** ignora nada más: cambiar
 *   un literal, un operador, un número o el nombre de una función da otra huella. Es lo que permite
 *   que un cambio de comentario no invalide un manifiesto y que cualquier cambio que sí decide algo
 *   lo invalide.
 *
 * Por qué el árbol y no un quitador de comentarios propio: un quitador hecho a mano tiene que
 * distinguir `//` dentro de una cadena, `/*` dentro de una expresión regular y `${…}` dentro de una
 * plantilla. Equivocarse ahí haría que un cambio real pasara por comentario —es decir, que la huella
 * NO cambiara cuando debe—, que es el único fallo inaceptable de este mecanismo. El árbol lo resuelve
 * el propio compilador.
 *
 * Casos medidos con `packages/ingesta/test/reconstruccion-cola/digest.test.ts`:
 *
 * | cambio | huella semántica |
 * |---|---|
 * | comentario de línea o de bloque, incluido JSDoc | **igual** |
 * | espacios, sangría, saltos de línea, `;` suelto | **igual** |
 * | un literal, un número, un operador, un nombre | distinta |
 * | texto dentro de una plantilla multilínea | distinta |
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** sha256 recortado a 16 hex. Es el formato de todas las huellas de esta herramienta. */
export function huella(texto: unknown): string {
  return createHash('sha256').update(String(texto)).digest('hex').slice(0, 16);
}

const esFicheroJS = (nombre: string) => /\.(mjs|cjs|js)$/i.test(nombre);
const esJSDoc = (nodo: ts.Node) => nodo.kind >= ts.SyntaxKind.FirstJSDocNode && nodo.kind <= ts.SyntaxKind.LastJSDocNode;

/**
 * Huella del ÁRBOL de un fichero: los comentarios viven fuera del árbol (y el JSDoc, que sí vive
 * dentro, se descarta explícitamente), así que no entran. El formato tampoco: los nodos hoja se
 * identifican por su `kind` y por su texto exacto, nunca por su posición.
 *
 * Si el fichero no se puede interpretar, se cae a la huella de los bytes y se dice: mejor invalidar de
 * más que dar por bueno un fichero que no se ha podido leer.
 */
export function huellaSemantica(texto: string, nombre = 'a.ts'): string {
  if (typeof texto !== 'string' || texto === '') return huella(texto);
  const arbol = ts.createSourceFile(
    nombre,
    texto,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    esFicheroJS(nombre) ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );
  // `parseDiagnostics` no está en la API pública de `SourceFile`, pero es la única señal de que el árbol
  // se ha podido construir de verdad. Si el fichero no se interpreta, se cae a la huella de sus BYTES:
  // invalidar de más es inocuo, dar por bueno un fichero que no se ha leído no lo es.
  const diagnosticos = (arbol as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics;
  if (diagnosticos && diagnosticos.length > 0) return huella(texto);

  const piezas: string[] = [];
  const visita = (nodo: ts.Node): void => {
    if (esJSDoc(nodo)) return;
    const hijos = nodo.getChildren(arbol);
    if (hijos.length === 0) {
      piezas.push(String(nodo.kind), nodo.getText(arbol));
      return;
    }
    piezas.push(String(nodo.kind), '(');
    for (const hijo of hijos) visita(hijo);
    piezas.push(')');
  };
  visita(arbol);
  return huella(piezas.join('\u0000'));
}

/** Huella semántica de un fichero del disco, relativo a `raiz`. */
export function huellaFicheroSemantico(raiz: string, relativa: string): string {
  const texto = readFileSync(`${raiz.replace(/[\\/]+$/, '')}/${relativa.replace(/\\/g, '/')}`, 'utf8');
  return huellaSemantica(texto, relativa);
}
