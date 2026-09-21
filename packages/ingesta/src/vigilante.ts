/**
 * Vigilante de la carpeta de descargas.
 *
 * El worker automático está cerrado hasta el permiso de la delegación
 * (cliente.ts). Mientras tanto, una persona descarga los .xls a mano desde el
 * navegador — eso lo permite robots.txt, que regula rastreadores, no personas —
 * y este módulo hace el resto: detecta qué ficheros son nuevos o han cambiado
 * desde la pasada anterior y decide con qué parser se lee cada uno.
 *
 * La detección de cambios es por hash del contenido, igual que haría el worker:
 * si el fichero no cambia, no se parsea ni se toca nada.
 */

import { createHash } from 'node:crypto';

/** nombre de fichero → hash sha256 de su contenido. */
export type EstadoVigilante = Record<string, string>;

export interface Diferencias {
  nuevos: string[];
  cambiados: string[];
  borrados: string[];
}

export const sinDiferencias = (d: Diferencias): boolean =>
  d.nuevos.length === 0 && d.cambiados.length === 0 && d.borrados.length === 0;

export function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function diferencias(previo: EstadoVigilante, actual: EstadoVigilante): Diferencias {
  const nombres = [...new Set([...Object.keys(previo), ...Object.keys(actual)])].sort();
  const d: Diferencias = { nuevos: [], cambiados: [], borrados: [] };
  for (const n of nombres) {
    const antes = previo[n];
    const ahora = actual[n];
    if (antes === undefined && ahora !== undefined) d.nuevos.push(n);
    else if (antes !== undefined && ahora === undefined) d.borrados.push(n);
    else if (antes !== ahora) d.cambiados.push(n);
  }
  return d;
}

export type TipoFichero = 'calendario' | 'clasificacion' | 'desconocido';

/** Los ficheros que sueltan los botones de la federación se llaman
 *  "Calendario.xls" y "Clasificacion_Excel.xls" (o similar). Si un día cambia
 *  el nombre, se mira el contenido antes que inventarse una regla. */
export function tipoDeFichero(nombre: string): TipoFichero {
  const n = nombre.toLowerCase();
  if (n.includes('clasific')) return 'clasificacion';
  if (n.includes('calendario') || n.includes('calendari')) return 'calendario';
  return 'desconocido';
}
