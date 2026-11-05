import { MINIMO_CONTRASENA } from '@/lib/contrasenas';
import { Campo, CLASE_BOTON_PRIMARIO, CLASE_CONTROL } from './campos';

/**
 * Bloque «Entrar» de `/entrar`.
 *
 * Es un formulario HTML normal que envía a `POST /api/cuentas/entrar`: funciona sin JavaScript y el
 * navegador valida `type=email`, `required` y `autocomplete`. No hay enlace mágico ni recuperación de
 * contraseña todavía: no hay correo saliente, así que no se promete lo que no existe.
 */
export function FormularioEntrar({ volver }: { volver: string | null }) {
  return (
    <form action="/api/cuentas/entrar" method="post" className="flex flex-col gap-3.5">
      <input type="hidden" name="volver" value={volver ?? ''} />

      <Campo id="entrar-correo" etiqueta="Correo">
        <input
          id="entrar-correo"
          name="correo"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
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
          minLength={MINIMO_CONTRASENA}
          maxLength={200}
          required
          className={CLASE_CONTROL}
        />
      </Campo>

      <button type="submit" className={CLASE_BOTON_PRIMARIO}>
        Entrar
      </button>
    </form>
  );
}
