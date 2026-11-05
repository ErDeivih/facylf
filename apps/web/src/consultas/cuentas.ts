import type { Consulta } from './contratos';

/**
 * Consultas de cuenta que se ejecutan con el rol `facylf_app` (0050). Ninguna se cachea entre
 * usuarios: llevan el `user_id` de la sesión o el correo del intento, nunca un id de la URL.
 *
 * Las ESCRITURAS (alta, sesión, favoritos) no están en este catálogo porque no son consultas de
 * lectura y no se miden igual; viven en `lib/cuentas-db.ts`, siempre con parámetros.
 */

export type FilaModoRegistro = { modo: string };

/** Modo vigente de registro (`invitacion`, `aprobacion` o `abierto`). Parámetros: ninguno. */
export const MODO_REGISTRO: Consulta<FilaModoRegistro> = {
  nombre: 'modo-registro',
  rol: 'app',
  descripcion: 'Modo de registro vigente, para redactar el alta de la pantalla de entrada.',
  plan: 'indexado',
  presupuestoMs: 50,
  columnas: ['modo'],
  sql: `select valor as modo from app.ajuste where clave = 'registro_modo'`,
};

export type FilaCredencial = {
  user_id: string;
  password_hash: string;
  estado: string;
  activo: boolean;
  valido_hasta: string | null;
  nombre_visible: string | null;
  rol: string;
  paquete: string | null;
};

/**
 * Credencial por correo normalizado. Devuelve el hash **sólo al servidor**: se usa para verificar la
 * contraseña con scrypt y no se envía al navegador en ninguna respuesta. Parámetros: (1) correo.
 */
export const CREDENCIAL_POR_CORREO: Consulta<FilaCredencial> = {
  nombre: 'credencial-por-correo',
  rol: 'app',
  descripcion: 'Credencial y estado de la cuenta para verificar una contraseña en el servidor.',
  plan: 'indexado',
  presupuestoMs: 100,
  columnas: ['user_id', 'password_hash', 'estado', 'activo', 'valido_hasta', 'nombre_visible', 'rol', 'paquete'],
  sql: `select * from app.credencial_por_correo($1)`,
};

export type FilaSesion = {
  user_id: string;
  nombre_visible: string | null;
  rol: string;
  paquete: string | null;
  expira_en: string | Date;
};

/** Sesión válida a partir del SHA-256 del token. Parámetros: (1) token_sha. */
export const SESION_POR_TOKEN: Consulta<FilaSesion> = {
  nombre: 'sesion-por-token',
  rol: 'app',
  descripcion: 'Sesión vigente y cuenta activa a partir del resumen SHA-256 del token.',
  plan: 'indexado',
  presupuestoMs: 100,
  columnas: ['user_id', 'nombre_visible', 'rol', 'paquete', 'expira_en'],
  sql: `select * from app.sesion_valida($1)`,
};
