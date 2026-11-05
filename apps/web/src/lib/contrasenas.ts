import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

/**
 * Contraseñas y tokens de sesión.
 *
 * · Contraseñas: **scrypt** (N=2^15, r=8, p=1, 64 bytes), sal aleatoria de 16 bytes y formato
 *   versionado `scrypt$N$r$p$sal$hash` en base64url. Se guarda en `app.credencial.password_hash`
 *   mediante `app.alta_cuenta`; nunca se guarda ni se registra la contraseña en claro. El coste
 *   (~100 ms en este equipo) es el que hace caro un ataque por diccionario.
 * · Comparación en tiempo constante (`timingSafeEqual`).
 * · Token de sesión: 32 bytes aleatorios en base64url. Al navegador va el token; en la base sólo su
 *   SHA-256 (`app.sesion.token_sha`). Quien lea la base no puede reutilizar una sesión.
 *
 * No importa nada de Next: se prueba sin navegador y sólo lo usan route handlers y pruebas.
 */

const N = 32_768;
const R = 8;
const P = 1;
const BYTES = 64;
const SAL = 16;
const MAXMEM = 128 * 1024 * 1024;

export const MINIMO_CONTRASENA = 10;
export const MAXIMO_CONTRASENA = 200;

/**
 * `crypto.scrypt` con promesa. `promisify` no sirve aquí: la sobrecarga con opciones se pierde en
 * los tipos y TypeScript cree que sobran argumentos; envolverla a mano es más honesto y no cambia
 * nada en ejecución.
 */
function deriva(contrasena: string, sal: Buffer, bytes: number, opciones: ScryptOptions): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    scryptCallback(contrasena, sal, bytes, opciones, (error, clave) => {
      if (error) rechazar(error);
      else resolver(clave);
    });
  });
}

/** Derivación lenta de la contraseña. La sal es nueva en cada llamada. */
export async function hashContrasena(contrasena: string): Promise<string> {
  const sal = randomBytes(SAL);
  const derivada = await deriva(contrasena.normalize('NFKC'), sal, BYTES, {
    N, r: R, p: P, maxmem: MAXMEM,
  });
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64url')}$${derivada.toString('base64url')}`;
}

/**
 * ¿Esta contraseña corresponde a este hash? Nunca lanza: un hash corrupto o de otro formato es
 * simplemente «no». Los parámetros se leen del propio hash para poder subir el coste en el futuro
 * sin invalidar las cuentas ya creadas.
 */
export async function verificaContrasena(contrasena: string, almacenado: string): Promise<boolean> {
  const partes = almacenado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const n = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (n < 1024 || n > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 8) return false;

  let sal: Buffer;
  let esperado: Buffer;
  try {
    sal = Buffer.from(partes[4]!, 'base64url');
    esperado = Buffer.from(partes[5]!, 'base64url');
  } catch {
    return false;
  }
  if (sal.length < 8 || esperado.length < 16) return false;

  try {
    // El mismo coste declarado, con el margen que pide Node para N·r (32·N·r bytes como mínimo).
    const derivada = await deriva(contrasena.normalize('NFKC'), sal, esperado.length, {
      N: n, r, p, maxmem: Math.max(MAXMEM, 32 * n * r * 2),
    });
    return derivada.length === esperado.length && timingSafeEqual(derivada, esperado);
  } catch {
    return false;
  }
}

/** SHA-256 en hexadecimal minúsculas. Se usa para el token de sesión y para el correo en intentos. */
export function sha256Hex(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

/** Token de sesión nuevo. Se envía al navegador; en la base sólo queda su SHA-256. */
export function tokenDeSesion(): string {
  return randomBytes(32).toString('base64url');
}
