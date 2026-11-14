'use client';

import { useEffect } from 'react';
import { ErrorRecuperable } from '@/componentes/base';

/**
 * Límite de error de toda la aplicación.
 *
 * `DESIGN.md` §10 exige que una pantalla no esté terminada hasta que se hayan visto sus estados
 * «vacío, parcial, error y carga». El de carga se cubrió con `loading.tsx` en las tres fichas; el de
 * error no existía en ningún sitio, así que este fichero cierra el cuarto. Va en la raíz a propósito:
 * un límite por ruta habría dejado fuera cualquier página que se añada después, y el fallo más
 * probable de esta web no es un `404` sino **el canónico no disponible**, que afecta a todas por igual.
 *
 * Tres decisiones que se ven aquí:
 *
 * 1. **No se enseña `error.message`.** Un mensaje de excepción puede llevar la cadena de conexión, el
 *    nombre de una tabla o una ruta del sistema. Lo que se enseña es `digest`, el identificador que
 *    Next genera para el error del servidor: sirve para cruzarlo con el registro y no revela nada. Es
 *    la regla de `SISTEMA-DISENO.md` §5: «sin SQL, sin rutas, sin traza».
 * 2. **El reintento es `reset()`, no una recarga.** Vuelve a renderizar el segmento sin tirar la
 *    página entera, que es lo que hace un enlace de recarga.
 * 3. **El error se registra en la consola del cliente además de en el servidor.** Si el servidor ya lo
 *    anotó, esto es redundante y no molesta; si el fallo ocurrió al hidratar, es lo único que queda.
 */
export default function ErrorDeLaAplicacion({ error, reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <h2 className="font-display text-3xl uppercase">Algo ha fallado</h2>
      <p className="mt-1 mb-5 max-w-3xl text-tabla leading-6 text-[var(--texto-suave)]">
        Esta página no se ha podido componer. No es que no haya datos: es que ha fallado algo al
        pedirlos. El resto de la web sigue disponible.
      </p>
      <ErrorRecuperable
        mensaje="No se ha podido cargar esta página."
        incidencia={error.digest ?? 'sin identificador del servidor'}
        alReintentar={reset}
      />
    </>
  );
}
