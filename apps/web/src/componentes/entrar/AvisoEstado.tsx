/**
 * Mensaje de estado de la entrada y del alta.
 *
 * La región `role="status"` está SIEMPRE en el documento, aunque no tenga texto: si se insertara
 * junto con el mensaje, algunos lectores de pantalla no lo anunciarían. El texto que llega ya está
 * elegido en el servidor a partir de un código (nunca se refleja texto libre de la URL).
 */
export function AvisoEstado({ texto }: { texto: string | null }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {texto !== null && (
        <p className="m-0 rounded-[var(--radius-md)] border border-[var(--borde-fuerte)] bg-[var(--fondo-sutil)] px-3 py-2.5 text-tabla font-semibold leading-6 text-[var(--texto)]">
          {texto}
        </p>
      )}
    </div>
  );
}
