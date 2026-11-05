import { MINIMO_CONTRASENA } from '@/lib/contrasenas';
import { Campo, CLASE_BOTON_PRIMARIO, CLASE_CONTROL } from './campos';

/**
 * Formulario de alta de `/crear-cuenta`.
 *
 * El registro está abierto: no hay código de invitación. La cuenta sirve para guardar favoritos y
 * ver sus horarios y resultados. Envía a `POST /api/cuentas/crear`, que deriva la contraseña con
 * scrypt y crea usuario y credencial en una transacción; la cuenta nace activa.
 *
 * El consentimiento dice la decisión vigente de la federación: hay consentimiento de tratamiento y
 * **los nombres de los menores se publican**; las **fotos** no.
 */
export function FormularioCrearCuenta({ volver }: { volver: string | null }) {
  return (
    <form action="/api/cuentas/crear" method="post" className="flex flex-col gap-3.5">
      <input type="hidden" name="volver" value={volver ?? ''} />

      <Campo id="alta-nombre" etiqueta="Nombre">
        <input
          id="alta-nombre"
          name="nombre"
          type="text"
          autoComplete="name"
          maxLength={60}
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
          maxLength={254}
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
          maxLength={200}
          required
          className={CLASE_CONTROL}
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

      <button type="submit" className={CLASE_BOTON_PRIMARIO}>
        Crear cuenta
      </button>
    </form>
  );
}
