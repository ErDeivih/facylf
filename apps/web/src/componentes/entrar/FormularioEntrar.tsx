'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { MENSAJE_CUENTAS_CERRADAS } from '@/lib/acceso';
import { AvisoEstado } from './AvisoEstado';
import {
  Campo,
  CLASE_BOTON_ENLACE,
  CLASE_BOTON_PRIMARIO,
  CLASE_BOTON_SECUNDARIO,
  CLASE_CONTROL,
} from './campos';

/**
 * Bloque «Entrar» de `/entrar`.
 *
 * El formulario está preparado —etiquetas visibles, `type`, `autocomplete`, `required`, foco del
 * sistema— pero **no hay servidor de cuentas al que enviarlo**. Por eso el envío no se deja pasar: se
 * cancela y se enseña el estado honesto. El `formNoValidate` del botón existe sólo para eso: mientras
 * las cuentas estén cerradas, exigir una contraseña de 10 caracteres antes de decir que no se puede
 * entrar sería una validación inútil. Cuando exista el alta, se quita esa marca y el formulario valida
 * y envía como cualquier otro.
 *
 * Las tres acciones (entrar, enlace sin contraseña y recuperar) dicen exactamente lo mismo porque hoy
 * las tres dependen de lo mismo: que exista el servicio de cuentas.
 */
export function FormularioEntrar() {
  const [aviso, setAviso] = useState(false);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setAviso(true);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3.5">
      <Campo id="entrar-correo" etiqueta="Correo">
        <input
          id="entrar-correo"
          name="correo"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className={CLASE_CONTROL}
        />
      </Campo>

      <Campo id="entrar-contrasena" etiqueta="Contraseña">
        <input
          id="entrar-contrasena"
          name="contrasena"
          type="password"
          autoComplete="current-password"
          required
          className={CLASE_CONTROL}
        />
      </Campo>

      <button type="submit" formNoValidate className={CLASE_BOTON_PRIMARIO}>
        Entrar
      </button>

      <button type="button" onClick={() => setAviso(true)} className={CLASE_BOTON_SECUNDARIO}>
        Recibir un enlace para entrar sin contraseña
      </button>

      <button type="button" onClick={() => setAviso(true)} className={CLASE_BOTON_ENLACE}>
        He olvidado la contraseña
      </button>

      <AvisoEstado texto={aviso ? MENSAJE_CUENTAS_CERRADAS : null} />
    </form>
  );
}
