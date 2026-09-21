import iconv from 'iconv-lite';
import { parse } from 'node-html-parser';

/** Los `.xls` de la federación **no son Excel**: son HTML en ISO-8859-1 con CRLF.
 *  Si los abres con una librería de Excel, fallan. Si los lees como UTF-8, se rompen
 *  las tildes y la ñ. Ver skill `parser-federacion`. */
export function decodifica(bytes: Buffer | Uint8Array): string {
  return iconv.decode(Buffer.from(bytes), 'latin1');
}

/** Decodifica las páginas HTML guardadas por distintos recolectores. Las capturas nuevas son
 * UTF-8, mientras que parte del histórico se escribió con los bytes originales Latin-1. */
export function decodificaHtml(bytes: Buffer | Uint8Array): string {
  const buffer = Buffer.from(bytes);
  // Las capturas de outerHTML se escriben como UTF-8 aunque conserven un meta charset antiguo.
  // Por eso manda la validez real de los bytes, no la declaración incluida en la página.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return iconv.decode(buffer, 'windows-1252');
  }
}

/** Normalización defensiva para fragmentos que ya llegaron doblemente codificados. */
export function normalizaTextoFederacion(valor: string): string {
  const limpio = valor.replace(/[\u00a0\s]+/g, ' ').trim();
  if (!/[ÃÂâ]/.test(limpio)) return limpio;
  // Una misma página puede mezclar contenido UTF-8 correcto y textos auxiliares
  // doblemente codificados. Convertir la cadena completa rompería "Sofía" por
  // culpa de otro fragmento como "menÃº"; se reparan sólo esas secuencias.
  return limpio.replace(/(?:Ã.|Â.|â..)+/g, (fragmento) => {
    try {
      const reparado = iconv.decode(iconv.encode(fragmento, 'windows-1252'), 'utf8');
      return reparado.includes('\uFFFD') ? fragmento : reparado;
    } catch {
      return fragmento;
    }
  });
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
