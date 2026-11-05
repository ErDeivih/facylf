import type { Consulta } from './contratos';

/**
 * La cuenta de la persona que tiene la sesión abierta (pantalla «Mi cuenta»).
 *
 * Todo sale de una función SQL ya existente, `app.perfil(user)`, que devuelve UNA fila con los datos
 * de la cuenta, el paquete, las capacidades, los contadores de favoritos/avisos/dispositivos y las
 * preferencias. Esa función la ejecuta `facylf_app` y recibe el `user_id` de la sesión, nunca de la
 * URL: la página no puede pedir la cuenta de otra persona.
 *
 * El correo no se incluye: `facylf_app` no tiene permiso de lectura sobre `app.credencial` (a
 * propósito). La pantalla lo dice en vez de inventar una dirección o de enseñar el identificador
 * interno de la cuenta. Para enseñarlo enmascarado hace falta una función SQL que lo exponga; queda
 * anotado como pendiente en el WALL.
 *
 * `app.perfil` devuelve `date` y `timestamptz` como objetos de `pg`; la normalización a texto la hace
 * `lib/cuenta-pantalla.ts`, que es lógica pura y se prueba sin base.
 */

/** Las preferencias de aviso tal y como las guarda `app.preferencia_aviso`. */
export type PreferenciasAviso = {
  en_app: boolean;
  push: boolean;
  correo: 'nunca' | 'al_momento' | 'resumen';
  hora_resumen: string;
  silencio_desde: string | null;
  silencio_hasta: string | null;
  eventos: string[];
};

/** Una fila de `app.perfil`, con los tipos que devuelve el driver. */
export type FilaPerfilCuenta = {
  user_id: string;
  nombre: string | null;
  rol: string;
  estado: string;
  paquete: string | null;
  paquete_nombre: string | null;
  valido_hasta: string | Date | null;
  zona_horaria: string;
  creado_en: string | Date;
  capacidades: string[];
  favoritos: number;
  avisos_sin_leer: number;
  dispositivos_push: number;
  preferencias: PreferenciasAviso | null;
};

/**
 * La cuenta de la sesión. Parámetros: (1) user_id de la sesión.
 *
 * Se ejecuta con el rol `facylf_app` (lo declara `rol: 'app'`); la página de cuenta no se cachea entre
 * usuarios. Si la base no responde, la página enseña un estado honesto y no una cuenta vacía.
 */
export const PERFIL_DE_LA_CUENTA: Consulta<FilaPerfilCuenta> = {
  nombre: 'perfil-de-la-cuenta',
  descripcion: 'Datos, paquete, capacidades, contadores y preferencias de aviso de la cuenta de la sesión.',
  plan: 'indexado',
  rol: 'app',
  presupuestoMs: 100,
  columnas: ['user_id', 'nombre', 'rol', 'estado', 'paquete', 'paquete_nombre', 'valido_hasta', 'zona_horaria',
    'creado_en', 'capacidades', 'favoritos', 'avisos_sin_leer', 'dispositivos_push', 'preferencias'],
  sql: `select * from app.perfil($1) limit 1`,
};

/** Parámetros de ejemplo para la prueba de contrato: un usuario que no existe devuelve cero filas. */
export const PARAMETROS_MI_CUENTA: Record<string, readonly unknown[]> = {
  'perfil-de-la-cuenta': ['usuario-inexistente'],
};

export const CONSULTAS_MI_CUENTA = [PERFIL_DE_LA_CUENTA] as const;
