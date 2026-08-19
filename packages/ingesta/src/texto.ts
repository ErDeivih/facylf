import iconv from 'iconv-lite';
import { parse } from 'node-html-parser';

/** Los `.xls` de la federación **no son Excel**: son HTML en ISO-8859-1 con CRLF.
 *  Si los abres con una librería de Excel, fallan. Si los lees como UTF-8, se rompen
 *  las tildes y la ñ. Ver skill `parser-federacion`. */
export function decodifica(bytes: Buffer | Uint8Array): string {
  return iconv.decode(Buffer.from(bytes), 'latin1');
}

/** Texto plano del documento, línea a línea, sin vacías.
 *  El parser del calendario trabaja sobre esta secuencia: no intenta leer filas de
 *  tabla, porque la federación anida `<table>` de forma imprevisible. */
export function lineas(html: string): string[] {
  const raiz = parse(html, { blockTextElements: { script: false, style: false } });
  for (const s of raiz.querySelectorAll('script, style')) s.remove();
  return raiz.structuredText
    .split('\n')
    .map((l) => l.replace(/[\u00a0\s]+/g, ' ').trim())
    .filter((l) => l.length > 0);
}
