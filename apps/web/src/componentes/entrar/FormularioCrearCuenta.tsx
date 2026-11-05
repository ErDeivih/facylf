'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { MENSAJE_CUENTAS_CERRADAS, MINIMO_CONTRASENA } from '@/lib/acceso';
import { AvisoEstado } from './AvisoEstado';
import {
  Campo,
  CLASE_BOTON_PRIMARIO,
  CLASE_CONTROL,
} from './campos';

/**
 * Bloque «Crear cuenta» de `/entrar`.
 *
 * Reproduce el tablero 13 con el sistema de diseño actual. No hay alta todavía: el botón no envía
 * nada y enseña el estado honesto. Se mantienen los campos y sus atributos (`type`, `autocomplete`,
 * `minLength`, `required`) porque son el contrato que tendrá que cumplir el alta cuando exista; el
 * `formNoValidate` del botón es lo único que se quita entonces.
 *
 * El consentimiento dice la decisión vigente de la federación: hay consentimiento de tratamiento y
 * **los nombres de los menores se publican**; las **fotos** no. La frase del prototipo decía lo
 * contrario y no se copia.
 */
export function FormularioCrearCuenta() {
  const [aviso, setAviso] = useState(false);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setAviso(true);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3.5">
      <Campo id="alta-nombre" etiqueta="Nombre">
        <input
          id="alta-nombre"
          name="nombre"
          type="text"
          autoComplete="name"
          required
          className={CLASE_CONTROL}
        />
      </Campo>

      <Campo id="alta-correo" etiqueta="Correo">
        <input
          id="alta-correo"
          name="correo"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className={CLASE_CONTROL}
        />
      </Campo>

      <Campo id="alta-contrasena" etiqueta="Contraseña" ayuda={`(${MINIMO_CONTRASENA} caracteres o más)`}>
        <input
          id="alta-contrasena"
          name="contrasena"
          type="password"
          autoComplete="new-password"
          minLength={MINIMO_CONTRASENA}
          required
          className={CLASE_CONTROL}
        />
      </Campo>

      <Campo id="alta-invitacion" etiqueta="Código de invitación">
        <input
          id="alta-invitacion"
          name="invitacion"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          className={`${CLASE_CONTROL} tracking-[0.06em]`}
        />
      </Campo>

      <label className="flex items-start gap-2.5 text-tabla leading-6 text-[var(--texto)]">
        <input
          id="alta-acepto"
          name="acepto"
          type="checkbox"
          required
          className="mt-0.5 size-[18px] shrink-0 accent-[var(--accion)]"
        />
        <span>
          Acepto el uso privado de mis datos. La federación tiene consentimiento para publicar los
          nombres de los menores; las fotos no se publican.
        </span>
      </label>

      <button type="submit" formNoValidate className={CLASE_BOTON_PRIMARIO}>
        Crear cuenta
      </button>

      <AvisoEstado texto={aviso ? MENSAJE_CUENTAS_CERRADAS : null} />
    </form>
  );
}
