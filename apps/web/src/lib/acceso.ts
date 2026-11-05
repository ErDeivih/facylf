/**
 * Constantes de la pantalla de acceso (`/entrar`).
 *
 * El registro real todavía no existe: estas dos piezas son lo único que necesita saber la interfaz
 * hoy. El mensaje es el estado honesto que se enseña al pulsar cualquier acción del formulario y no
 * promete ninguna función que aún no esté construida; el mínimo de contraseña es el del prototipo
 * (tablero 13) y se aplica en el atributo `minLength`, para que cuando se conecte el alta no haya que
 * reescribir el formulario.
 *
 * Vive aparte de los componentes para poder probarlo sin renderizar y para que los dos formularios
 * digan exactamente lo mismo.
 */

/** Lo que se enseña cuando se pulsa cualquier acción de los formularios. */
export const MENSAJE_CUENTAS_CERRADAS = 'Las cuentas todavía no están abiertas.';

/** Longitud mínima de una contraseña nueva, la que anuncia el prototipo. */
export const MINIMO_CONTRASENA = 10;
