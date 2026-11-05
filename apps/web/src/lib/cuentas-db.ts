import { ejecutaConsulta, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { CREDENCIAL_POR_CORREO, MODO_REGISTRO, SESION_POR_TOKEN, type FilaCredencial, type FilaSesion } from '@/consultas/cuentas';
import { MIS_ACCESOS, type FilaAcceso } from '@/consultas/usuario';
import { sha256Hex, tokenDeSesion } from './contrasenas';
import type { TipoFavorito } from './cuentas';

/**
 * Operaciones de cuenta contra PostgreSQL con el rol `facylf_app`.
 *
 * Regla que no se negocia: **el `user_id` sale siempre de la sesión**, nunca de la URL, de un campo
 * del formulario ni de una cabecera. Las funciones de esta capa reciben el id ya resuelto por
 * `lib/sesion.ts` y no lo aceptan de otra parte.
 *
 * Las escrituras se hacen con funciones SQL (`app.alta_cuenta`, `app.crea_sesion`,
 * `app.guarda_favorito`…) y en ningún caso concatenando valores: todo va por parámetros.
 */

export async function modoRegistro(): Promise<string | null> {
  try {
    const filas = await ejecutaConsulta<{ modo: string }>(MODO_REGISTRO);
    return filas[0]?.modo ?? null;
  } catch {
    return null;
  }
}

/** Credencial por correo, o `null` si no existe (la entrada no distingue ese caso en el mensaje). */
export async function credencialDe(correo: string): Promise<FilaCredencial | null> {
  const filas = await ejecutaConsulta<FilaCredencial>(CREDENCIAL_POR_CORREO, [correo]);
  return filas[0] ?? null;
}

/** Segundos que faltan para poder volver a intentar la entrada (0 = adelante). */
export async function esperaDeEntrada(correo: string): Promise<number> {
  const filas = await consulta<{ segundos: number }>(
    'select app.espera_entrada($1) as segundos', [correo], { rol: 'app' },
  );
  return Number(filas[0]?.segundos ?? 0);
}

/** Anota un intento (también si el correo no existe: así no se distingue desde fuera). */
export async function anotaEntrada(correo: string, correcta: boolean): Promise<void> {
  await consulta('select app.anota_entrada($1, $2)', [correo, correcta], { rol: 'app' });
}

/**
 * Crea la cuenta completa (usuario + credencial) dentro de una transacción de la base.
 * Devuelve `activo` o `pendiente` según `app.ajuste.registro_modo`.
 */
export async function altaCuenta(datos: {
  userId: string; correo: string; passwordHash: string; codigo: string | null; nombre: string;
}): Promise<string> {
  const filas = await consulta<{ estado: string }>(
    'select app.alta_cuenta($1, $2, $3, $4, $5) as estado',
    [datos.userId, datos.correo, datos.passwordHash, datos.codigo, datos.nombre],
    { rol: 'app' },
  );
  return filas[0]?.estado ?? 'pendiente';
}

/** Crea una sesión y devuelve el token que va al navegador (en la base queda su SHA-256). */
export async function creaSesionPara(userId: string): Promise<string> {
  const token = tokenDeSesion();
  await consulta('select app.crea_sesion($1, $2)', [userId, sha256Hex(token)], { rol: 'app' });
  return token;
}

/** Sesión vigente por token, o `null` si el token no vale, caducó o la cuenta no está activa. */
export async function sesionPorToken(token: string): Promise<FilaSesion | null> {
  const filas = await ejecutaConsulta<FilaSesion>(SESION_POR_TOKEN, [sha256Hex(token)]);
  return filas[0] ?? null;
}

/** Cierra la sesión del token (idempotente: si ya no existe, no pasa nada). */
export async function cierraSesionPorToken(token: string): Promise<void> {
  await consulta('select app.cierra_sesion($1)', [sha256Hex(token)], { rol: 'app' });
}

/** Borra sesiones caducadas. Se llama al entrar y desde la purga programada. */
export async function limpiaSesiones(): Promise<number> {
  const filas = await consulta<{ limpia_sesiones: number }>('select app.limpia_sesiones()', [], { rol: 'app' });
  return Number(filas[0]?.limpia_sesiones ?? 0);
}

/** Id del favorito si el usuario ya sigue esta entidad, o `null`. */
export async function estadoFavorito(userId: string, tipo: TipoFavorito, entidadId: number): Promise<number | null> {
  const filas = tipo === 'equipo'
    ? await consulta<{ id: string | null }>(
      'select app.es_favorito_equipo($1, $2) as id', [userId, entidadId], { rol: 'app' },
    )
    : await consulta<{ id: string | null }>(
      'select app.es_favorito($1, $2, $3) as id', [userId, tipo, entidadId], { rol: 'app' },
    );
  const id = filas[0]?.id;
  return id === null || id === undefined ? null : Number(id);
}

/** Guarda un favorito (idempotente). Devuelve el id. */
export async function guardaFavorito(userId: string, tipo: TipoFavorito, entidadId: number, etiqueta: string): Promise<number> {
  const filas = tipo === 'equipo'
    ? await consulta<{ id: string }>(
      'select app.guarda_favorito_equipo($1, $2, $3) as id', [userId, entidadId, etiqueta], { rol: 'app' },
    )
    : await consulta<{ id: string }>(
      'select app.guarda_favorito($1, $2, $3, $4) as id', [userId, tipo, entidadId, etiqueta], { rol: 'app' },
    );
  return Number(filas[0]?.id);
}

/** Quita un favorito del usuario. Devuelve si había algo que quitar. */
export async function quitaFavorito(userId: string, id: number): Promise<boolean> {
  const filas = await consulta<{ quita_favorito: boolean }>(
    'select app.quita_favorito($1, $2) as quita_favorito', [userId, id], { rol: 'app' },
  );
  return filas[0]?.quita_favorito === true;
}

/** Favoritos con su nombre actual, último resultado y próximo partido. */
export async function misAccesos(userId: string): Promise<FilaAcceso[]> {
  return ejecutaConsulta<FilaAcceso>(MIS_ACCESOS, [userId]);
}
