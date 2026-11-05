/**
 * El estado honesto de los formularios de `/entrar`.
 *
 * La región `role="status"` está SIEMPRE en el documento, aunque no tenga texto: si se insertara
 * junto con el mensaje, algunos lectores de pantalla no lo anunciarían. Cuando el registro exista de
 * verdad, este componente se retira o se cambia por el mensaje real del servidor; mientras tanto no
 * hay ningún texto de relleno, solo el motivo por el que la acción no ha hecho nada.
 */
export function AvisoEstado({ texto }: { texto: string | null }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {texto !== null && (
        <p className="border border-[var(--borde)] bg-[var(--fondo-sutil)] px-3 py-2.5 text-tabla leading-6 text-[var(--texto)]">
          {texto}
        </p>
      )}
    </div>
  );
}
