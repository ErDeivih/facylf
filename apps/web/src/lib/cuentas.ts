/**
 * Reglas y textos de las cuentas, sin Next y sin base de datos: se prueban directamente.
 *
 * Dos ideas gobiernan este fichero:
 *
 * 1. **La web nunca decide sola si un correo existe.** En la entrada, correo desconocido y contraseña
 *    incorrecta dan EXACTAMENTE el mismo texto; el intento se anota igual. El alta sí necesita
 *    mensajes concretos para el código de invitación (caducado, agotado, de otro correo), pero el
 *    correo duplicado se responde con un texto que no confirma si existe una cuenta.
 * 2. **Nada de mensajes técnicos.** Cada código de aviso tiene una frase que una persona puede
 *    entender y que le dice qué puede hacer; el código viaja en la URL, nunca el texto.
 */

/** Formato de correo: mismo criterio sencillo que el de la base, sin expresiones exóticas. */
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizaCorreo(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : '';
}

export function correoValido(correo: string): boolean {
  return correo.length >= 3 && correo.length <= 254 && CORREO.test(correo);
}

export function nombreValido(nombre: string): boolean {
  const limpio = nombre.trim();
  return limpio.length >= 1 && limpio.length <= 60;
}

export function contrasenaValida(contrasena: string): boolean {
  return contrasena.length >= 10 && contrasena.length <= 200;
}

/** Un código de invitación se normaliza a mayúsculas y sin espacios; la base también lo hace. */
export function normalizaInvitacion(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().toUpperCase() : '';
}

/**
 * Rutas internas a las que se puede volver después de entrar o crear la cuenta.
 *
 * Sólo se acepta una ruta de este sitio: empieza por `/`, no es `//` (otro host) y no lleva
 * caracteres de control. Un `volver` manipulado no puede convertirse en un redirector abierto.
 */
export function urlVolverSegura(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const ruta = valor.trim();
  if (ruta.length === 0 || ruta.length > 300) return null;
  if (!ruta.startsWith('/') || ruta.startsWith('//') || ruta.startsWith('/\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(ruta)) return null;
  return ruta;
}

/** Tipos de favorito que la interfaz puede guardar desde una ficha. */
export const TIPOS_FAVORITO = ['club', 'equipo', 'jugador'] as const;
export type TipoFavorito = (typeof TIPOS_FAVORITO)[number];

export function esTipoFavorito(valor: unknown): valor is TipoFavorito {
  return typeof valor === 'string' && (TIPOS_FAVORITO as readonly string[]).includes(valor);
}

/**
 * Los enlaces que devuelve `app.mis_accesos` son los de la web vieja (`/equipo/123`). Se traducen a
 * las rutas nuevas sin cambiar el id. Lo que no se reconoce no se enlaza: mejor texto sin enlace que
 * un enlace a una pantalla que no existe.
 */
export function rutaDeAcceso(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url.startsWith('/')) return null;
  const prefijos: ReadonlyArray<readonly [string, string]> = [
    ['/equipo/', '/explorar/equipo/'],
    ['/club/', '/explorar/club/'],
    ['/jugador/', '/explorar/jugador/'],
    ['/competicion/', '/explorar/competicion/'],
    ['/acta/', '/explorar/acta/'],
  ];
  for (const [viejo, nuevo] of prefijos) {
    if (url.startsWith(viejo)) return `${nuevo}${url.slice(viejo.length)}`;
  }
  if (url.startsWith('/explorar/')) return url;
  return null;
}

/** Estado de la cuenta a partir de la credencial. La entrada sólo crea sesión si es `ok`. */
export type EstadoCuenta = 'ok' | 'pendiente' | 'bloqueada' | 'caducada';
export function estadoDeCredencial(cred: {
  estado: string; activo: boolean; valido_hasta: string | Date | null;
}): EstadoCuenta {
  if (cred.estado === 'pendiente') return 'pendiente';
  if (cred.estado === 'rechazado' || cred.estado === 'bloqueado' || cred.estado === 'baja' || !cred.activo) {
    return 'bloqueada';
  }
  if (cred.valido_hasta !== null) {
    const fecha = typeof cred.valido_hasta === 'string' ? cred.valido_hasta.slice(0, 10) : cred.valido_hasta.toISOString().slice(0, 10);
    if (fecha < new Date().toISOString().slice(0, 10)) return 'caducada';
  }
  return 'ok';
}

/**
 * Textos de los avisos. La URL sólo lleva el código; nunca se refleja texto libre del usuario.
 * «Correo o contraseña incorrectos» es el mismo para un correo que no existe y para una contraseña
 * equivocada, a propósito.
 */
export const TEXTOS_AVISO: Readonly<Record<string, string>> = {
  'origen': 'No se ha podido completar la operación. Recarga la página y vuelve a intentarlo.',
  'datos': 'Faltan datos. Revisa el formulario y vuelve a enviarlo.',
  'credenciales': 'Correo o contraseña incorrectos.',
  'intentos': 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
  'pendiente': 'Tu cuenta está pendiente de aprobación. Todavía no puedes entrar.',
  'bloqueada': 'Esta cuenta no puede entrar. Habla con quien administra la plataforma.',
  'caducada': 'Tu acceso ha caducado.',
  'sesion': 'Entra para ver esa página.',
  'no-disponible': 'No se puede completar ahora mismo. Vuelve a intentarlo en un momento.',
  'correo': 'Escribe un correo válido.',
  'nombre': 'Escribe un nombre de hasta 60 caracteres.',
  'contrasena': 'La contraseña debe tener entre 10 y 200 caracteres.',
  'acepto': 'Tienes que aceptar el uso de los datos para crear la cuenta.',
  'invitacion-requerida': 'Hace falta un código de invitación para crear la cuenta.',
  'invitacion': 'Ese código de invitación no existe.',
  'invitacion-caducada': 'Ese código de invitación ha caducado.',
  'invitacion-agotada': 'Ese código de invitación ya se ha usado.',
  'invitacion-otro-correo': 'Ese código de invitación no corresponde a este correo.',
  'registro': 'No se ha podido crear la cuenta. Si ya tienes una, entra con tu correo.',
  'registro-pendiente': 'Cuenta creada. Queda pendiente de aprobación; podrás entrar cuando la aprueben.',
  'saliste': 'Has cerrado la sesión.',
};

export function textoAviso(codigo: unknown): string | null {
  if (typeof codigo !== 'string') return null;
  return TEXTOS_AVISO[codigo] ?? null;
}

/**
 * Traduce el error que lanza la base (`INVITACION_CADUCADA`…) al código de aviso de la web.
 * Cualquier otra cosa es `registro` o `no-disponible`, nunca el texto crudo del motor.
 */
export function avisoDeErrorRegistro(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  const mapa: ReadonlyArray<readonly [string, string]> = [
    ['CORREO_YA_REGISTRADO', 'registro'],
    ['CORREO_NO_VALIDO', 'correo'],
    ['CONTRASENA_NO_VALIDA', 'contrasena'],
    ['CUENTA_NO_VALIDA', 'registro'],
    ['INVITACION_NO_EXISTE', 'invitacion'],
    ['INVITACION_CADUCADA', 'invitacion-caducada'],
    ['INVITACION_AGOTADA', 'invitacion-agotada'],
    ['INVITACION_DE_OTRO_CORREO', 'invitacion-otro-correo'],
    ['REGISTRO_SOLO_CON_INVITACION', 'invitacion-requerida'],
  ];
  return mapa.find(([codigo]) => texto.includes(codigo))?.[1] ?? 'no-disponible';
}
