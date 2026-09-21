/**
 * Tipos del CLI de reconstrucción.
 *
 * El CLI es un `.mjs` y las pruebas son `.ts` que se comprueban con `tsc -b`: sin esta declaración, la
 * importación de `reconstruir-cola.mjs` no resuelve y `pnpm lint` falla. Se declara la superficie REAL
 * —no un `any`— para que una prueba que llame a una función con otros argumentos no compile, en vez de
 * fallar en tiempo de ejecución.
 *
 * TypeScript resuelve `./reconstruir-cola.mjs` contra `./reconstruir-cola.d.mts`, así que este fichero
 * tiene que estar al lado del CLI y llamarse así.
 */
import type {
  Ambiguedad, CambioDeterminista, JornadaManifiesto, Manifiesto, ResumenManifiesto,
} from '../packages/ingesta/src/reconstruccion-cola/manifiesto.js';
import type { FilaCola } from '../packages/ingesta/src/reconstruccion-cola/filas.js';
import type { VersionReconstruccion } from '../packages/ingesta/src/reconstruccion-cola/version.js';

export type OpcionesRaiz = {
  raiz?: string; raizCodigo?: string; forzar?: boolean; retirar?: boolean;
  /** Recupera los partidos desplazados corrigiendo la pareja con lo que dice el acta. */
  recuperar?: boolean;
};

export function raizDe(opciones?: OpcionesRaiz): string;
export function raizCodigoDe(opciones?: OpcionesRaiz): string;
export function rutaCola(federacion: string, opciones?: OpcionesRaiz): string;
export function carpetaTrabajo(opciones?: OpcionesRaiz): string;
export function rutaAplicado(federacion: string, id: string, opciones?: OpcionesRaiz): string;
export function rutaBloqueo(federacion: string, opciones?: OpcionesRaiz): string;
export function tomaBloqueo(federacion: string, opciones?: OpcionesRaiz): string;
export function sueltaBloqueo(federacion: string, opciones?: OpcionesRaiz): void;

export function leerArchivo(ruta: string): { contenido: string; ruta: string } | null;

export function simula(federacion: string, opciones?: OpcionesRaiz): Manifiesto;
export function guardaManifiesto(manifiesto: Manifiesto, opciones?: OpcionesRaiz): string;
export function leeManifiesto(federacion: string, id: string, opciones?: OpcionesRaiz): Manifiesto;
export function invalidaManifiesto(federacion: string, id: string, motivo: string, opciones?: OpcionesRaiz): string;

export function revisaAplicacion(
  federacion: string, manifiesto: Manifiesto, hechas: Set<string>, opciones?: OpcionesRaiz,
  /** El `.aplicado.json` de una invocación anterior: de ahí sale si aquella vez se retiró la fantasma. */
  previo?: Aplicado | null,
): string[];

export type Aplicado = {
  manifiesto: string; federacion: string; sello: string; ruta_backup: string; bytes_backup: number;
  ruta_diario: string; filas: number; jornadas: number; filas_nuevas: number; jornadas_nuevas: number;
  jornadas_hechas: string[]; ambiguos_excluidos: number; completo: boolean;
  /** Si esta invocación retiró las filas fantasma sin acta. */
  retirada_fantasma: boolean;
  /** Filas que esta invocación recuperó (partidos desplazados), corregidas con el acta. */
  recuperadas: number;
  /** Si esta invocación recuperó los partidos desplazados. */
  recuperar_desplazados: boolean;
};
export function aplica(federacion: string, idManifiesto: string, opciones?: OpcionesRaiz): Promise<Aplicado>;

export function verifica(
  federacion: string, idManifiesto: string, opciones?: OpcionesRaiz,
): { filas: number; correctas: number; malas: string[]; copia_previa: string; completo: boolean };

export function revierte(
  federacion: string, idManifiesto: string, opciones?: OpcionesRaiz,
): { filas: number; conflictos: number; copia_previa: string; copia_conservada: boolean };

export function huella(texto: unknown): string;
export type { Ambiguedad, CambioDeterminista, FilaCola, JornadaManifiesto, Manifiesto, ResumenManifiesto, VersionReconstruccion };
