import { parse, type HTMLElement } from 'node-html-parser';

/**
 * Convierte escapes CSS como "\\0032" en "2".
 *
 * Se exporta porque el lector de clasificaciones tiene que hacer exactamente lo mismo con el `content` de un
 * pseudo-elemento (`#id:before{content:"\0031\0030\0037"}` es 107, y devolverlo sin decodificar deja la celda
 * sin número). Una sola definición para los dos, o un día decodifican distinto.
 */
export function decodificaContenidoCss(valor: string): string {
  return valor.replace(/\\([0-9a-f]{1,6})\s?/gi, (_m, hex: string) =>
    String.fromCodePoint(Number.parseInt(hex, 16)));
}

/**
 * Lee un número ofuscado por NFG. La página mezcla cuatro variantes:
 * texto normal, pseudo-elementos CSS, una clase fa-N calculada por ntype(), y
 * spans ocultos que suelen ser señuelos. Como guardamos outerHTML después de
 * ejecutar la página, la clase fa-N presente en el DOM ya contiene el valor real.
 */
export function numeroOfuscadoHtml(bruto: string): number | null {
  const tabla = /\[((?:\d+\s*,\s*){9,}\d+)\]/.exec(bruto)?.[1]
    ?.split(',').map((n) => Number(n.trim()));
  const digitosNtype = new Map<string, string>();
  if (tabla) {
    for (const llamada of bruto.matchAll(/ntype\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*,\s*(\d+)\s*,/gi)) {
      const posicion = Number(llamada[3]) * 10 + Number(llamada[2]);
      if (Number.isInteger(tabla[posicion])) digitosNtype.set(llamada[1]!, String(tabla[posicion]));
    }
  }

  const pseudo = new Map<string, { before?: string; after?: string }>();
  for (const estilo of bruto.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = estilo[1] ?? '';
    for (const regla of css.matchAll(/#([\w-]+):(before|after)\s*\{([^}]*)\}/gi)) {
      const declaraciones = regla[3] ?? '';
      if (/display\s*:\s*none/i.test(declaraciones)) continue;
      const contenido = /content\s*:\s*["']([^"']+)["']/i.exec(declaraciones)?.[1];
      if (!contenido) continue;
      const digitos = decodificaContenidoCss(contenido).replace(/\D/g, '');
      if (!digitos) continue;
      const id = regla[1]!;
      const posicion = regla[2]!.toLowerCase() as 'before' | 'after';
      pseudo.set(id, { ...pseudo.get(id), [posicion]: digitos });
    }
  }

  // El resultado puede tener dos cifras compuestas con mecanismos distintos
  // (por ejemplo, un pseudo-elemento "1" seguido de texto visible "5"). Se
  // reproduce el orden del DOM y se concatenan todas las piezas renderizadas.
  const limpio = bruto
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const elemento = parse(`<div>${limpio}</div>`).querySelector('div')!;
  const renderiza = (nodo: any): string => {
    if (!nodo?.tagName) return String(nodo?.rawText ?? '').replace(/\D/g, '');

    const estilo = nodo.getAttribute?.('style') ?? '';
    if (nodo.getAttribute?.('hidden') !== undefined || /display\s*:\s*none/i.test(estilo)) return '';

    const id = nodo.getAttribute?.('id') ?? '';
    const contenidoPseudo = pseudo.get(id);
    const clase = nodo.getAttribute?.('class') ?? '';
    // Si conservamos la llamada ntype(), ésta es la fuente definitiva: en las
    // capturas HTTP antiguas la clase aún es el señuelo; en Chrome puede estar
    // ya sustituida por la real.
    const icono = digitosNtype.get(id)
      ?? /(?:^|\s)fa-(\d+)(?:\s|$)/i.exec(clase)?.[1]
      ?? '';
    const hijos = (nodo.childNodes ?? []).map(renderiza).join('');
    return `${contenidoPseudo?.before ?? ''}${icono}${hijos}${contenidoPseudo?.after ?? ''}`;
  };
  const renderizado = renderiza(elemento).replace(/\D/g, '');
  if (renderizado) return Number(renderizado);

  // Fallback para HTML capturado antes de que ntype() haya modificado la clase.
  const primerNtype = digitosNtype.values().next().value;
  if (primerNtype !== undefined) return Number(primerNtype);

  // Algunas variantes antiguas sí guardaban el valor real oculto. Sólo se usa
  // cuando no existe ninguna de las señales más fiables anteriores.
  const oculto = elemento.querySelectorAll('span[style*="display:none"],span[style*="display: none"]')
    .map((n) => (n.textContent ?? '').replace(/\D/g, '')).find(Boolean);
  return oculto ? Number(oculto) : null;
}

export function numeroOfuscado(elemento: HTMLElement): number | null {
  return numeroOfuscadoHtml(elemento.innerHTML);
}
