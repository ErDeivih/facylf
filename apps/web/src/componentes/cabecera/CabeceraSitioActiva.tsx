'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { esRutaConTema, temaDeCookies, type Tema } from '@/lib/tema';
import { CabeceraSitio } from './CabeceraSitio';
import { seccionActiva } from './activo';

/**
 * La cabecera, decidiendo su sección activa con la ruta actual.
 *
 * Es el único trozo de la cabecera que sabe de Next y de la ruta: el layout de servidor monta este
 * envoltorio y `CabeceraSitio` sigue siendo una pieza pura que se puede renderizar y probar sola.
 *
 * El tema del **primer render** no se decide aquí: llega del layout, que resolvió la cookie y la
 * ruta en el servidor y dejó `<html data-tema>` escrito. Lo que sí se hace aquí es recolocarlo al
 * navegar: el layout raíz es compartido y no se vuelve a pintar, así que al pasar de una ruta
 * migrada a una vieja (o al revés) hay que poner el tema del documento y el del botón donde toca.
 * En las viejas, siempre claro; en las migradas, lo que diga la cookie.
 */
export function CabeceraSitioActiva({
  tema: temaDelServidor,
  permiteTema: permiteEnServidor,
  conSesion = false,
}: {
  tema: Tema;
  permiteTema: boolean;
  conSesion?: boolean;
}) {
  const ruta = usePathname();
  const permiteTema = ruta ? esRutaConTema(ruta) : permiteEnServidor;
  const [tema, setTema] = useState<Tema>(permiteTema ? temaDelServidor : 'claro');
  const rutaAnterior = useRef(ruta);

  useEffect(() => {
    // El primer render no se toca: el servidor ya dejó el atributo bien.
    if (rutaAnterior.current === ruta) return;
    rutaAnterior.current = ruta;
    const efectivo: Tema = permiteTema ? temaDeCookies(document.cookie) : 'claro';
    document.documentElement.dataset.tema = efectivo;
    setTema(efectivo);
  }, [ruta, permiteTema]);

  return <CabeceraSitio activo={seccionActiva(ruta)} tema={tema} permiteTema={permiteTema} conSesion={conSesion} />;
}
