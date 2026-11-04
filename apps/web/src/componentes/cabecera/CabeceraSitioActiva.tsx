'use client';

import { usePathname } from 'next/navigation';
import { CabeceraSitio } from './CabeceraSitio';
import { seccionActiva } from './activo';

/**
 * La cabecera, decidiendo su sección activa con la ruta actual.
 *
 * Es el único trozo de la cabecera que sabe de Next y de la ruta: el layout de servidor monta este
 * envoltorio y `CabeceraSitio` sigue siendo una pieza pura que se puede renderizar y probar sola.
 */
export function CabeceraSitioActiva() {
  const ruta = usePathname();
  return <CabeceraSitio activo={seccionActiva(ruta)} />;
}
